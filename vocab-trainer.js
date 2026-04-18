/**
 * Flex2Abi - Vocab Trainer Logic Module
 * Manages training sessions, flashcard states, and Spaced Repetition (SRS).
 */

window.VocabTrainer = (function() {
    
    let currentState = {
        sessionItems: [],
        currentIndex: -1,
        mode: 'flashcard', // 'flashcard' or 'type'
        direction: 'mixed', // 'a-b', 'b-a', 'mixed'
        stats: {
            correct: 0,
            wrong: 0,
            history: []
        }
    };

    function normalizeText(text) {
        let norm = text.toLowerCase()
            .trim()
            .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
            .replace(/\s{2,}/g, " ");
        
        // Article tolerance (German/English)
        const articles = ["der ", "die ", "das ", "a ", "an ", "the "];
        for (const art of articles) {
            if (norm.startsWith(art)) {
                norm = norm.substring(art.length).trim();
            }
        }
        return norm;
    }

    return {
        initSession: (subject, mode, direction) => {
            const allVocab = window.StorageService.getVocabBySubject(subject);
            if (allVocab.length === 0) return false;

            // Logic for SRS: Prioritize lower levels
            // Group 1: Level 1-2 (High priority)
            // Group 2: Level 3-5 (Normal priority)
            const highPrio = allVocab.filter(v => (v.level || 1) <= 2);
            const normalPrio = allVocab.filter(v => (v.level || 1) > 2);
            
            // Shuffle both
            highPrio.sort(() => Math.random() - 0.5);
            normalPrio.sort(() => Math.random() - 0.5);

            // Compose session: 70% high priority, 30% normal priority (up to 20 items)
            const sessionSize = Math.min(20, allVocab.length);
            const highCount = Math.ceil(sessionSize * 0.7);
            
            let sessionList = [
                ...highPrio.slice(0, highCount),
                ...normalPrio.slice(0, sessionSize - highPrio.slice(0, highCount).length)
            ];

            // Final shuffle of the selected session
            sessionList.sort(() => Math.random() - 0.5);

            currentState = {
                sessionItems: sessionList.map(item => ({
                    ...item,
                    currentDirection: direction === 'mixed' 
                        ? (Math.random() > 0.5 ? 'a-b' : 'b-a') 
                        : direction
                })),
                currentIndex: 0,
                mode: mode,
                direction: direction,
                stats: {
                    correct: 0,
                    wrong: 0,
                    history: []
                }
            };

            return currentState.sessionItems.length > 0;
        },

        getCurrentCard: () => {
            if (currentState.currentIndex < 0 || currentState.currentIndex >= currentState.sessionItems.length) return null;
            const item = currentState.sessionItems[currentState.currentIndex];
            
            return {
                id: item.id,
                question: item.currentDirection === 'a-b' ? item.word : item.translation,
                answer: item.currentDirection === 'a-b' ? item.translation : item.word,
                subject: item.subject,
                level: item.level,
                mode: currentState.mode,
                index: currentState.currentIndex + 1,
                total: currentState.sessionItems.length
            };
        },

        submitResult: (success) => {
            const item = currentState.sessionItems[currentState.currentIndex];
            
            // Update storage
            window.StorageService.updateVocabProgress(item.id, success);
            
            // Update local stats
            if (success) currentState.stats.correct++;
            else currentState.stats.wrong++;
            
            currentState.stats.history.push({
                word: item.word,
                translation: item.translation,
                success
            });

            // Move to next
            currentState.currentIndex++;
            
            return currentState.currentIndex < currentState.sessionItems.length;
        },

        validateTypeAnswer: (input) => {
            const card = window.VocabTrainer.getCurrentCard();
            if (!card) return false;
            
            const normInput = normalizeText(input);
            const normAnswer = normalizeText(card.answer);
            
            // Simple match. In a "super good" version, maybe use Levenshtein distance 
            // to allow 1-2 char typos if string is long enough.
            return normInput === normAnswer;
        },

        getStats: () => {
            return {
                ...currentState.stats,
                total: currentState.sessionItems.length,
                percentage: Math.round((currentState.stats.correct / (currentState.stats.correct + currentState.stats.wrong || 1)) * 100)
            };
        }
    };
})();
