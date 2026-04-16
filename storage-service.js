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

    // Centralized Sync-Flag Manager
    const markDirty = () => {
        if (window.APP_STATE) window.APP_STATE.syncDirty = true;
    };

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
                            alert('⚠️ Speicher ist komplett voll! Bitte gehe in die Bibliothek und lösche alte Aufnahmen.');
                        }
                    } else {
                        alert('⚠️ Speicher ist voll! Bitte lösche einige alte Aufnahmen in der Bibliothek.');
                    }
                }
            }
            markDirty();
        },

        getHistory: () => JSON.parse(localStorage.getItem('ai_record_history') || '[]'),

        deleteItem: (id) => {
            let history = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
            history = history.filter(h => h.id !== id);
            localStorage.setItem('ai_record_history', JSON.stringify(history));
            
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
                markDirty();
            }
        },

        // --- RENDERING LOGIC ---
        renderDeadlines: (containerElement) => {
            if (!containerElement) return;
            const history = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
            const allDeadlines = [];

            history.forEach(session => {
                if (session.deadlines && Array.isArray(session.deadlines)) {
                    session.deadlines.forEach(d => {
                        allDeadlines.push({ 
                            ...d, 
                            sessionId: session.id,
                            folder: session.folder || 'Allgemein',
                            sessionDate: session.date
                        });
                    });
                }
            });

            if (allDeadlines.length === 0) {
                containerElement.innerHTML = `
                    <div class="card" style="text-align: center; padding: 3rem;">
                        <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;">📅</div>
                        <h3>Noch keine Termine erfasst</h3>
                        <p style="color: var(--text-muted);">Sobald die KI in deinen Aufnahmen Fristen findet, erscheinen sie hier.</p>
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

            containerElement.innerHTML = allDeadlines.map(d => `
                <div class="deadline-card fade-in">
                    <div class="deadline-date-badge">
                        ${d.date ? d.date.split('.')[0] : '?'}<br>
                        <span style="font-size: 0.7rem; font-weight: 400; opacity: 0.8;">${d.date && d.date.includes('.') ? getMonthName(d.date.split('.')[1]) : 'MON'}</span>
                    </div>
                    <div class="deadline-info">
                        <div class="deadline-title">${d.task}</div>
                        <div class="deadline-source">
                            <span class="deadline-tag">${d.folder}</span>
                            Gefunden in Aufnahme am ${d.sessionDate}
                        </div>
                    </div>
                </div>
            `).join('');
        },

        getFolderIcon: (folder) => getFolderIcon(folder)
    };
})();
