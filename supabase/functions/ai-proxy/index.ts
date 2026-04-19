/// <reference path="../deno.d.ts" />
/**
 * AbiFlex – AI Proxy Edge Function (v2.5)
 * Sichere serverseitige Weiterleitung zu Gemini & Groq APIs.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')?.trim();
    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')?.trim();
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const authHeader = req.headers.get('x-authorization') || req.headers.get('Authorization');
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

        // --- AI SUMMARIZATION PORT ---
        if (action === 'summarize-ai' || action === 'groq-chat' || action === 'gemini') {
            if (!GROQ_KEY) throw new Error('GROQ_API_KEY Secret fehlt.');
            
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'Du bist ein hilfreicher Assistent für Abiturienten. Fasse Unterrichtsthemen präzise und strukturiert zusammen.' },
                        { role: 'user', content: payload.prompt || payload.contents?.[0]?.parts?.[0]?.text || 'Hallo' }
                    ],
                    temperature: 0.5
                })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                return new Response(JSON.stringify({ error: `Groq Error (${res.status}): ${data.error?.message || JSON.stringify(data)}` }), {
                    status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({
                candidates: [{
                    content: { parts: [{ text: data.choices?.[0]?.message?.content || 'Fehler bei der Generierung.' }] }
                }]
            }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

            const resText = await res.text();
            if (!res.ok) {
                let errMsg = resText;
                try {
                    const errJson = JSON.parse(resText);
                    errMsg = errJson.error?.message || errMsg;
                } catch { /* use raw text */ }
                
                return new Response(JSON.stringify({ error: `Groq Error (${res.status}): ${errMsg}` }), {
                    status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(resText, {
                status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // --- ACCOUNT DELETION ---
        if (action === 'delete-account') {
            if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY Secret fehlt.');
            
            const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

            if (deleteError) throw new Error('Fehler beim Löschen des Accounts: ' + deleteError.message);

            return new Response(JSON.stringify({ success: true, message: 'Account erfolgreich gelöscht.' }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Unbekannte Action.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
