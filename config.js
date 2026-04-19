// Konfigurationsdatei für AI Record
window.CONFIG = Object.freeze({
    // API Keys (Werden bei Nutzung der EDGE_FUNCTION_URL nicht mehr benötigt)
    GEMINI_API_KEY: "", 

    // Cloud Sync (Supabase) – Anon Key ist bewusst öffentlich (Row Level Security schützt Daten)
    SUPABASE_URL: "https://ebwlxyvdcsohsxxqmxic.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVid2x4eXZkY3NvaHN4eHFteGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTU5ODksImV4cCI6MjA5MTY3MTk4OX0.HHJ9zH-Mj-pmELSvI2ny046377CyZxjAN7WUkk5p3AE",

    // High-Precision Transkription (Groq Whisper)
    GROQ_API_KEY: "", 

    // 🔐 Sicherer API-Proxy (Supabase Edge Function)
    // Wenn gesetzt, werden Gemini- und Groq-Calls über diese URL geroutet.
    // API Keys bleiben dann serverseitig und sind im Browser nicht mehr sichtbar.
    EDGE_FUNCTION_URL: "https://ebwlxyvdcsohsxxqmxic.supabase.co/functions/v1/ai-proxy"
});

// ZENTRALE SUPABASE INITIALISIERUNG
// Versuche den Client zu erstellen, sobald die Library (via CDN) geladen ist.
(function initSupabase() {
    const create = () => {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            window.supabaseClient = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
        } else {
            // Falls das Script noch nicht geladen ist, kurz warten
            setTimeout(create, 50);
        }
    };
    create();
})();
