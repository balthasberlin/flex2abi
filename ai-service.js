/**
 * Flex2Abi - AI Service Module
 * Managing prompts, API communication, and text processing algorithms.
 */

window.AIService = (function() {
    
    // Internal helper for rate limiting
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    return {
        // --- TEXT PROCESSING ---
        chunkText: (text, wordsPerChunk = 2500) => {
            if (!text) return [];
            const words = text.split(/\s+/);
            const chunks = [];
            for (let i = 0; i < words.length; i += wordsPerChunk) {
                chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
            }
            return chunks;
        },

        // --- PROMPT GENERATORS ---
        getChunkPrompt: (text, onlyCorrectAnswers = true) => {
            const currentDate = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            return `Du bist ein didaktischer Abitur-Tutor. Heute ist ${currentDate}.
Analysiere diesen Textabschnitt.

WICHTIG (TERMIN-RADAR):
Suche nach JEDER Erwähnung von Daten, Fristen, Klausuren, Hausaufgaben oder Abgaben.
Falls du einen Termin findest (z.B. "nächsten Freitag", "am 22.05.", "bis morgen"), berechne basierend auf dem heutigen Datum (${currentDate}) das reale Datum und gib es exakt so aus:
TERMINE: [DD.MM.YYYY] - [Ereignis]
(Mehrere Termine einfach untereinander auflisten).
HINWEIS: Ein gefundener Termin macht diesen Abschnitt RELEVANT, auch wenn der Rest nur Vorgeplänkel ist.

WICHTIG (FAKTENCHECK):
Hier findet Unterricht statt. Schüler geben oft falsche Antworten.
1. Identifiziere Fragen des Lehrers und die darauf folgenden Antworten.
2. Nimm NUR inhaltlich korrekte und vom Lehrer bestätigte Fakten in die 'Erklärung' auf. 
${!onlyCorrectAnswers ? '3. Falls ein Schüler einen inhaltlich falschen, aber für das Verständnis wichtigen Fehler gemacht hat, markiere diesen am Ende explizit als: ACHTUNG: Häufiger Irrtum: [Fehlerbeschreibung & Richtigstellung]' : '3. Ignoriere falsche Informationen restlos.'}

WICHTIG (SICHERHEITSVENTIL):
Falls der Text KEINEN fachlichen Inhalt hat (z.B. nur Mikrofontest, "Test 1 2 3", Banana, kurzes Gemurmel, Technik-Check) UND KEINE TERMINE im Text vorkommen, dann antworte NUR mit:
### Technik: Nebensächliches / Technik-Check
**Erklärung**: In diesem Abschnitt wurde lediglich die Technik geprüft oder es gab keinen unterrichtsrelevanten Inhalt.
---

Falls der Text fachlichen Inhalt hat:
AUFGABE:
1. Entferne alles Umschweifige, Füllwörter und unnötige Wiederholungen des Lehrers.
2. Erkläre das Hauptthema einfach, präzise und schülergerecht.
3. Füge einen konkreten Lerntipp ('TIPP: Verständnis-Hilfe') hinzu.

FORMAT:
### [Titel des Abschnitts]
**Erklärung**: [Der vereinfachte Text] 
${!onlyCorrectAnswers ? 'ACHTUNG: **Häufiger Irrtum**: [Wird nur ausgefüllt wenn ein relevanter Fehler vorlag]' : ''}
TIPP: **Verständnis-Hilfe**: [Ein nützlicher Tipp]
TERMINE: [Nur ausfüllen wenn Termine/Deadlines gefunden wurden, Format: DD.MM.YYYY - Ereignis]

TEXT:
${text}`;
        },

        getMasterPrompt: (processedChunks) => {
            const currentDate = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            return `Du bist ein brillanter Tutor zur Vorbereitung auf das deutsche Abitur. Heute ist ${currentDate}.
Erstelle aus diesen didaktisch aufbereiteten Häppchen eine finale, perfekt strukturierte Zusammenfassung.

WICHTIG (TERMIN-AGGREGATION):
Falls in den Häppchen Termine (Format TERMINE: DD.MM.YYYY - Ereignis) stehen, erstelle am Ende der Zusammenfassung eine Liste unter der Überschrift:
### 📅 ZENTRALE DEADLINES & TERMINE
- [DD.MM.YYYY] - [Ereignis]
Sortiere diese Liste unbedingt chronologisch!

WICHTIG (SICHERHEITSVENTIL):
Falls alle Häppchen nur Technik-Checks oder inhaltsleere Tests sind, antworte nur mit:
### Technik: Mikrofontest / Keine Fachinhalte
Es wurden keine unterrichtsrelevanten Themen in dieser Aufnahme gefunden.
---

MASTER-FORMAT:
FACH: [Schulfach]
SCHLAGWORTE: [Tag1, Tag2, Tag3]

### GLOBALER ÜBERBLICK
[Kurze Zusammenfassung]

HÄPPCHEN-DATEN:
${processedChunks.join('\n\n')}`;
        },

        // --- API CALLS ---
        callGemini: async (prompt, apiKey) => {
            // Route über Edge Function wenn konfiguriert (Keys bleiben serverseitig)
            if (window.CONFIG?.EDGE_FUNCTION_URL) {
                const token = window.CloudSync?.getAuthToken ? await window.CloudSync.getAuthToken() : null;
                if (!token) throw new Error('Nicht eingeloggt – Edge Function benötigt Authentifizierung.');

                const response = await fetch(window.CONFIG.EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'apikey': window.CONFIG.SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({
                        action: 'gemini',
                        payload: { contents: [{ parts: [{ text: prompt }] }] }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || errorData.error || `Proxy Fehler ${response.status}`);
                }

                const data = await response.json();
                const candidate = data.candidates && data.candidates[0];
                if (!candidate) throw new Error("Ladefehler: API lieferte keine verwertbare Datenstruktur.");
                if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST' || candidate.finishReason === 'OTHER') {
                    return "⚠️ KI-Filter aktiv: Ein Teil der Aufzeichnung enthielt Formulierungen, die gegen die KI-Richtlinien verstoßen.";
                }
                if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0].text) {
                    return "⚠️ KI-Warnung: Die Antwort war fehlerhaft oder leer.";
                }
                return candidate.content.parts[0].text;
            }

            // Fallback: Direkter API-Call (API Key im Client)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `API Fehler ${response.status}`);
            }

            const data = await response.json();
            const candidate = data.candidates && data.candidates[0];
            
            if (!candidate) {
                throw new Error("Ladefehler: API lieferte keine verwertbare Datenstruktur.");
            }
            
            // Safety/Filter checks
            if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST' || candidate.finishReason === 'OTHER') {
                return "⚠️ KI-Filter aktiv: Ein Teil der Aufzeichnung enthielt Formulierungen, die gegen die KI-Richtlinien verstoßen. Die Zusammenfassung wurde aus Sicherheitsgründen blockiert.";
            }

            if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0].text) {
                 return "⚠️ KI-Warnung: Die Antwort war fehlerhaft oder leer.";
            }

            return candidate.content.parts[0].text;
        },

        // --- UTILS ---
        extractDeadlines: (text) => {
            if (!text) return [];
            const found = [];
            const seen = new Set();
            const cleanText = text.replace(/\\n/g, '\n');

            // Formate erkennen:
            // 1. TERMINE: 22.05.2024 - Test
            // 2. - [22.05.2024] - Test
            // 3. - 22.05.2024: Test
            const patterns = [
                /TERMINE:\s*(\d{2}\.\d{2}\.\d{4})[\s-:]+(.+)/gi,
                /^[-*]\s*\[?(\d{2}\.\d{2}\.\d{4})\]?[\s-:]+(.+)/gm
            ];

            patterns.forEach(re => {
                let m;
                while ((m = re.exec(cleanText)) !== null) {
                    const date = m[1];
                    const task = m[2].replace(/\*/g, '').trim();
                    const key = date + task.toLowerCase();
                    if (!seen.has(key) && task.length > 2) {
                        seen.add(key);
                        found.push({ date: date, task: task });
                    }
                }
            });

            return found;
        },

        wait: async (ms) => await sleep(ms)
    };
})();
