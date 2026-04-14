/**
 * Flex2Abi – AI Proxy Edge Function
 * Sichere serverseitige Weiterleitung zu Gemini & Groq APIs.
 * API Keys werden als Deno Environment Variables gelesen (nie an Client gesendet).
 * 
 * Deployment:
 *   supabase functions deploy ai-proxy --no-verify-jwt
 * 
 * Secrets setzen:
 *   supabase secrets set GEMINI_API_KEY=AIza...
 *   supabase secrets set GROQ_API_KEY=gsk_...
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GROQ_KEY = Deno.env.get('GROQ_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyUser(authHeader: string): Promise<boolean> {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });
        const { data: { user }, error } = await supabase.auth.getUser();
        return !!user && !error;
    } catch {
        return false;
    }
}

serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Kein Auth-Token. Bitte einloggen.' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const isValid = await verifyUser(authHeader);
    if (!isValid) {
        return new Response(JSON.stringify({ error: 'Ungültige Session. Bitte neu einloggen.' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    try {
        const { action, payload } = await req.json();

        // --- GEMINI PROXY ---
        if (action === 'gemini') {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );
            const data = await res.text();
            return new Response(data, {
                status: res.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // --- GROQ WHISPER PROXY ---
        if (action === 'groq-whisper') {
            // Client sendet Audio als Base64
            const audioBytes = Uint8Array.from(atob(payload.audioBase64), c => c.charCodeAt(0));
            const audioBlob = new Blob([audioBytes], { type: 'audio/webm' });

            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', 'whisper-large-v3');
            formData.append('language', 'de');

            const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
                body: formData
            });
            const data = await res.text();
            return new Response(data, {
                status: res.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Unbekannte Action: ' + action }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: 'Proxy-Fehler: ' + e.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
