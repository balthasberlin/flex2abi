/**
 * AbiFlex - Quiz Service Module
 * Handles AI-powered multiple-choice question generation and session tracking.
 */

window.QuizService = (function() {
    
    // Internal session state
    let currentQuiz = {
        questions: [],
        currentIndex: 0,
        score: 0,
        topics: '',
        results: [] // Track correct/incorrect for summary
    };

    return {
        /**
         * Generates a set of MC questions based on topics.
         * @param {string} topics - User defined topics
         * @param {number} count - Number of questions (default 5)
         * @param {string} difficulty - Difficulty level
         */
        generateQuestions: async (topics, count = 5, difficulty = 'Mittel') => {
            const apiKey = window.CONFIG?.GEMINI_API_KEY;
            const useProxy = !!window.CONFIG?.EDGE_FUNCTION_URL;

            if (!apiKey && !useProxy) throw new Error('API Konfiguration fehlt.');

            const prompt = `Du bist ein erfahrener Abitur-Prüfer. Erstelle ein Multiple-Choice Quiz für das Thema: "${topics}".
Schwierigkeitsgrad: ${difficulty}.
Anzahl der Fragen: ${count}.

BEACHTE DIESE STRENGEN REGELN:
1. Jede Frage muss 4 Antwortmöglichkeiten haben.
2. Genau EINE Antwort ist korrekt.
3. Gib das Ergebnis AUSSCHLIESSLICH als ein valides JSON-Array von Objekten zurück.
4. Jedes Objekt muss diese Struktur haben:
   {
     "question": "Die Frage...",
     "options": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"],
     "correctIndex": 0,
     "explanation": "Kurze Erklärung, warum diese Antwort richtig ist."
   }
5. Nutze KEIN Markdown (keine Backticks), nur das reine JSON-Array.
6. Die Fragen müssen fachlich präzise und auf Abitur-Niveau sein.`;

            // Use the global AIService caller if available, otherwise fetch directly
            let responseText;
            if (window.AIService?.callGemini) {
                responseText = await window.AIService.callGemini(prompt, apiKey);
            } else {
                // Manual fallback fetch logic if AIService is missing
                const url = useProxy 
                    ? window.CONFIG.EDGE_FUNCTION_URL 
                    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                
                // Simplified fetch (assuming AIService is usually there)
                throw new Error("Zusammenarbeit mit AIService erforderlich.");
            }

            try {
                // Handle potential markdown wrapping if AI ignores instructions
                const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
                const questions = JSON.parse(cleanJson);
                
                if (!Array.isArray(questions)) throw new Error("KI lieferte kein Array zurück.");
                
                // Initialize session
                currentQuiz = {
                    questions: questions,
                    currentIndex: 0,
                    score: 0,
                    topics: topics,
                    results: []
                };

                return questions;
            } catch (e) {
                console.error("Quiz Parse Error:", e, responseText);
                throw new Error("Die KI-Antwort konnte nicht in Quiz-Fragen umgewandelt werden. Bitte versuche es erneut.");
            }
        },

        getCurrentQuestion: () => {
            if (currentQuiz.currentIndex < currentQuiz.questions.length) {
                return currentQuiz.questions[currentQuiz.currentIndex];
            }
            return null;
        },

        submitAnswer: (index) => {
            const q = currentQuiz.questions[currentQuiz.currentIndex];
            const isCorrect = index === q.correctIndex;
            
            if (isCorrect) currentQuiz.score++;
            
            currentQuiz.results.push({
                question: q.question,
                selected: q.options[index],
                correct: q.options[q.correctIndex],
                isCorrect: isCorrect,
                explanation: q.explanation
            });

            currentQuiz.currentIndex++;
            return {
                isCorrect,
                correctIndex: q.correctIndex,
                explanation: q.explanation,
                isFinished: currentQuiz.currentIndex >= currentQuiz.questions.length
            };
        },

        getStats: () => {
            return {
                score: currentQuiz.score,
                total: currentQuiz.questions.length,
                percentage: Math.round((currentQuiz.score / currentQuiz.questions.length) * 100),
                results: currentQuiz.results,
                topics: currentQuiz.topics
            };
        },

        reset: () => {
            currentQuiz = { questions: [], currentIndex: 0, score: 0, topics: '', results: [] };
        },

        getProgress: () => {
            if (currentQuiz.questions.length === 0) return 0;
            return ((currentQuiz.currentIndex) / currentQuiz.questions.length) * 100;
        }
    };
})();
