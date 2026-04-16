/**
 * Flex2Abi – AI Proxy Edge Function (v2.3)
 * Sichere serverseitige Weiterleitung zu Gemini & Groq APIs.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
    const GROQ_KEY = Deno.env.get('GROQ_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Kein Auth-Token vorhanden.' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return new Response(JSON.stringify({ error: 'Systemfehler: Supabase URL/Key fehlen.' }), {
            status: 500, headers: corsHeaders
        });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Session ungültig.' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const contentType = req.headers.get('content-type') || '';
        let action: string;
        let payload: any = {};
        let audioFile: File | null = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            action = formData.get('action') as string;
            audioFile = formData.get('file') as File;
        } else {
            const body = await req.json();
            action = body.action;
            payload = body.payload;
        }

        // --- GROQ CHAT / SUMMARIZATION (FREE REPLACEMENT FOR GEMINI) ---
        if (action === 'groq-chat' || action === 'gemini') {
            if (!GROQ_KEY) throw new Error('GROQ_API_KEY Secret fehlt.');
            
            // Wir nutzen Llama 3.3 70B für höchste Qualität (Free Tier bei Groq)
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'Du bist ein hilfreicher Assistent für Abiturienten.' },
                        { role: 'user', content: payload.prompt || payload.contents?.[0]?.parts?.[0]?.text || 'Hallo' }
                    ],
                    temperature: 0.5
                })
            });
            
            const data = await res.json();
            
            // Wir geben das Format so zurück, dass die App es versteht (Mapping auf Gemini-Struktur falls nötig, 
            // aber wir vereinfachen es hier für den Client)
            return new Response(JSON.stringify({
                candidates: [{
                    content: { parts: [{ text: data.choices?.[0]?.message?.content || 'Fehler bei der Generierung.' }] }
                }]
            }), {
                status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // --- GROQ WHISPER (TRANSCRIPTION) ---
        if (action === 'groq-whisper') {
            if (!GROQ_KEY) throw new Error('GROQ_API_KEY Secret fehlt.');
            const groqFormData = new FormData();
            if (audioFile) {
                groqFormData.append('file', audioFile, 'audio.webm');
            } else if (payload && payload.audioBase64) {
                const audioBytes = Uint8Array.from(atob(payload.audioBase64), c => c.charCodeAt(0));
                groqFormData.append('file', new Blob([audioBytes], { type: 'audio/webm' }), 'audio.webm');
            } else {
                throw new Error('Keine Audio-Daten gefunden.');
            }
            groqFormData.append('model', 'whisper-large-v3');
            groqFormData.append('language', 'de');

            const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
                body: groqFormData
            });
            return new Response(await res.text(), {
                status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Unbekannte Action.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
