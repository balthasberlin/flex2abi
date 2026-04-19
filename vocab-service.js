/**
 * AbiFlex - Vocab Service Module
 * Handles OCR for vocabulary lists using Gemini Vision and CSV Export.
 */

window.VocabService = (function() {
    
    // Internal helper for file to base64
    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });

    return {
        processImage: async (file, subject = 'Allgemein') => {
            const apiKey = window.CONFIG?.GEMINI_API_KEY;
            
            // Visual feedback
            if (window.UIAction) {
                window.UIAction.showVisualFeedback('Bild wird verarbeitet...', `KI extrahiert Vokabeln für ${subject}...`);
            }

            try {
                const base64Data = await fileToBase64(file);
                const prompt = `Du bist ein Sprachexperte spezialisiert auf Textextraktion aus Fotos. Deine Aufgabe: Extrahiere JEDES Vokabelpaar aus diesem Bild, egal wie komplex das Layout ist.
BEACHTE DIESE STRENGEN REGELN:
1. Erkenne automatisch die Quell- und Zielsprache (z.B. Englisch -> Deutsch).
2. Falls der Text in Spalten angeordnet ist, lese sie logisch als Paare aus (Links -> Rechts).
3. Achte EXTREM GENAU auf Sonderzeichen (Akzente, Umlaute, Tilden). Korrigiere offensichtliche Scan-Fehler (z.B. 'e' statt 'é').
4. Gib das Ergebnis AUSSCHLIESSLICH im Format "Wort; Übersetzung" aus. 
5. Ein Wort pro Zeile. Keine Einleitung, kein Markdown, keine Anführungszeichen.
6. Wenn das Bild Handschrift enthält, versuche diese so präzise wie möglich zu entziffern.
7. Falls absolut kein Text erkennbar ist, antworte nur mit "KEINE_VOKABELN".`;

                let responseText;

                // ... (API call logic remains same) ...
                if (window.CONFIG?.EDGE_FUNCTION_URL) {
                    const token = window.CloudSync?.getAuthToken ? await window.CloudSync.getAuthToken() : null;
                    if (!token) throw new Error('Nicht eingeloggt – Proxy benötigt Authentifizierung.');

                    const response = await fetch(window.CONFIG.EDGE_FUNCTION_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-authorization': `Bearer ${token}`,
                            'apikey': window.CONFIG.SUPABASE_ANON_KEY
                        },
                        body: JSON.stringify({
                            action: 'gemini',
                            payload: { 
                                contents: [{ 
                                    parts: [
                                        { text: prompt },
                                        { inline_data: { mime_type: file.type, data: base64Data } }
                                    ] 
                                }] 
                            }
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error?.message || errorData.error || `Proxy Fehler ${response.status}`);
                    }

                    const data = await response.json();
                    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                } else {
                    // Fallback Direct API
                    if (!apiKey) throw new Error('API Key fehlt!');
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ 
                                parts: [
                                    { text: prompt },
                                    { inline_data: { mime_type: file.type, data: base64Data } }
                                ] 
                            }]
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error?.message || `API Fehler ${response.status}`);
                    }

                    const data = await response.json();
                    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                }

                if (!responseText || responseText.includes('KEINE_VOKABELN')) {
                    throw new Error('Es konnten keine Vokabeln im Bild erkannt werden.');
                }

                // Robust Parsing
                // 1. Remove Markdown code blocks
                let cleanText = responseText.replace(/```(csv|text)?/gi, '').replace(/```/g, '').trim();
                
                // 2. Split into lines and filter
                const lines = cleanText.split('\n').filter(l => l.includes(';'));
                
                if (lines.length === 0) throw new Error('Das Ergebnis der KI konnte nicht korrekt verarbeitet werden (ungültiges Format).');

                let extractedCount = 0;
                lines.forEach(line => {
                    // 3. Remove quotes and split
                    const parts = line.replace(/"/g, '').split(';');
                    if (parts.length >= 2) {
                        const word = parts[0].trim();
                        const translation = parts[1].trim();
                        if (word && translation) {
                            window.StorageService.saveVocab(word, translation, subject);
                            extractedCount++;
                        }
                    }
                });

                return { success: true, count: extractedCount };

            } catch (err) {
                // Log maintained for developer info, but UI gets a clean message
                console.error("Vocab Processing Error:", err);
                if (window.UIAction) window.UIAction.showError('Fehler', 'Das Bild konnte nicht verarbeitet werden: ' + err.message);
                throw err;
            } finally {
                if (window.UIAction) window.UIAction.hideVisualFeedback();
            }
        },

        exportToCSV: () => {
            const vocab = window.StorageService.getVocabList();
            if (vocab.length === 0) {
                if (window.UIAction) window.UIAction.showError("Leere Liste", "Keine Vokabeln zum Exportieren vorhanden.");
                return;
            }

            // Create CSV Content
            let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
            csvContent += "Wort;Übersetzung;Fach;Lern-Level;Hinzugefügt am\n";
            
            vocab.forEach(v => {
                const date = new Date(v.date).toLocaleDateString('de-DE');
                csvContent += `"${v.word}";"${v.translation}";"${v.subject || 'Allgemein'}";"${v.level || 1}";"${date}"\n`;
            });

            // Trigger Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `AbiFlex_Vokabeln_${new Date().toLocaleDateString('de-DE').replace(/\./g, '-')}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };
})();
