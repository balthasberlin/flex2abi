/**
 * Flex2Abi - Vocab Service Module
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
                const prompt = `Du bist ein Sprachexperte. Extrahiere alle Vokabeln aus diesem Bild. 
BEACHTE DIESE REGELN:
1. Erkenne die Sprache der Vokabeln (z.B. Englisch, Französisch, Spanisch, Latein).
2. Achte EXTREM GENAU auf Sonderzeichen wie Akzente (é, à, ê), Umlaute (ä, ö, ü), Tilden (ñ) oder Cedille (ç).
3. Gib das Ergebnis ausschließlich im CSV-Format aus (Wort; Übersetzung).
4. Keine Einleitung, kein "Hier sind die Vokabeln". Nur die CSV-Zeilen.
5. Beispiel-Format: "élève; Schüler" oder "mañana; Morgen".`;

                let responseText;

                // Use Proxy if configured
                if (window.CONFIG?.EDGE_FUNCTION_URL) {
                    const token = window.CloudSync?.getAuthToken ? await window.CloudSync.getAuthToken() : null;
                    if (!token) throw new Error('Nicht eingeloggt – Proxy benötigt Authentifizierung.');

                    const response = await fetch(window.CONFIG.EDGE_FUNCTION_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
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

                if (!responseText) throw new Error('Keine Antwort von der KI erhalten.');

                // Parse CSV result
                const lines = responseText.trim().split('\n');
                const extractedCount = lines.length;

                lines.forEach(line => {
                    const [word, translation] = line.split(';').map(s => s.trim());
                    if (word && translation) {
                        window.StorageService.saveVocab(word, translation, subject);
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
            link.setAttribute("download", `Flex2Abi_Vokabeln_${new Date().toLocaleDateString('de-DE').replace(/\./g, '-')}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };
})();
