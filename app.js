/**
 * AbiFlex - Core Entry Point
 * Coordinating UI events and delegating tasks to specialized services.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENTS ---
    const recordBtn = document.getElementById('record-btn');
    const summarizeBtn = document.getElementById('summarize-btn');
    const transcriptDiv = document.getElementById('transcript');
    const summaryDiv = document.getElementById('summary-content');
    const statusText = document.getElementById('status-text');
    const visualizer = document.getElementById('visualizer');
    const micIcon = document.getElementById('mic-icon');
    const stopIcon = document.getElementById('stop-icon');
    const aiSuggestionBadge = document.getElementById('ai-suggestion-badge');
    const diarizeBtn = document.getElementById('diarize-btn');
    const discardBtn = document.getElementById('discard-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-container');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');
    const recordingIndicator = document.getElementById('recording-indicator');
    const libraryGrid = document.getElementById('library-grid');
    const librarySearch = document.getElementById('library-search');
    const filterToggle = document.getElementById('toggle-filter-only');
    const backupToggle = document.getElementById('toggle-audio-backup');
    const noiseToggle = document.getElementById('toggle-noise-suppression');
    const notificationToggle = document.getElementById('toggle-notifications');

    // --- GLOBAL APP STATE ---
    window.APP_STATE = {
        isRecording: false,
        fullTranscript: '',
        audioChunks: [],
        audioBlob: null,
        currentSessionId: Date.now(),
        mediaRecorder: null,
        recognition: null,
        audioContext: null, // For filters
        currentStream: null,
        wakeLock: null,
        syncDirty: false
    };

    // --- INITIALIZATION ---
    setupNavigation();
    setupSpeechRecognition();
    setupVisualizerBars();


    // Global UI Access for Cloud Sync
    window.APP_UI = {
        renderHistory: window.UIRenderer.renderHistory,
        renderLibraryItems: window.UIRenderer.renderLibraryItems,
        refreshAll: () => {
            if (window.UIRenderer.renderHistory) window.UIRenderer.renderHistory();
            if (window.UIRenderer.renderLibraryItems) window.UIRenderer.renderLibraryItems();
            if (window.UIRenderer && window.UIRenderer.renderDeadlines) {
                window.UIRenderer.renderDeadlines(document.getElementById('deadline-list'));
            }
            if (window.UIRenderer && window.UIRenderer.renderRecentSummaries) {
                window.UIRenderer.renderRecentSummaries();
            }
        }
    };

    if (window.APP_UI) {
        window.APP_UI.refreshAll();
    }

    // --- NOTIFICATION INITIALIZATION ---
    if (window.NotificationService) {
        setTimeout(() => {
            window.NotificationService.checkReminders();
        }, 3000); // Wait for potential sync to finish
    }

    // Toggle Initialization
    const initToggle = (toggleElement, storageKey, defaultValue = 'true') => {
        if (!toggleElement) return;
        const savedState = localStorage.getItem(storageKey);
        toggleElement.checked = savedState !== null ? (savedState === 'true') : (defaultValue === 'true');
        // Initialer save für defaults falls noch nicht existent
        if (savedState === null) localStorage.setItem(storageKey, defaultValue);

        toggleElement.addEventListener('change', () => {
            localStorage.setItem(storageKey, toggleElement.checked);
        });
    };

    initToggle(filterToggle, 'abiflex_filter_only', 'true');
    initToggle(backupToggle, 'abiflex_audio_backup', 'false');
    initToggle(noiseToggle, 'abiflex_noise_suppression', 'true');
    initToggle(notificationToggle, 'abiflex_notifications_enabled', 'true');

    // --- NAVIGATION LOGIC ---
    function setupNavigation() {
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetView = item.getAttribute('data-view');
                switchView(targetView);
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // Library Back Button
        const backBtn = document.getElementById('back-to-library');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                document.getElementById('subject-detail-view').classList.add('hidden');
                libraryGrid.classList.remove('hidden');
            });
        }
    }

    function switchView(viewId) {
        views.forEach(v => v.classList.add('hidden'));
        const activeView = document.getElementById('view-' + viewId);
        if (activeView) activeView.classList.remove('hidden');

        if (viewId === 'library') {
            document.getElementById('subject-detail-view').classList.add('hidden');
            if (librarySearch) librarySearch.value = ''; // Reset ghost input
            libraryGrid.classList.remove('hidden');
            if (window.UIRenderer.renderLibraryItems) window.UIRenderer.renderLibraryItems();
            if (window.UIRenderer.renderHistory) window.UIRenderer.renderHistory();
        } else if (viewId === 'deadlines') {
            window.UIRenderer.renderDeadlines(document.getElementById('deadline-list'));
            if (window.NotificationService) window.NotificationService.checkReminders();
        } else if (viewId === 'vocab') {
            if (window.UIRenderer.renderVocabList) window.UIRenderer.renderVocabList();
        } else if (viewId === 'quiz') {
            if (window.UIRenderer.renderQuizSetup) window.UIRenderer.renderQuizSetup();
        }

        // Update Header Titles
        const titles = {
            'recorder': ['Aufnahme-Studio', 'Stimme aufnehmen, transkribieren und intelligent zusammenfassen.'],
            'library': ['Deine Bibliothek', 'Hier findest du all dein Wissen nach Fächern sortiert.'],
            'vocab': ['Vokabel-Scanner', 'Extrahiere Vokabeln aus Fotos und exportiere sie als CSV.'],
            'quiz': ['KI-Lernhilfe', 'Wähle ein Thema und lass dich von der KI abfragen.'],
            'deadlines': ['Termins-Radar', 'Alle Deadlines, Klausuren und Abgaben auf einen Blick.'],
            'settings': ['System-Einstellungen', 'Konfiguriere Audio-Filter, KI-Verhalten und Cloud-Speicher.']
        };
        if (titles[viewId]) {
            viewTitle.textContent = titles[viewId][0];
            viewSubtitle.textContent = titles[viewId][1];
        }
    }

    // --- SPEECH RECOGNITION ---
    function setupSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        window.APP_STATE.recognition = new SpeechRecognition();
        window.APP_STATE.recognition.continuous = true;
        window.APP_STATE.recognition.interimResults = true;
        window.APP_STATE.recognition.lang = 'de-DE';

        window.APP_STATE.recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    window.APP_STATE.fullTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            transcriptDiv.innerHTML = `<span class="u-primary-text">${window.APP_STATE.fullTranscript}</span><span class="u-muted-text">${interimTranscript}</span>`;
            if (window.APP_STATE.fullTranscript.trim().length > 10) summarizeBtn.disabled = false;
        };

        window.APP_STATE.recognition.onend = () => {
            if (window.APP_STATE.isRecording) {
                setTimeout(() => {
                    if (window.APP_STATE.isRecording) {
                        try { window.APP_STATE.recognition.start(); } catch (e) { }
                    }
                }, 500);
            }
        };
    }

    // --- VISUALIZER SETUP ---
    function setupVisualizerBars() {
        if (!visualizer) return;
        visualizer.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            const bar = document.createElement('div');
            bar.className = 'bar';
            visualizer.appendChild(bar);
        }
    }

    // --- SESSION SAVING ---
    function saveCurrentSessionToDisk(masterFullText = '') {
        if (!window.APP_STATE.fullTranscript || window.APP_STATE.fullTranscript.trim() === '') return;

        let folderName = 'Allgemein';
        let keywords = [];
        let deadlines = [];

        const existingHistory = window.StorageService.getHistory();
        const existingSession = existingHistory.find(h => h.id === window.APP_STATE.currentSessionId);

        let finalSummaryText = masterFullText || (existingSession ? existingSession.masterText : '');
        let finalSummaryHtml = finalSummaryText ? finalSummaryText.replace(/\n/g, '<br>') : '';

        if (finalSummaryText) {
            const folderMatch = finalSummaryText.match(/FACH:\s*(.+)/i);
            if (folderMatch && folderMatch[1]) folderName = folderMatch[1].replace(/\*/g, '').trim();

            const keywordsMatch = finalSummaryText.match(/SCHLAGWORTE:\s*(.+)/i);
            if (keywordsMatch && keywordsMatch[1]) keywords = keywordsMatch[1].replace(/\*/g, '').split(',').map(k => k.trim());

            const deadlinesMatch = finalSummaryText.match(/### 📅 ZENTRALE DEADLINES & TERMINE[\s\S]*/i);
            if (deadlinesMatch && deadlinesMatch[0]) {
                const parts = deadlinesMatch[0].split('\n');
                for (let line of parts) {
                    const dMatch = line.match(/- \[?(\d{2}\.\d{2}\.\d{4})\]? - (.+)/);
                    if (dMatch) deadlines.push({ date: dMatch[1], task: dMatch[2].replace(/\*/g, '').trim() });
                }
            }
        }

        const sessionData = {
            id: window.APP_STATE.currentSessionId,
            date: existingSession ? existingSession.date : new Date().toLocaleDateString('de-DE') + ', ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
            transcript: window.APP_STATE.fullTranscript,
            summaryHtml: finalSummaryHtml,
            masterText: finalSummaryText,
            folder: folderName,
            keywords: keywords,
            deadlines: deadlines
        };

        window.StorageService.saveSession(sessionData);

        if (window.APP_UI && window.APP_UI.refreshAll) {
            window.APP_UI.refreshAll();
        }
    }

    // --- RECORDING ACTIONS ---
    recordBtn.addEventListener('click', async () => {
        if (!window.APP_STATE.isRecording) {
            await startFullRecording();
        } else {
            await stopFullRecording();
        }
    });

    async function startFullRecording() {
        // Save current if exists
        if (window.APP_STATE.fullTranscript.trim()) {
            saveCurrentSessionToDisk();
        }

        window.APP_STATE.currentSessionId = Date.now();
        window.APP_STATE.fullTranscript = '';
        if (aiSuggestionBadge) aiSuggestionBadge.classList.add('hidden');
        transcriptDiv.textContent = '';

        try {
            statusText.textContent = 'Verbinde...';
            recordBtn.classList.add('recording');

            const constraints = AudioEngine.getConstraints();
            window.APP_STATE.currentStream = await navigator.mediaDevices.getUserMedia(constraints);

            const { filteredStream, context } = await AudioEngine.setupFilters(window.APP_STATE.currentStream);
            window.APP_STATE.audioContext = context;

            window.APP_STATE.isRecording = true;
            if (recordingIndicator) recordingIndicator.classList.remove('hidden');
            if (micIcon) micIcon.classList.add('hidden');
            if (stopIcon) stopIcon.classList.remove('hidden');
            const useNoiseSuppression = localStorage.getItem('abiflex_noise_suppression') !== 'false';
            statusText.textContent = useNoiseSuppression ? 'Aufnahme läuft (Filter aktiv)...' : 'Aufnahme läuft (RAW-Modus)...';
            statusText.className = useNoiseSuppression ? 'u-accent-text' : 'u-gold-text';

            AudioEngine.initVisualizer(window.APP_STATE.currentStream, document.querySelectorAll('.bar'));
            await AudioEngine.requestWakeLock();

            // MediaRecorder Setup
            const options = { audioBitsPerSecond: 24000 };
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options.mimeType = 'audio/webm;codecs=opus';

            window.APP_STATE.mediaRecorder = new MediaRecorder(filteredStream, options);
            window.APP_STATE.audioChunks = [];
            window.APP_STATE.mediaRecorder.ondataavailable = (e) => window.APP_STATE.audioChunks.push(e.data);
            window.APP_STATE.mediaRecorder.onstop = async () => {
                window.APP_STATE.audioBlob = new Blob(window.APP_STATE.audioChunks, { type: 'audio/webm' });
                const audioBlob = window.APP_STATE.audioBlob;
                const sessionId = window.APP_STATE.currentSessionId;
                diarizeBtn.disabled = false;
                window.APP_STATE.audioContext.close().catch(() => { });

                // Smart Audio Backup Logic
                if (backupToggle && backupToggle.checked && window.CloudSync && window.CloudSync.isLoggedIn()) {
                    if (window.CloudSync?.isLoggedIn() && audioBlob) {
                        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                        let shouldUpload = true;
                        if (connection && (connection.type === 'cellular' || connection.saveData)) {
                            shouldUpload = await window.UIAction.showConfirm(
                                "Datenverbrauch",
                                "Mobilfunknetz erkannt (Möglicher Datenverbrauch). Große Audio-Datei jetzt in die Cloud hochladen?",
                                "Hochladen"
                            );
                        }

                        if (shouldUpload) {
                            window.UIAction.showVisualFeedback('Sichere Audio...', 'Upload in die Cloud (24h Limit).');
                            const success = await window.CloudSync.uploadAudio(audioBlob, sessionId);
                            window.UIAction.hideVisualFeedback();
                            if (!success) window.UIAction.showError("Sync-Fehler", "Fehler beim Cloud-Upload der Audiodatei.");
                        }
                    }
                }
            };

            window.APP_STATE.mediaRecorder.start();
            if (window.APP_STATE.recognition) window.APP_STATE.recognition.start();

        } catch (err) {
            handleRecordingError(err);
        }
    }

    async function stopFullRecording() {
        try {
            if (window.APP_STATE.mediaRecorder && window.APP_STATE.mediaRecorder.state !== 'inactive') window.APP_STATE.mediaRecorder.stop();
            if (window.APP_STATE.recognition) window.APP_STATE.recognition.stop();
            if (window.APP_STATE.currentStream) window.APP_STATE.currentStream.getTracks().forEach(t => t.stop());

            AudioEngine.releaseWakeLock();
            AudioEngine.stopVisualizer(document.querySelectorAll('.bar'));

            window.APP_STATE.isRecording = false;
            recordBtn.classList.remove('recording');
            if (micIcon) micIcon.classList.remove('hidden');
            if (stopIcon) stopIcon.classList.add('hidden');
            statusText.textContent = 'Aufnahme beendet – bereit zur Analyse!';
            statusText.className = 'u-accent-text';
            if (recordingIndicator) recordingIndicator.classList.add('hidden');

            if (window.APP_STATE.fullTranscript.trim().length > 5 || window.APP_STATE.audioBlob) {
                if (summarizeBtn) summarizeBtn.disabled = false;
                if (discardBtn) discardBtn.classList.remove('hidden');
            }
        } catch (e) {
            console.error('Stop error:', e);
        }
    }

    // --- DISCARD LOGIC ---
    if (discardBtn) {
        discardBtn.addEventListener('click', async () => {
            if (window.APP_STATE.fullTranscript.length > 0 || window.APP_STATE.audioBlob) {
                const confirmed = await window.UIAction.showConfirm(
                    'Aufnahme verwerfen?',
                    'Möchtest du das aktuelle Transkript und die Aufnahme wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
                    'Verwerfen'
                );
                if (!confirmed) return;
            }
            // Reset State
            const idToDelete = window.APP_STATE.currentSessionId;
            window.APP_STATE.fullTranscript = '';
            window.APP_STATE.audioBlob = null;
            window.APP_STATE.audioChunks = [];
            window.APP_STATE.currentSessionId = Date.now();

            // Clear UI
            if (transcriptDiv) transcriptDiv.innerHTML = '<p class="u-muted-text">Noch kein Transkript vorhanden...</p>';
            if (summaryDiv) summaryDiv.innerHTML = '<p class="u-muted-text">Das Transkript wird hier intelligent zusammengefasst.</p>';

            summarizeBtn.disabled = true;
            diarizeBtn.disabled = true;
            if (discardBtn) discardBtn.classList.add('hidden');

            // Delete from Storage if it exists
            window.StorageService.deleteItem(idToDelete);
            window.APP_UI.refreshAll();

            // UI Feedback
            statusText.textContent = 'Aufnahme verworfen.';
            statusText.className = 'u-muted-text';
        });
    }

    // Accordion delegation is handled solely by ui-actions.js (global body listener)

    function handleRecordingError(err) {
        const msg = AudioEngine.getFriendlyErrorMessage(err);
        statusText.textContent = 'Fehler: ' + msg;
        statusText.style.color = 'var(--danger)';
        window.UIAction.showError('Mikrofon-Fehler', msg);
        window.APP_STATE.isRecording = false;
        recordBtn.classList.remove('recording');
        micIcon.style.display = 'block';
        stopIcon.style.display = 'none';
    }


    // --- TRANSCRIBE (GROQ WHISPER) ---
    diarizeBtn.addEventListener('click', async () => {
        if (!window.APP_STATE.audioBlob) {
            window.UIAction.showError('Fehler', 'Keine abgeschlossene Aufnahme gefunden.');
            return;
        }

        window.UIAction.showVisualFeedback('Transkribiere...', 'Nutze Whisper für maximale Präzision.');
        diarizeBtn.disabled = true;

        try {
            let data;

            if (CONFIG.EDGE_FUNCTION_URL) {
                // Sicherer Proxy: Audio per FormData (Binär) durch Edge Function
                const token = window.CloudSync?.getAuthToken ? await window.CloudSync.getAuthToken() : null;
                if (!token) throw new Error('Nicht eingeloggt – Edge Function benötigt Authentifizierung.');

                // FormData ist wesentlich effizienter als Base64 und verhindert Abstürze bei langen Aufnahmen
                const formData = new FormData();
                formData.append('action', 'groq-whisper');
                formData.append('file', window.APP_STATE.audioBlob, 'audio.webm');

                const response = await fetch(CONFIG.EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'x-authorization': `Bearer ${token}`,
                        'apikey': CONFIG.SUPABASE_ANON_KEY
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errText = await response.text();
                    let errorMessage = `Fehler ${response.status}`;
                    try {
                        const errJson = JSON.parse(errText);
                        errorMessage = errJson.error?.message || errJson.error || errorMessage;
                    } catch {
                        errorMessage = errText || errorMessage;
                    }
                    throw new Error(errorMessage);
                }
                data = await response.json();

            } else {
                // Fallback: Direkter Groq API-Call
                const apiKey = CONFIG.GROQ_API_KEY;
                if (!apiKey) {
                    window.UIAction.showError('Konfiguration', 'Groq API Key fehlt!');
                    return;
                }

                const formData = new FormData();
                formData.append('file', window.APP_STATE.audioBlob, 'audio.webm');
                formData.append('model', 'whisper-large-v3');
                formData.append('language', 'de');

                const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    body: formData
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error?.message || 'API Fehler');
                }
                data = await response.json();
            }

            window.APP_STATE.fullTranscript = data.text;
            transcriptDiv.innerHTML = `<span style="color: var(--text-main)">${data.text}</span>`;
            if (window.APP_STATE.fullTranscript.trim().length > 10) {
                summarizeBtn.disabled = false;
                if (discardBtn) discardBtn.style.display = 'inline-block';
            }

            // Deadlines werden im Summarize-Flow korrekt aus dem KI-Output extrahiert.

        } catch (e) {
            window.UIAction.showError('Transkriptions-Fehler', e.message);
            diarizeBtn.disabled = false;
        } finally {
            window.UIAction.hideVisualFeedback();
        }
    });

    // --- SUMMARIZATION ---
    summarizeBtn.addEventListener('click', async () => {
        // Hinweis: Wenn EDGE_FUNCTION_URL gesetzt ist, wird der Key serverseitig geladen.
        const apiKey = CONFIG.GEMINI_API_KEY;
        if (!apiKey && !CONFIG.EDGE_FUNCTION_URL) {
            window.UIAction.showError('Konfiguration', 'Gemini API Key fehlt!');
            return;
        }

        window.UIAction.showVisualFeedback('Analysiere...', 'Deine Lern-Häppchen werden zubereitet.');
        summarizeBtn.disabled = true;
        summaryDiv.innerHTML = '<div class="summary-loading"><div class="loader"></div>Wir bereiten Unterrichts-Häppchen vor...</div>';

        try {
            const results = await AIService.runFullAnalysis(
                window.APP_STATE.fullTranscript,
                (result, originalChunk, index) => {
                    if (index === 0) summaryDiv.innerHTML = '';
                    window.UIRenderer.renderChunkInUI(result, originalChunk);
                }
            );

            window.UIRenderer.renderMasterInUI(results.masterText);
            saveCurrentSessionToDisk(results.masterText);

            if (results.deadlines && results.deadlines.length > 0) {
                window.UIRenderer.renderDeadlineConfirmations(results.deadlines, window.APP_STATE.currentSessionId);
            }
        } catch (e) {
            summaryDiv.innerHTML = `<p style="color: var(--danger)">Fehler: ${e.message}</p>`;
        } finally {
            window.UIAction.hideVisualFeedback();
            summarizeBtn.disabled = false;
        }
    });

    // --- VOCABULARY EVENT LISTENERS ---
    const scanVocabBtn = document.getElementById('scan-vocab-btn');
    const startTrainingBtn = document.getElementById('start-training-btn');
    const exportVocabBtn = document.getElementById('export-vocab-btn');
    const vocabFileInput = document.getElementById('vocab-file-input');
    const confirmSubjectBtn = document.getElementById('confirm-subject-btn');

    if (scanVocabBtn) {
        scanVocabBtn.addEventListener('click', () => window.UIAction.triggerVocabScanner());
    }
    if (startTrainingBtn) {
        startTrainingBtn.addEventListener('click', () => window.UIAction.openTrainer());
    }
    if (confirmSubjectBtn) {
        confirmSubjectBtn.addEventListener('click', () => window.UIAction.confirmSubjectAndScan());
    }
    if (vocabFileInput) {
        vocabFileInput.addEventListener('change', (e) => window.UIAction.handleVocabFile(e));
    }
    if (exportVocabBtn) {
        exportVocabBtn.addEventListener('click', () => window.UIAction.exportVocabToCSV());
    }

    // --- ACCOUNT DELETION ---
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => window.UIAction.handleAccountDeletion());
    }

    // --- PWA INSTALL LOGIC ---
    let deferredPrompt;
    const installSection = document.getElementById('install-section');
    const iosInstallSection = document.getElementById('ios-install-guide');
    const installBtn = document.getElementById('install-app-btn');

    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (!isStandalone) {
        // Detect iOS
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        if (isIOS && iosInstallSection) {
            iosInstallSection.classList.remove('hidden');
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome from showing the mini-infobar
            e.preventDefault();
            deferredPrompt = e;
            // Show install section for supported browsers (Android/Chrome)
            if (installSection) installSection.classList.remove('hidden');
        });
    }

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                if (installSection) installSection.classList.add('hidden');
            }
            deferredPrompt = null;
        });
    }

    window.addEventListener('appinstalled', () => {
        if (installSection) installSection.classList.add('hidden');
        if (iosInstallSection) iosInstallSection.classList.add('hidden');
        deferredPrompt = null;
    });

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js').then(reg => {
                // Check for waiting updates
                if (reg.waiting) showUpdateBanner(reg);

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner(reg);
                        }
                    });
                });
            }).catch(err => console.warn('Service Worker Fehler:', err));
        });

        // Auto reload when new SW takes control
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });
    }

    function showUpdateBanner(registration) {
        const toast = document.getElementById('update-toast');
        const updateBtn = document.getElementById('update-btn');
        if (!toast || !updateBtn) return;

        toast.style.display = 'block';
        updateBtn.addEventListener('click', () => {
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            toast.style.display = 'none';
        });
    }

});
