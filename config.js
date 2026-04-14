// Konfigurationsdatei für AI Record
window.CONFIG = Object.freeze({
    // Hier kannst du deinen Gemini API Key dauerhaft hinterlegen
    // Wenn EDGE_FUNCTION_URL gesetzt ist, wird dieser Key NICHT mehr verwendet (sicherer!)
    GEMINI_API_KEY: "",

    // Cloud Sync (Supabase) – Anon Key ist bewusst öffentlich (Row Level Security schützt Daten)
    SUPABASE_URL: "https://ebwlxyvdcsohsxxqmxic.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_Vz7_A2PL_iljsNy7ktTflw_9WoAMfq9",

    // High-Precision Transkription (Groq Whisper)
    // Wenn EDGE_FUNCTION_URL gesetzt ist, wird dieser Key NICHT mehr verwendet
    GROQ_API_KEY: "",

    // 🔐 Sicherer API-Proxy (Supabase Edge Function)
    // Wenn gesetzt, werden Gemini- und Groq-Calls über diese URL geroutet.
    // API Keys bleiben dann serverseitig und sind im Browser nicht mehr sichtbar.
    // Setze die URL nach dem Deployment deiner Edge Function:
    // Beispiel: "https://ebwlxyvdcsohsxxqmxic.supabase.co/functions/v1/ai-proxy"
    // Leer lassen = deaktiviert (Fallback auf direkte API-Calls mit den Keys oben)
    EDGE_FUNCTION_URL: "https://ebwlxyvdcsohsxxqmxic.supabase.co/functions/v1/ai-proxy"
});
