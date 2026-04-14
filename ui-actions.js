/**
 * Flex2Abi - UI Actions Module
 * Encapsulates global feedback modals and historic action triggers.
 */

window.UIAction = (function() {

    // --- GLOBAL FEEDBACK OVERLAY ---
    const globalOverlay = document.createElement('div');
    globalOverlay.className = 'modal-overlay';
    globalOverlay.style.display = 'none';
    globalOverlay.innerHTML = `
        <div class="card fade-in" style="text-align: center; max-width: 440px; width: 90%; padding: 2.5rem 2rem;">
            <div id="overlay-icon-wrap" style="margin-bottom: 1.5rem;">
                <div class="loader" id="overlay-loader" style="width: 40px; height: 40px; border-width: 4px; margin: 0 auto;"></div>
                <div id="overlay-static-icon" style="font-size: 3rem; display: none;">⚠️</div>
            </div>
            <h3 id="overlay-title" style="margin-bottom: 0.8rem; color: white; font-size: 1.4rem;">...</h3>
            <p id="overlay-msg" style="color: var(--text-muted); font-size: 1rem; line-height: 1.5; margin-bottom: 2rem;">...</p>
            
            <div id="overlay-buttons" style="display: none; justify-content: center; gap: 1rem;">
                <button id="overlay-cancel" class="secondary-btn" style="flex: 1; padding: 0.8rem;">Abbrechen</button>
                <button id="overlay-confirm" class="primary-btn" style="flex: 1; padding: 0.8rem; background: var(--danger);">Löschen</button>
            </div>
        </div>
    `;
    document.body.appendChild(globalOverlay);

    return {
        showVisualFeedback: (title, msg, type = 'loading') => {
            const titleEl = document.getElementById('overlay-title');
            const msgEl = document.getElementById('overlay-msg');
            const loader = document.getElementById('overlay-loader');
            const staticIcon = document.getElementById('overlay-static-icon');
            const btnContainer = document.getElementById('overlay-buttons');

            if (titleEl) titleEl.textContent = title;
            if (msgEl) msgEl.textContent = msg;
            
            if (type === 'loading') {
                loader.style.display = 'block';
                staticIcon.style.display = 'none';
                btnContainer.style.display = 'none';
            } else {
                loader.style.display = 'none';
                staticIcon.style.display = 'block';
                // Type could determine icon
                staticIcon.textContent = type === 'danger' ? '🗑️' : '⚠️';
            }
            
            globalOverlay.style.display = 'flex';
        },

        showConfirm: (title, msg, confirmText = 'Bestätigen') => {
            return new Promise((resolve) => {
                const titleEl = document.getElementById('overlay-title');
                const msgEl = document.getElementById('overlay-msg');
                const loader = document.getElementById('overlay-loader');
                const staticIcon = document.getElementById('overlay-static-icon');
                const btnContainer = document.getElementById('overlay-buttons');
                const confirmBtn = document.getElementById('overlay-confirm');
                const cancelBtn = document.getElementById('overlay-cancel');

                titleEl.textContent = title;
                msgEl.textContent = msg;
                confirmBtn.textContent = confirmText;
                
                loader.style.display = 'none';
                staticIcon.style.display = 'block';
                staticIcon.textContent = '❓';
                btnContainer.style.display = 'flex';
                
                globalOverlay.style.display = 'flex';

                const cleanup = (val) => {
                    globalOverlay.style.display = 'none';
                    confirmBtn.removeEventListener('click', onConfirm);
                    cancelBtn.removeEventListener('click', onCancel);
                    resolve(val);
                };

                const onConfirm = () => cleanup(true);
                const onCancel = () => cleanup(false);

                confirmBtn.addEventListener('click', onConfirm);
                cancelBtn.addEventListener('click', onCancel);
            });
        },

        hideVisualFeedback: () => {
            globalOverlay.style.display = 'none';
        },

        toggleSource: (btn) => {
            if (btn && btn.nextElementSibling) {
                btn.nextElementSibling.style.display = (btn.nextElementSibling.style.display === 'block' ? 'none' : 'block');
            }
        },

        deleteHistoryItem: async (id, event) => {
            if (event) event.stopPropagation();
            
            const confirmed = await window.UIAction.showConfirm(
                'Eintrag löschen?', 
                'Möchtest du diese Aufnahme und alle zugehörigen Daten wirklich unwiderruflich aus dem Speicher entfernen?',
                'Löschen'
            );
            
            if (!confirmed) return;
            
            // Visual feedback - fade out
            const btn = event.currentTarget || event.target;
            const card = btn.closest('.history-item');
            if (card) {
                card.style.opacity = '0.3';
                card.style.transform = 'scale(0.95)';
                card.style.pointerEvents = 'none';
            }

            window.StorageService.deleteItem(id);
            if (window.APP_STATE && id === window.APP_STATE.currentSessionId) {
                window.APP_STATE.currentSessionId = Date.now();
            }
            
            setTimeout(() => {
                if (window.UIRenderer) {
                    window.UIRenderer.renderLibraryItems();
                    window.UIRenderer.renderHistory();
                }
                window.StorageService.renderDeadlines(document.getElementById('deadline-list'));
            }, 300);
        },

        updateItemFolder: (id, newFolder) => {
            window.StorageService.updateFolder(id, newFolder);
            setTimeout(() => {
                if (window.UIRenderer) {
                    window.UIRenderer.renderLibraryItems();
                    window.UIRenderer.renderHistory();
                }
            }, 100);
        },

        refineHistoryItem: async (id, btnElement) => {
            const apiKey = window.CONFIG?.GEMINI_API_KEY;
            if (!apiKey) { alert('API Key fehlt!'); return; }

            const originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = '⏳ Analysiere...';
            btnElement.disabled = true;

            // Visual feedback overlay
            window.UIAction.showVisualFeedback('Analysiere Aufnahme...', 'KI verarbeitet das Transkript vollständig.');

            try {
                const history = window.StorageService.getHistory();
                const item = history.find(h => h.id === id);
                if (!item) { alert('Eintrag nicht gefunden!'); return; }
                if (!item.transcript || item.transcript.length < 5) {
                    alert('Kein Transkript zum Analysieren vorhanden!');
                    return;
                }

                // --- Vollständige KI-Pipeline (wie beim Zusammenfassen) ---
                const onlyCorrectAnswers = (localStorage.getItem('flex2abi_filter_only') !== 'false');
                const chunks = window.AIService.chunkText(item.transcript);
                const processedResults = [];

                for (let i = 0; i < chunks.length; i++) {
                    const prompt = window.AIService.getChunkPrompt(chunks[i], onlyCorrectAnswers);
                    const result = await window.AIService.callGemini(prompt, apiKey);
                    processedResults.push(result);
                    if (i < chunks.length - 1) await window.AIService.wait(10000);
                }

                const masterPrompt = window.AIService.getMasterPrompt(processedResults);
                const masterFullText = await window.AIService.callGemini(masterPrompt, apiKey);

                // --- Metadaten aus Master-Text extrahieren ---
                let folder = item.folder || 'Allgemein';
                let keywords = item.keywords || [];

                const folderMatch = masterFullText.match(/FACH:\s*(.+)/i);
                if (folderMatch?.[1]) folder = folderMatch[1].replace(/\*/g, '').trim();

                const keywordsMatch = masterFullText.match(/SCHLAGWORTE:\s*(.+)/i);
                if (keywordsMatch?.[1]) keywords = keywordsMatch[1].replace(/\*/g, '').split(',').map(k => k.trim());

                // --- Termine aus dem gesamten KI-Output extrahieren ---
                const allAiText = [...processedResults, masterFullText].join('\n');
                const newDeadlines = window.AIService.extractDeadlines(allAiText);

                // Bestehende Deadlines beibehalten und neue ohne Duplikate hinzufügen
                const existingDeadlines = Array.isArray(item.deadlines) ? item.deadlines : [];
                newDeadlines.forEach(nd => {
                    const exists = existingDeadlines.some(d => d.date === nd.date && d.task === nd.task);
                    if (!exists) existingDeadlines.push(nd);
                });

                // --- Item speichern ---
                item.summaryHtml = masterFullText.replace(/\n/g, '<br>');
                item.masterText = masterFullText;
                item.folder = folder;
                item.keywords = keywords;
                item.deadlines = existingDeadlines;
                window.StorageService.saveSession(item);

                // --- Deadline-Bestätigung anzeigen (im richtigen Container) ---
                if (newDeadlines.length > 0 && window.UIRenderer) {
                    const historyItem = btnElement.closest('.history-item');
                    const contentContainer = historyItem ? historyItem.querySelector('.history-content') : null;
                    window.UIRenderer.renderDeadlineConfirmations(newDeadlines, item.id, contentContainer);
                }

                // --- UI aktualisieren ---
                if (window.UIRenderer) {
                    window.UIRenderer.renderLibraryItems();
                    window.UIRenderer.renderHistory();
                }

            } catch (e) {
                alert('Fehler bei der Analyse: ' + e.message);
            } finally {
                window.UIAction.hideVisualFeedback();
                btnElement.innerHTML = originalHtml;
                btnElement.disabled = false;
            }
        },

        triggerMasterSummary: async (folder) => {
            const apiKey = window.CONFIG?.GEMINI_API_KEY;
            if (!apiKey) { alert('API Key fehlt!'); return; }

            const history = window.StorageService.getHistory();
            const items = history.filter(h => (h.folder || 'Allgemein') === folder);
            if (items.length === 0) return;

            const masterModal = document.getElementById('master-modal');
            const masterModalBody = document.getElementById('master-modal-body');
            if (masterModal) masterModal.style.display = 'flex';
            if (masterModalBody) masterModalBody.innerHTML = '<div style="text-align: center; padding: 2rem;"><p class="pulse-text">Erstelle Master-Lernzettel für ' + folder + '...</p></div>';

            const combinedText = items.map(i => `DATUM: ${i.date}\nTRANSKRIPT:\n${i.transcript}`).join('\n\n---\n\n');
            const prompt = window.AIService.getMasterPrompt([combinedText]); // Reuse master logic

            try {
                const markdownText = await window.AIService.callGemini(prompt, apiKey);
                const html = markdownText
                    .replace(/### (.*?)\n/g, '<h3 style="color:var(--accent-primary); margin-top:1.5rem;">$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #ffd700;">$1</strong>');
                if (masterModalBody) masterModalBody.innerHTML = `<div class="fade-in">${html}</div>`;
            } catch (e) { 
                if (masterModalBody) masterModalBody.innerHTML = '<p>Fehler: ' + e.message + '</p>'; 
            }
        },

        applyFolderSuggestion: (id, suggestedFolder) => {
            window.StorageService.updateFolder(id, suggestedFolder);
            if (window.UIRenderer) window.UIRenderer.renderLibraryItems();
        },

        confirmDeadline: (deadline, sessionId, rowIndex) => {
            const history = window.StorageService.getHistory();
            const session = history.find(h => h.id === sessionId);
            if (!session) return;

            if (!Array.isArray(session.deadlines)) session.deadlines = [];

            // Avoid duplicates
            const alreadyExists = session.deadlines.some(d => d.date === deadline.date && d.task === deadline.task);
            if (!alreadyExists) {
                session.deadlines.push({ date: deadline.date, task: deadline.task });
                window.StorageService.saveSession(session);
            }

            // Refresh Termine tab
            window.StorageService.renderDeadlines(document.getElementById('deadline-list'));

            // Visual feedback on the row
            const row = document.getElementById('deadline-row-' + rowIndex);
            if (row) {
                row.style.opacity = '0.4';
                row.style.pointerEvents = 'none';
                row.querySelector('button').textContent = '✔ Übernommen';
            }
        },

        dismissDeadlineRow: (rowIndex) => {
            const row = document.getElementById('deadline-row-' + rowIndex);
            if (row) {
                row.style.transition = 'opacity 0.3s';
                row.style.opacity = '0';
                setTimeout(() => row.remove(), 300);
            }
        }
    };
})();

// --- GLOBAL EVENT DELEGATES ---
document.body.addEventListener('click', (e) => {
    // 1. History Item Accordion Toggle
    const header = e.target.closest('.history-header');
    if (header) {
        if (e.target.closest('button')) return; // Ignore delete button clicks
        const item = header.closest('.history-item');
        if (item) item.classList.toggle('open');
    }

    // 2. Master Modal Close Button
    if (e.target.closest('#close-modal-btn')) {
        const masterModal = document.getElementById('master-modal');
        if (masterModal) masterModal.style.display = 'none';
    }
});

// 3. Escape-Taste: Alle Modals schließen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modals = ['master-modal', 'cloud-modal'];
        modals.forEach(id => {
            const modal = document.getElementById(id);
            if (modal && modal.style.display !== 'none') {
                modal.style.display = 'none';
            }
        });
        // Auch Feedback-Overlay schließen (nur wenn keine Buttons sichtbar → kein Confirm-Dialog)
        const overlay = document.querySelector('.modal-overlay[style*="flex"]');
        if (overlay && document.getElementById('overlay-buttons')?.style.display === 'none') {
            window.UIAction.hideVisualFeedback();
        }
    }
});
