// Konfigurationsdatei für AI Record
window.CONFIG = Object.freeze({
    // API Keys (Werden bei Nutzung der EDGE_FUNCTION_URL nicht mehr benötigt)
    GEMINI_API_KEY: "", 

    // Cloud Sync (Supabase) – Anon Key ist bewusst öffentlich (Row Level Security schützt Daten)
    SUPABASE_URL: "https://ebwlxyvdcsohsxxqmxic.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_Vz7_A2PL_iljsNy7ktTflw_9WoAMfq9",

    // High-Precision Transkription (Groq Whisper)
    GROQ_API_KEY: "", 

    // 🔐 Sicherer API-Proxy (Supabase Edge Function)
    // Wenn gesetzt, werden Gemini- und Groq-Calls über diese URL geroutet.
    // API Keys bleiben dann serverseitig und sind im Browser nicht mehr sichtbar.
    EDGE_FUNCTION_URL: "https://ebwlxyvdcsohsxxqmxic.supabase.co/functions/v1/ai-proxy"
});
