/**
 * AbiFlex - UI Actions Module
 * Encapsulates global feedback modals and historic action triggers.
 */

window.UIAction = (function() {

    // --- GLOBAL FEEDBACK OVERLAY ---
    const globalOverlay = document.createElement('div');
    globalOverlay.className = 'modal-overlay hidden';
    globalOverlay.innerHTML = `
        <div class="card fade-in u-text-center u-w-100 u-p-3 settings-grid-narrow">
            <div id="overlay-icon-wrap" class="u-mb-1-5">
                <div class="loader loader-small u-mt-auto" id="overlay-loader"></div>
                <div id="overlay-static-icon" class="u-font-size-lg hidden">⚠️</div>
            </div>
            <h3 id="overlay-title" class="u-mb-1 u-font-size-md">...</h3>
            <p id="overlay-msg" class="u-muted-text u-font-size-sm u-mb-2">...</p>
            
            <div id="overlay-buttons" class="hidden u-flex-center u-gap-1">
                <button id="overlay-cancel" class="secondary-btn u-w-100">Abbrechen</button>
                <button id="overlay-confirm" class="primary-btn u-w-100">Löschen</button>
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
                loader.classList.remove('hidden');
                staticIcon.classList.add('hidden');
                btnContainer.classList.add('hidden');
            } else {
                loader.classList.add('hidden');
                staticIcon.classList.remove('hidden');
                btnContainer.classList.add('hidden');
                
                // Icon selection
                if (type === 'danger') staticIcon.textContent = '🗑️';
                else if (type === 'error') staticIcon.textContent = '❌';
                else if (type === 'success') staticIcon.textContent = '✅';
                else staticIcon.textContent = '⚠️';
            }
            
            globalOverlay.classList.remove('hidden');
            globalOverlay.style.display = 'flex'; // Overlay uses flex for centering, keeping display: flex for the active state is fine if toggled via 'hidden' class which is !important
        },

        showError: (title, msg) => {
            window.UIAction.showVisualFeedback(title, msg, 'error');
            // Auto hide after 4 seconds or wait for manual escape
            setTimeout(() => {
                if (globalOverlay.classList.contains('hidden') === false && document.getElementById('overlay-static-icon').textContent === '❌') {
                    window.UIAction.hideVisualFeedback();
                }
            }, 4000);
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
                
                loader.classList.add('hidden');
                staticIcon.classList.remove('hidden');
                staticIcon.textContent = '❓';
                btnContainer.classList.remove('hidden');
                
                globalOverlay.classList.remove('hidden');
                globalOverlay.style.display = 'flex';

                const cleanup = (val) => {
                    globalOverlay.classList.add('hidden');
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
            globalOverlay.classList.add('hidden');
        },

        toggleSource: (btn) => {
            if (btn && btn.nextElementSibling) {
                btn.nextElementSibling.classList.toggle('hidden');
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
                if (window.APP_UI && window.APP_UI.refreshAll) {
                    window.APP_UI.refreshAll();
                }
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
            if (!apiKey && !window.CONFIG?.EDGE_FUNCTION_URL) { 
                window.UIAction.showError('Konfiguration', 'API Key fehlt!'); 
                return; 
            }

            const originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = '⏳ Analysiere...';
            btnElement.disabled = true;

            // Visual feedback overlay
            window.UIAction.showVisualFeedback('Analysiere Aufnahme...', 'KI verarbeitet das Transkript vollständig.');

            try {
                const history = window.StorageService.getHistory();
                const item = history.find(h => h.id === id);
                if (!item) { 
                    window.UIAction.showError('Fehler', 'Eintrag nicht gefunden!'); 
                    return; 
                }
                if (!item.transcript || item.transcript.length < 5) {
                    window.UIAction.showError('Hinweis', 'Kein Transkript zum Analysieren vorhanden!');
                    return;
                }

                // --- Nutze neue zentrale Pipeline ---
                const results = await window.AIService.runFullAnalysis(item.transcript);
                const masterFullText = results.masterText;

                // --- Metadaten aus Master-Text extrahieren ---
                let folder = item.folder || 'Allgemein';
                let keywords = item.keywords || [];

                const folderMatch = masterFullText.match(/FACH:\s*(.+)/i);
                if (folderMatch?.[1]) folder = folderMatch[1].replace(/\*/g, '').trim();

                const keywordsMatch = masterFullText.match(/SCHLAGWORTE:\s*(.+)/i);
                if (keywordsMatch?.[1]) keywords = keywordsMatch[1].replace(/\*/g, '').split(',').map(k => k.trim());

                // --- Termine aus dem gesamten KI-Output extrahieren ---
                const newDeadlines = results.deadlines;

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
                window.UIAction.showError('Analyse-Fehler', e.message);
            } finally {
                window.UIAction.hideVisualFeedback();
                btnElement.innerHTML = originalHtml;
                btnElement.disabled = false;
            }
        },

        triggerMasterSummary: async (folder) => {
            const apiKey = window.CONFIG?.GEMINI_API_KEY;
            if (!apiKey && !window.CONFIG?.EDGE_FUNCTION_URL) { 
                window.UIAction.showError('Konfiguration', 'API Key fehlt!'); 
                return; 
            }

            const history = window.StorageService.getHistory();
            const items = history.filter(h => (h.folder || 'Allgemein') === folder);
            if (items.length === 0) return;

            const masterModal = document.getElementById('master-modal');
            const masterModalBody = document.getElementById('master-modal-body');
            if (masterModal) {
                masterModal.classList.remove('hidden');
                masterModal.style.display = 'flex';
            }
            if (masterModalBody) masterModalBody.innerHTML = '<div class="u-text-center u-p-3"><p class="pulse-text">Erstelle Master-Lernzettel für ' + folder + '...</p></div>';

            const combinedText = items.map(i => `DATUM: ${i.date}\nTRANSKRIPT:\n${i.transcript}`).join('\n\n---\n\n');
            const prompt = window.AIService.getMasterPrompt([combinedText]); // Reuse master logic

            try {
                const markdownText = await window.AIService.callGemini(prompt, apiKey);
                const html = markdownText
                    .replace(/### (.*?)\n/g, '<h3 class="u-primary-text u-mt-1-5">$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="u-gold-text">$1</strong>');
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

            const reminderSelect = document.getElementById(`reminder-select-${rowIndex}`);
            const reminderDays = reminderSelect ? reminderSelect.value : '0';

            if (!Array.isArray(session.deadlines)) session.deadlines = [];

            // Avoid duplicates (but update reminder if task/date matches)
            const existingIndex = session.deadlines.findIndex(d => d.date === deadline.date && d.task === deadline.task);
            if (existingIndex === -1) {
                session.deadlines.push({ 
                    date: deadline.date, 
                    task: deadline.task,
                    reminder: reminderDays,
                    reminderActive: reminderDays !== '0'
                });
            } else {
                session.deadlines[existingIndex].reminder = reminderDays;
                session.deadlines[existingIndex].reminderActive = reminderDays !== '0';
            }
            
            window.StorageService.saveSession(session);

            // Request permission for notifications if a reminder was set
            if (reminderDays !== '0') {
                window.NotificationService.requestPermission();
            }

            // Refresh Termine tab if visible
            const deadlineList = document.getElementById('deadline-list');
            if (deadlineList) window.UIRenderer.renderDeadlines(deadlineList);

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
        },

        // --- DEADLINE MANAGEMENT ---
        deleteDeadline: async (sessionId, deadlineIndex) => {
            const confirmed = await window.UIAction.showConfirm(
                'Termin löschen?', 
                'Möchtest du diesen Termin wirklich aus deinem Radar entfernen?',
                'Löschen'
            );
            
            if (!confirmed) return;

            const history = window.StorageService.getHistory();
            const session = history.find(h => h.id === sessionId);
            
            if (session && session.deadlines && session.deadlines[deadlineIndex]) {
                session.deadlines.splice(deadlineIndex, 1);
                window.StorageService.saveSession(session);
                
                // Re-render deadlines view
                const container = document.getElementById('deadline-list');
                if (container) window.UIRenderer.renderDeadlines(container);
                
                window.UIAction.showVisualFeedback('Gelöscht', 'Termin wurde entfernt.', 'success');
                setTimeout(() => window.UIAction.hideVisualFeedback(), 1500);
            }
        },

        openEditDeadlineModal: (sessionId, deadlineIndex) => {
            const history = window.StorageService.getHistory();
            const session = history.find(h => h.id === sessionId);
            
            if (session && session.deadlines && session.deadlines[deadlineIndex]) {
                const deadline = session.deadlines[deadlineIndex];
                
                document.getElementById('edit-deadline-session-id').value = sessionId;
                document.getElementById('edit-deadline-index').value = deadlineIndex;
                document.getElementById('edit-deadline-task').value = deadline.task;
                document.getElementById('edit-deadline-date').value = deadline.date;
                
                const deadlineModal = document.getElementById('deadline-edit-modal');
                if (deadlineModal) {
                    deadlineModal.classList.remove('hidden');
                    deadlineModal.style.display = 'flex';
                }
            }
        },

        saveEditedDeadline: () => {
            const sessionId = parseInt(document.getElementById('edit-deadline-session-id').value);
            const index = parseInt(document.getElementById('edit-deadline-index').value);
            const newTask = document.getElementById('edit-deadline-task').value.trim();
            const newDate = document.getElementById('edit-deadline-date').value.trim();
            
            if (!newTask || !newDate) {
                window.UIAction.showError('Fehler', 'Bitte fülle beide Felder aus.');
                return;
            }

            const history = window.StorageService.getHistory();
            const session = history.find(h => h.id === sessionId);
            
            if (session && session.deadlines && session.deadlines[index]) {
                session.deadlines[index].task = newTask;
                session.deadlines[index].date = newDate;
                
                window.StorageService.saveSession(session);
                
                const deadlineModal = document.getElementById('deadline-edit-modal');
                if (deadlineModal) deadlineModal.classList.add('hidden');
                
                // Re-render
                const container = document.getElementById('deadline-list');
                if (container) window.UIRenderer.renderDeadlines(container);
                
                window.UIAction.showVisualFeedback('Gespeichert', 'Termin wurde aktualisiert.', 'success');
                setTimeout(() => window.UIAction.hideVisualFeedback(), 1500);
            }
        },

        toggleDeadline: (event) => {
            const card = event.currentTarget;
            card.classList.toggle('open');
            
            // Close other open cards (Optional UX)
            document.querySelectorAll('.deadline-card.open').forEach(c => {
                if (c !== card) c.classList.remove('open');
            });
        },

        jumpToTopic: (folderName, sessionId) => {
            // 1. Switch to Library view
            const libraryNav = document.querySelector('.nav-item[data-view="library"]');
            if (libraryNav) libraryNav.click();

            // 2. Open the specific subject
            if (window.UIRenderer && window.UIRenderer.showSubjectDetail) {
                window.UIRenderer.showSubjectDetail(folderName);
                
                // 3. Optional: Highlight the specific session item in the detail view
                // We'll wait a bit for rendering to finish
                setTimeout(() => {
                    const sessionItem = document.querySelector(`.history-item[onclick*="${sessionId}"]`);
                    if (sessionItem) {
                        sessionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        sessionItem.style.boxShadow = '0 0 20px var(--accent-secondary)';
                        setTimeout(() => {
                            sessionItem.style.boxShadow = '';
                        }, 3000);
                    }
                }, 300);
            }
        },

        // --- VOCABULARY ACTIONS ---
        triggerVocabScanner: () => {
            // Show subject picker before actually scanning
            const picker = document.getElementById('subject-pick-modal');
            const dataList = document.getElementById('existing-subjects');
            const input = document.getElementById('subject-input');
            
            if (picker && dataList) {
                const subjects = window.StorageService.getAllVocabSubjects();
                dataList.innerHTML = subjects.map(s => `<option value="${s}">`).join('');
                if (input) input.value = '';
                picker.classList.remove('hidden');
                picker.style.display = 'flex';
            }
        },

        confirmSubjectAndScan: () => {
            const subject = document.getElementById('subject-input')?.value.trim() || 'Allgemein';
            window.APP_STATE = window.APP_STATE || {};
            window.APP_STATE.lastTargetSubject = subject;
            
            const picker = document.getElementById('subject-pick-modal');
            if (picker) picker.classList.add('hidden');
            document.getElementById('vocab-file-input')?.click();
        },

        handleVocabFile: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            
            const subject = window.APP_STATE?.lastTargetSubject || 'Allgemein';
            
            try {
                if (!window.VocabService) throw new Error('Vokabel-Service nicht geladen.');
                const result = await window.VocabService.processImage(file, subject);
                if (result.success) {
                    if (window.UIRenderer) window.UIRenderer.renderVocabList();
                }
            } catch (e) {
                window.UIAction.showError('Scan-Fehler', e.message);
            } finally {
                // Reset input so the same file can be selected again
                event.target.value = '';
            }
        },

        // --- VOCAB TRAINER ACTIONS ---
        openTrainer: () => {
            const subjects = window.StorageService.getAllVocabSubjects();
            if (window.UIRenderer) window.UIRenderer.renderTrainerSetup(subjects);
        },

        startTrainerSession: () => {
            const subject = document.getElementById('trainer-subject-select').value;
            const mode = document.getElementById('mode-flashcard').classList.contains('active') ? 'flashcard' : 'type';
            const direction = document.getElementById('trainer-direction-select').value;

            const started = window.VocabTrainer.initSession(subject, mode, direction);
            if (started) {
                const card = window.VocabTrainer.getCurrentCard();
                if (window.UIRenderer) window.UIRenderer.renderTrainerCard(card);
            } else {
                window.UIAction.showError('Session Fehler', 'Keine passenden Vokabeln für dieses Fach gefunden.');
            }
        },

        flipTrainerCard: () => {
            const cardEl = document.getElementById('trainer-card');
            if (cardEl) {
                cardEl.classList.toggle('flipped');
                
                // If it's flashcard mode, show controls when flipped
                const controls = document.getElementById('flashcard-controls');
                if (controls) controls.classList.remove('hidden');
                const hint = document.getElementById('click-hint');
                if (hint) hint.classList.add('hidden');
            }
        },

        handleTrainerFeedback: (success) => {
            const hasMore = window.VocabTrainer.submitResult(success);
            if (hasMore) {
                const card = window.VocabTrainer.getCurrentCard();
                if (window.UIRenderer) window.UIRenderer.renderTrainerCard(card);
            } else {
                const stats = window.VocabTrainer.getStats();
                if (window.UIRenderer) window.UIRenderer.renderTrainerResults(stats);
            }
        },

        handleTrainerTypeSubmit: () => {
            const input = document.getElementById('trainer-type-input');
            if (!input) return;
            
            const val = input.value;
            const isCorrect = window.VocabTrainer.validateTypeAnswer(val);
            
            if (isCorrect) {
                input.classList.add('correct');
                // Auto-advance after small delay
                setTimeout(() => window.UIAction.handleTrainerFeedback(true), 600);
            } else {
                input.classList.add('error');
                // Shake and show answer (auto flips card)
                window.UIAction.flipTrainerCard();
                setTimeout(() => {
                    input.classList.remove('error');
                    // Manual approval needed if wrong, or just auto-fail
                    // Let's create a fail button or just auto-fail in 3 seconds
                    const container = input.parentElement;
                    container.innerHTML = `
                         <div class="fade-in u-text-center">
                            <p class="u-danger-text u-font-700 u-mb-1">Leider falsch!</p>
                            <button class="record-btn u-border-accent" onclick="window.UIAction.handleTrainerFeedback(false)">Nächste Vokabel</button>
                         </div>
                    `;
                }, 400);
            }
        },

        closeTrainer: () => {
            const overlay = document.getElementById('trainer-overlay');
            if (overlay) overlay.classList.add('hidden');
            // Refresh list to show updated levels
            if (window.UIRenderer) window.UIRenderer.renderVocabList();
        },

        deleteVocabItem: async (id) => {
            const confirmed = await window.UIAction.showConfirm('Vokabel löschen?', 'Möchtest du diese Vokabel wirklich entfernen?', 'Löschen');
            if (confirmed) {
                window.StorageService.deleteVocab(id);
                if (window.UIRenderer) window.UIRenderer.renderVocabList();
            }
        },

        handleAccountDeletion: async () => {
            const confirmed = await window.UIAction.showConfirm(
                'ACCOUNT LÖSCHEN?', 
                'Bist du absolut sicher? Dies wird alle deine Daten (Aufnahmen, Vokabeln, Einstellungen) unwiderruflich aus der Cloud und von diesem Gerät löschen.',
                'Ja, alles löschen'
            );

            if (!confirmed) return;

            window.UIAction.showVisualFeedback('Lösche Account...', 'Deine Daten werden sicher entfernt.');

            try {
                const result = await window.CloudSync.deleteAccount();
                
                if (result.error) {
                    throw new Error(result.error);
                }

                // Erfolg: Lokal alles löschen
                localStorage.clear();
                
                window.UIAction.showVisualFeedback('Erfolg', 'Dein Account wurde gelöscht. Auf Wiedersehen!', 'success');
                
                setTimeout(() => {
                    window.location.replace('login.html');
                }, 2000);

            } catch (e) {
                window.UIAction.hideVisualFeedback();
                window.UIAction.showError('Lösch-Fehler', e.message);
            }
        },

        exportVocabToCSV: () => {
            if (window.VocabService) window.VocabService.exportToCSV();
        },

        handleAppExit: async () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
            const msg = isStandalone 
                ? 'Möchtest du AbiFlex wirklich beenden? Du kannst die App jederzeit über deinen Homescreen neu starten.' 
                : 'Möchtest du die Sitzung beenden? Browser-Tabs können nicht direkt geschlossen werden, aber wir versetzen die App in den Ruhezustand.';
            
            const confirmed = await window.UIAction.showConfirm('AbiFlex beenden?', msg, 'Beenden');
            if (confirmed) {
                const exitOverlay = document.getElementById('exit-overlay');
                if (exitOverlay) {
                    exitOverlay.classList.remove('hidden');
                    exitOverlay.style.display = 'flex';
                    // Hide main layout
                    const layout = document.querySelector('.app-layout');
                    if (layout) layout.style.opacity = '0';
                    setTimeout(() => {
                        if (layout) layout.classList.add('hidden');
                    }, 500);
                }
            }
        },

        // --- QUIZ ACTIONS ---
        startQuiz: async function() {
            const topic = document.getElementById('quiz-topic-input').value.trim();
            const count = parseInt(document.getElementById('quiz-count-select').value);
            const difficulty = document.getElementById('quiz-diff-select').value;

            if (!topic) {
                this.showVisualFeedback("Bitte gib zuerst ein Thema ein!", "warn");
                return;
            }

            this.showVisualFeedback("KI erstellt dein Quiz... Einen Moment Geduld.", "loading");

            try {
                const questions = await window.QuizService.generateQuestions(topic, count, difficulty);
                this.hideVisualFeedback();
                
                // Render first question
                if (questions && questions.length > 0) {
                    window.UIRenderer.renderQuizQuestion(questions[0]);
                }
            } catch (err) {
                console.error("Quiz Start Error:", err);
                this.showVisualFeedback("Fehler beim Erstellen", "Die KI konnte das Quiz nicht generieren. Versuche es mit einem anderen Thema.", "error");
                
                // Reset button after feedback
                setTimeout(() => this.hideVisualFeedback(), 4000);
            }
        },

        submitQuizAnswer: function(index, btn) {
            const result = window.QuizService.submitAnswer(index);
            
            // UI Feedback
            const container = document.getElementById('quiz-question-container');
            const btns = container.querySelectorAll('.quiz-option-btn');
            
            btns.forEach((b, i) => {
                b.disabled = true;
                if (i === result.correctIndex) {
                    b.classList.add('correct');
                } else if (i === index && !result.isCorrect) {
                    b.classList.add('incorrect');
                }
            });

            // Show explanation/feedback
            const feedbackEl = document.createElement('div');
            feedbackEl.className = 'quiz-explanation fade-in u-mt-1-5 u-p-1 u-border-glass';
            feedbackEl.style.background = 'rgba(255,255,255,0.02)';
            feedbackEl.innerHTML = `
                <div class="u-font-700 u-mb-0-5 ${result.isCorrect ? 'u-success-text' : 'u-danger-text'}">
                    ${result.isCorrect ? 'Richtig! ✨' : 'Nicht ganz. 🤔'}
                </div>
                <div class="u-muted-text u-font-size-sm">${result.explanation}</div>
                <button class="secondary-btn u-w-100 u-mt-1" onclick="window.UIAction.nextQuizStep(${result.isFinished})">
                    ${result.isFinished ? 'Zum Ergebnis 🎓' : 'Nächste Frage &rarr;'}
                </button>
            `;
            container.appendChild(feedbackEl);
        },

        nextQuizStep: function(isFinished) {
            if (isFinished) {
                const stats = window.QuizService.getStats();
                window.UIRenderer.renderQuizResults(stats);
            } else {
                const nextQ = window.QuizService.getCurrentQuestion();
                window.UIRenderer.renderQuizQuestion(nextQ);
            }
        },

        resetQuiz: function() {
            window.QuizService.reset();
            window.UIRenderer.renderQuizSetup();
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
        if (masterModal) masterModal.classList.add('hidden');
    }
});

// 3. Escape-Taste: Alle Modals schließen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modals = ['master-modal', 'cloud-modal', 'subject-pick-modal', 'deadline-edit-modal', 'trainer-overlay'];
        modals.forEach(id => {
            const modal = document.getElementById(id);
            if (modal) modal.classList.add('hidden');
        });
        // Auch Feedback-Overlay schließen (nur wenn keine Buttons sichtbar → kein Confirm-Dialog)
        const overlay = document.querySelector('.modal-overlay:not(.hidden)');
        if (overlay && document.getElementById('overlay-buttons')?.classList.contains('hidden')) {
            window.UIAction.hideVisualFeedback();
        }
    }
});
