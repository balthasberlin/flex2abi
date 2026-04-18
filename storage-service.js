/**
 * Flex2Abi - Storage Service Module
 * Managing localStorage persistence and data rendering logic.
 */

window.StorageService = (function() {
    
    // Internal helper for month names
    const getMonthName = (mon) => {
        const months = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
        return months[parseInt(mon) - 1] || 'MON';
    };

    // Internal helper for folder icons
    const getFolderIcon = (folder) => {
        const f = folder.toLowerCase();
        if (f.includes('bio')) return '🧬';
        if (f.includes('geschicht')) return '📜';
        if (f.includes('deutsch')) return '📖';
        if (f.includes('mathe')) return '📐';
        if (f.includes('info')) return '💻';
        if (f.includes('phys')) return '⚛️';
        if (f.includes('chem')) return '🧪';
        if (f.includes('eng')) return '🇬🇧';
        if (f.includes('politi')) return '⚖️';
        if (f.includes('erdk')) return '🌍';
        if (f.includes('religion') || f.includes('ethik')) return '⛪';
        if (f.includes('kunst')) return '🎨';
        if (f.includes('musik')) return '🎵';
        if (f.includes('sport')) return '🏀';
        return '📁';
    };

    // Central cache for high-frequency reads
    let historyCache = null;
    let vocabCache = null;

    const markDirty = () => {
        if (window.APP_STATE) window.APP_STATE.syncDirty = true;
    };

    const invalidateVocabCache = () => { vocabCache = null; };
    const invalidateHistoryCache = () => { historyCache = null; };


    return {
        // --- DATA PERSISTENCE ---
        saveSession: (sessionData) => {
            let history = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
            const existingIndex = history.findIndex(h => h.id === sessionData.id);
            
            if (existingIndex > -1) {
                history[existingIndex] = sessionData;
            } else {
                history.unshift(sessionData);
            }
            
            try {
                localStorage.setItem('ai_record_history', JSON.stringify(history));
                invalidateHistoryCache();
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    // Speicher voll → ältesten Eintrag ohne Deadlines entfernen
                    const sacrificeIndex = history.findLastIndex(h => !h.deadlines || h.deadlines.length === 0);
                    if (sacrificeIndex > -1) {
                        const removed = history.splice(sacrificeIndex, 1)[0];
                        console.warn('⚠️ Speicher voll – ältester Eintrag ohne Termine entfernt:', removed.date);
                        try {
                            localStorage.setItem('ai_record_history', JSON.stringify(history));
                        } catch (_) {
                            if (window.UIAction) window.UIAction.showError('Speicher Voll', 'Der Speicher deines Browsers ist komplett belegt. Bitte lösche alte Aufnahmen.');
                        }
                    } else {
                        if (window.UIAction) window.UIAction.showError('Speicher Voll', 'Bitte lösche einige alte Aufnahmen in der Bibliothek, um Platz zu schaffen.');
                    }
                }
            }
            markDirty();
        },

        getHistory: () => {
            if (historyCache) return historyCache;
            historyCache = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
            return historyCache;
        },

        deleteItem: (id) => {
            let history = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
            history = history.filter(h => h.id !== id);
            localStorage.setItem('ai_record_history', JSON.stringify(history));
            invalidateHistoryCache();
            
            // In die Lösch-Warteschlange für Cloud-Sync aufnehmen
            let deletedQueue = JSON.parse(localStorage.getItem('ai_record_deleted') || '[]');
            if (!deletedQueue.includes(id)) {
                deletedQueue.push(id);
                localStorage.setItem('ai_record_deleted', JSON.stringify(deletedQueue));
            }

            markDirty();
            return history;
        },


        getDeletedQueue: () => JSON.parse(localStorage.getItem('ai_record_deleted') || '[]'),

        clearDeletedQueue: (idsToRemove) => {
            let queue = JSON.parse(localStorage.getItem('ai_record_deleted') || '[]');
            queue = queue.filter(id => !idsToRemove.includes(id));
            localStorage.setItem('ai_record_deleted', JSON.stringify(queue));
        },

        updateFolder: (id, newFolder) => {
            let history = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
            const index = history.findIndex(h => h.id === id);
            if (index !== -1) {
                history[index].folder = newFolder.trim() || 'Allgemein';
                localStorage.setItem('ai_record_history', JSON.stringify(history));
                invalidateHistoryCache();
                markDirty();
            }
        },

        // --- VOCABULARY STORAGE ---
        saveVocab: (word, translation, subject = 'Allgemein') => {
            if (!word || !translation) return;
            const vocab = JSON.parse(localStorage.getItem('ai_record_vocab') || '[]');
            const id = Date.now() + Math.random();
            vocab.unshift({ 
                id, 
                word: word.trim(), 
                translation: translation.trim(), 
                subject: subject.trim() || 'Allgemein',
                level: 1, // Learning box 1
                lastReviewed: null,
                date: new Date().toISOString() 
            });
            localStorage.setItem('ai_record_vocab', JSON.stringify(vocab));
            invalidateVocabCache();
            markDirty();
            return vocab;
        },

        getVocabList: () => {
            if (vocabCache) return vocabCache;

            const list = JSON.parse(localStorage.getItem('ai_record_vocab') || '[]');
            // Migration: Ensure all items have necessary fields
            let migrated = false;
            const updated = list.map(v => {
                if (!v.subject || v.level === undefined) {
                    v.subject = v.subject || 'Allgemein';
                    v.level = v.level || 1;
                    v.lastReviewed = v.lastReviewed || null;
                    migrated = true;
                }
                return v;
            });
            if (migrated) localStorage.setItem('ai_record_vocab', JSON.stringify(updated));
            vocabCache = updated;
            return updated;
        },


        deleteVocab: (id) => {
            let vocab = JSON.parse(localStorage.getItem('ai_record_vocab') || '[]');
            vocab = vocab.filter(v => v.id !== id);
            localStorage.setItem('ai_record_vocab', JSON.stringify(vocab));
            invalidateVocabCache();
            markDirty();
            return vocab;
        },


        updateVocabProgress: (id, success) => {
            let vocab = JSON.parse(localStorage.getItem('ai_record_vocab') || '[]');
            const index = vocab.findIndex(v => v.id === id);
            if (index !== -1) {
                const item = vocab[index];
                if (success) {
                    item.level = Math.min(5, (item.level || 1) + 1);
                } else {
                    item.level = 1; // Back to start (Leitner)
                }
                item.lastReviewed = new Date().toISOString();
                localStorage.setItem('ai_record_vocab', JSON.stringify(vocab));
                invalidateVocabCache();
                markDirty();
            }
        },

        getVocabBySubject: (subject) => {
            const list = window.StorageService.getVocabList();
            if (subject === 'Alle' || !subject) return list;
            return list.filter(v => v.subject === subject);
        },

        getAllVocabSubjects: () => {
            const list = window.StorageService.getVocabList();
            const subjects = new Set(list.map(v => v.subject || 'Allgemein'));
            return Array.from(subjects).sort();
        },

        renderDeadlines: (containerElement) => {
            if (!containerElement) return;
            const history = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
            const allDeadlines = [];

            history.forEach(session => {
                if (session.deadlines && Array.isArray(session.deadlines)) {
                    session.deadlines.forEach((d, idx) => {
                        allDeadlines.push({ 
                            ...d, 
                            sessionId: session.id,
                            originalIndex: idx,
                            folder: session.folder || 'Allgemein',
                            sessionDate: session.date,
                            summaryHtml: session.summaryHtml || 'Keine Zusammenfassung verfügbar.'
                        });
                    });
                }
            });

            if (allDeadlines.length === 0) {
                containerElement.innerHTML = `
                    <div class="card u-text-center u-p-3">
                        <div class="u-font-size-lg u-mb-1 u-opacity-0-3">📅</div>
                        <h3>Noch keine Termine erfasst</h3>
                        <p class="u-muted-text">Sobald die KI in deinen Aufnahmen Fristen findet, erscheinen sie hier.</p>
                    </div>
                `;
                return;
            }

            const parseDate = (d) => {
                if (!d || !d.includes('.')) return new Date(0);
                const parts = d.split('.');
                const currentYear = new Date().getFullYear();
                return new Date(parts[2] || currentYear, (parts[1] || 1) - 1, parts[0] || 1);
            };

            allDeadlines.sort((a, b) => parseDate(a.date) - parseDate(b.date));

            containerElement.innerHTML = allDeadlines.map((d, i) => {
                let reminderLabel = '';
                if (d.reminder && d.reminder !== '0') {
                    reminderLabel = `<span class="deadline-reminder-tag">🔔 ${d.reminder === '1' ? '1 Tag' : d.reminder + ' Tage'} vorher</span>`;
                }

                return `
                    <div class="deadline-card fade-in card u-flex" style="animation-delay: ${i * 0.05}s" onclick="window.UIAction.toggleDeadline(event)">
                        <div class="deadline-main-info">
                            <div class="deadline-date-badge">
                                ${d.date ? d.date.split('.')[0] : '?'}<br>
                                <span class="u-font-size-xs u-font-500 u-opacity-0-8">${d.date && d.date.includes('.') ? getMonthName(d.date.split('.')[1]) : 'MON'}</span>
                            </div>
                            <div class="deadline-info">
                                <div class="deadline-title">${d.task} ${reminderLabel}</div>
                                <div class="deadline-source">
                                    <span class="deadline-tag">${d.folder}</span>
                                    Gefunden in Aufnahme am ${d.sessionDate}
                                </div>
                            </div>
                        </div>

                        <div class="deadline-content">
                            <div class="summary-text u-font-size-sm u-lh-1-5">
                                ${d.summaryHtml}
                            </div>
                            <button class="deadline-jump-btn" onclick="event.stopPropagation(); window.UIAction.jumpToTopic('${d.folder}', ${d.sessionId})">
                                📂 Zum Thema springen &rarr;
                            </button>
                        </div>

                        <div class="deadline-actions" onclick="event.stopPropagation()">
                            <button class="deadline-action-btn deadline-edit-btn" title="Bearbeiten" onclick="event.stopPropagation(); window.UIAction.openEditDeadlineModal(${d.sessionId}, ${d.originalIndex})">✏️</button>
                            <button class="deadline-action-btn deadline-delete-btn" title="Löschen" onclick="event.stopPropagation(); window.UIAction.deleteDeadline(${d.sessionId}, ${d.originalIndex})">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('');
        },

        getFolderIcon: (folder) => getFolderIcon(folder)
    };
})();
