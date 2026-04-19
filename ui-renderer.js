/**
 * AbiFlex - UI Renderer Module
 * Encapsulates all HTML generation and list rendering logic.
 */

window.UIRenderer = (function() {
    
    // Internal helper for month names
    const getMonthName = (mon) => {
        const months = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
        return months[parseInt(mon) - 1] || 'MON';
    };


    function createHistoryCardHTML(item, showFolderBadge = false) {
        const displayDate = item.date ? item.date.split(',')[0] : 'Unbekannt';
        const displayKeywords = (item.keywords && Array.isArray(item.keywords)) ? item.keywords.join(', ') : 'Keine Schlagworte';
        const folderName = item.folder ? item.folder.replace(/\*/g, '').trim() : 'Allgemein';
        
        let audioPlayerHtml = '';
        if (window.CloudSync && window.CloudSync.isLoggedIn()) {
            const audioUrl = window.CloudSync.getAudioUrl(item.id);
            if (audioUrl) {
                audioPlayerHtml = `
                    <div class="u-mt-1 u-p-t-1 u-border-top">
                        <p class="u-font-size-xs u-muted-text u-mb-0-5">Audio-Backup (Löscht sich nach 24h):</p>
                        <audio controls src="${audioUrl}" class="u-w-100 u-rounded-8 u-outline-none" style="height: 35px;"
                            onerror="this.parentElement.innerHTML = \`
                                <div class='u-flex u-flex-center u-gap-0-5 u-rounded-10 u-bg-glass-light u-border-accent' style='padding:0.6rem 0.9rem;'>
                                    <span class='u-opacity-0-5 u-font-size-md'>🎙️</span>
                                    <div>
                                        <div class='u-font-size-xs u-muted-text u-font-500'>Kein Audio-Backup verfügbar</div>
                                        <div class='u-font-size-xs u-muted-text u-opacity-0-6 u-mt-0-2'>Backups werden automatisch nach 24h gelöscht.</div>
                                    </div>
                                </div>
                            \`">
                        </audio>
                    </div>
                `;

            }
        }

        const badgeHtml = showFolderBadge ? `<span class="history-label u-accent-text u-font-500 u-mt-0 u-flex" style="margin-left: 1rem;">${folderName}</span>` : '';

        return `
            <div class="history-header">
                <span class="history-date">${displayDate}</span>
                ${badgeHtml}
                <span class="history-preview">${displayKeywords}</span>
                <div class="u-flex u-flex-center u-gap-0-8">
                    <span class="history-toggle-icon">▼</span>
                    <button class="history-delete-btn" onclick="window.UIAction.deleteHistoryItem(${item.id}, event)">🗑️</button>
                </div>
            </div>
            <div class="history-content">
                <div class="summary-container">${parseMarkdown(item.summaryHtml || item.masterText || 'Keine Zusammenfassung verfügbar')}</div>
                <div class="u-mt-1-5 u-flex u-gap-1 u-border-top u-p-t-1">
                    <button class="secondary-btn" onclick="window.UIAction.refineHistoryItem(${item.id}, this)">🔍 Analysieren</button>
                </div>
                ${audioPlayerHtml}
            </div>
        `;
    }

    // --- SHARED MARKDOWN PARSER ---
    function parseMarkdown(text) {
        if (!text) return '';
        return text
            // Replace \n with actual newlines if stored as literal string
            .replace(/\\n/g, '\n')
            // Horizontal rule
            .replace(/^---+$/gm, '<hr class="u-border-bottom u-mb-1 u-mt-1">')
            // Headers: ### Header -> h3
            .replace(/^### (.*$)/gm, '<h3 class="u-accent-text u-mt-1">$1</h3>')
            // Math: $...$ -> styled span
            .replace(/\$([^$\n]+)\$/g, '<code class="u-bg-glass-light u-p-0-2 u-rounded-8 u-font-size-sm u-accent-text">$1</code>')
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Bullet lists: lines starting with "- " or "* " (multi-line)
            .replace(/^[*-] (.+)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul class="u-mb-0-5 u-p-l-1-5">${match}</ul>`)
            // Newlines to <br> where not already inside a block tag
            .replace(/\n(?!<\/?(h[1-6]|ul|li|div|p|hr))/g, '<br>');
    }

    return {
        createHistoryCardHTML,

        renderChunkInUI: (chunkText, originalSource) => {
            const summaryDiv = document.getElementById('summary-content');
            if (!summaryDiv) return;
            const div = document.createElement('div');
            div.className = 'summary-chunk';
            
            // Apply specialized replacements before markdown for semantic grouping
            let processed = chunkText
                .replace(/\*\*Erklärung\*\*: (.+)/g, '<p class="chunk-explanation"><strong>Erklärung:</strong> $1</p>')
                .replace(/ACHTUNG: \*\*Häufiger Irrtum\*\*: (.+)/g, '<div class="common-pitfall"><strong>ACHTUNG: Häufiger Irrtum</strong>$1</div>')
                .replace(/TIPP: \*\*Verständnis-Hilfe\*\*: (.+)/g, '<div class="study-tip">TIPP: <strong>Verständnis-Hilfe:</strong> $1</div>');
                
            div.innerHTML = parseMarkdown(processed) + `<div class="source-toggle-wrap"><button class="source-btn" onclick="window.UIAction.toggleSource(this)">🔍 Quelle</button><div class="source-content">${originalSource}</div></div>`;
            summaryDiv.appendChild(div);
        },

        renderMasterInUI: (masterText) => {
            const summaryDiv = document.getElementById('summary-content');
            if (!summaryDiv) return;
            const header = document.createElement('div');
            header.className = 'card u-mb-2 u-border-accent';
            header.innerHTML = parseMarkdown(masterText
                .replace(/FACH: (.+)/g, '<h2 class="u-accent-text u-mt-0">STUDY: $1</h2>')
                .replace(/SCHLAGWORTE: (.+)/g, '<p class="u-muted-text u-font-size-xs">TAGS: $1</p>')
                .replace(/### (.+)/g, '<h3 class="u-mt-1-5">$1</h3>')
            );
            summaryDiv.prepend(header);
        },

        renderDeadlineConfirmations: (deadlines, sessionId, targetContainer = null) => {
            const container = targetContainer || document.getElementById('summary-content');
            if (!container || deadlines.length === 0) return;

            // Remove any existing deadline confirmation card in THIS container
            const existing = container.querySelector('.deadline-confirm-card');
            if (existing) existing.remove();

            const card = document.createElement('div');
            card.className = 'card fade-in deadline-confirm-card u-mt-2 u-border-accent u-rounded-16 u-p-1-5 u-w-100';

            const rows = deadlines.map((d, i) => `
                <div id="deadline-row-${i}" class="u-flex u-flex-between u-gap-1 u-p-b-1 u-p-t-1 u-border-bottom u-flex-wrap">
                    <div class="u-flex u-flex-center u-gap-0-5">
                        <span class="u-font-size-md">📅</span>
                        <strong class="u-primary-text u-font-size-sm">${d.date}</strong>
                        <span class="u-muted-text u-font-size-sm u-ml-0-5">${d.task}</span>
                    </div>
                    <div class="u-flex u-gap-0-5 u-flex-center u-flex-wrap u-mt-0-5 u-w-100 u-flex-end">
                        <select class="modern-input u-w-auto u-font-size-xs u-bg-glass-light btn-compact u-p-x-0-5" id="reminder-select-${i}">
                            <option value="0">Keine Erinnerung</option>
                            <option value="1">1 Tag vorher</option>
                            <option value="3">3 Tage vorher</option>
                            <option value="7">1 Woche vorher</option>
                        </select>
                        <button class="secondary-btn u-font-size-xs u-border-accent u-accent-text u-rounded-8 u-p-y-0-35 u-p-x-0-9"
                            onclick="window.UIAction.confirmDeadline(${JSON.stringify(d).replace(/"/g, '&quot;')}, ${sessionId}, ${i})">
                            ✅ Übernehmen
                        </button>
                        <button class="secondary-btn u-font-size-xs u-opacity-0-5 u-rounded-8 u-p-y-0-35 u-p-x-0-9"
                            onclick="window.UIAction.dismissDeadlineRow(${i})">
                            ✕
                        </button>
                    </div>
                </div>
            `).join('');

            card.innerHTML = `
                <div class="u-flex u-flex-center u-gap-0-8 u-mb-1">
                    <span class="u-font-size-md">🗓️</span>
                    <div>
                        <h3 class="u-mb-0 u-font-size-md u-primary-text">Erkannte Termine</h3>
                        <p class="u-mb-0 u-font-size-xs u-muted-text">Sind diese Daten korrekt? Wähle, welche in den Kalender-Reiter übernommen werden sollen.</p>
                    </div>
                </div>
                ${rows}
            `;

            container.appendChild(card);
        },

        renderLibraryItems: () => {
            const libraryGrid = document.getElementById('library-grid');
            if (!libraryGrid) return;
            const history = window.StorageService.getHistory();
            
            libraryGrid.innerHTML = '';
            const grouped = history.reduce((acc, item) => {
                try {
                    let f = item.folder || 'Allgemein';
                    f = f.replace(/\*/g, '').trim(); 
                    if(!acc[f]) acc[f] = [];
                    acc[f].push(item);
                } catch (e) {
                    console.warn('Skipped corrupt item in groupby:', item.id);
                }
                return acc;
            }, {});

            Object.keys(grouped).forEach(folder => {
                try {
                    const card = document.createElement('div');
                    card.className = 'subject-card fade-in';
                    const latestDate = grouped[folder][0]?.date ? grouped[folder][0].date.split(',')[0] : 'Unbekannt';
                    
                    card.innerHTML = `
                        <div class="subject-card-header">
                            <div class="subject-icon">${window.StorageService.getFolderIcon(folder)}</div>
                            <span class="subject-item-count">${grouped[folder].length} Einträge</span>
                        </div>
                        <h3>${folder}</h3>
                        <p class="u-font-size-xs u-muted-text u-mt-auto">Zuletzt: ${latestDate}</p>
                    `;
                    
                    card.addEventListener('click', () => window.UIRenderer.showSubjectDetail(folder));
                    libraryGrid.appendChild(card);
                } catch (cardErr) {
                    console.error('Failed to render library card:', folder, cardErr);
                }
            });
        },

        showSubjectDetail: (folderName) => {
            const detailView = document.getElementById('subject-detail-view');
            const titleEl = document.getElementById('current-subject-title');
            const libraryGrid = document.getElementById('library-grid');
            
            if (!detailView || !titleEl || !libraryGrid) return;
            
            titleEl.textContent = `Fach: ${folderName}`;
            libraryGrid.classList.add('hidden');
            detailView.classList.remove('hidden');
            
            window.UIRenderer.renderSubjectItems(folderName);
        },

        renderSubjectItems: (folderName) => {
            const container = document.getElementById('subject-items-container');
            if (!container) return;
            
            const history = window.StorageService.getHistory();
            const filtered = history.filter(item => (item.folder || 'Allgemein') === folderName);
            
            if (filtered.length === 0) {
                container.innerHTML = '<p class="u-muted-text">Keine Einträge in diesem Ordner.</p>';
                return;
            }

            container.innerHTML = '';
            filtered.forEach(item => {
                try {
                    const historyItem = document.createElement('div');
                    historyItem.className = 'history-item fade-in';
                    historyItem.innerHTML = createHistoryCardHTML(item, false);
                    container.appendChild(historyItem);
                } catch (err) {
                    console.error("Failed to render Subject Item:", err, item);
                }
            });
        },

        renderRecentSummaries: () => {
            const container = document.getElementById('recent-summaries-container');
            const section = document.getElementById('recent-summaries-section');
            if (!container || !section) return;

            const history = window.StorageService.getHistory();
            if (history.length === 0) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');
            container.innerHTML = '';
            
            // Show only the 3 most recent
            const recent = history.slice(0, 3);
            recent.forEach(item => {
                try {
                    const div = document.createElement('div');
                    div.className = 'history-item fade-in';
                    div.innerHTML = createHistoryCardHTML(item, true); // True to show folder badge
                    container.appendChild(div);
                } catch (err) {
                    console.error("Failed to render Recent Summary:", err, item);
                }
            });
        },

        renderHistory: () => {
            const historyContainer = document.getElementById('history-container');
            if (!historyContainer) return;

            const history = window.StorageService.getHistory();
            if (history.length === 0) {
                historyContainer.innerHTML = '<p class="u-muted-text">Noch keine Aufnahmen im Archiv.</p>';
                return;
            }

            historyContainer.innerHTML = '';
            history.forEach(item => {
                try {
                    const historyItem = document.createElement('div');
                    historyItem.className = 'history-item fade-in';
                    historyItem.innerHTML = createHistoryCardHTML(item, true);
                    historyContainer.appendChild(historyItem);
                } catch (err) {
                     console.error("Failed to render History Item:", err, item);
                }
            });
        },

        renderVocabList: () => {
            const listBody = document.getElementById('vocab-list-body');
            const emptyState = document.getElementById('vocab-list-empty');
            const tableContainer = document.getElementById('vocab-table-container');
            const trainBtn = document.getElementById('start-training-btn');
            const statsContainer = document.getElementById('vocab-stats-container');
            const filterBar = document.getElementById('vocab-filter-bar');
            
            if (!listBody || !emptyState || !tableContainer) return;

            const allVocab = window.StorageService.getVocabList();
            
            if (allVocab.length === 0) {
                emptyState.classList.remove('hidden');
                tableContainer.classList.add('hidden');
                if (trainBtn) trainBtn.classList.add('hidden');
                if (statsContainer) statsContainer.classList.add('hidden');
                if (filterBar) filterBar.classList.add('hidden');
                return;
            }

            emptyState.classList.add('hidden');
            tableContainer.classList.remove('hidden');
            if (trainBtn) trainBtn.classList.remove('hidden');
            if (statsContainer) statsContainer.classList.remove('hidden');
            if (filterBar) filterBar.classList.remove('hidden');

            // 1. Get filter states
            const searchTerm = (document.getElementById('vocab-search')?.value || '').toLowerCase();
            const subjectFilter = document.getElementById('vocab-subject-filter')?.value || 'Alle';

            // 2. Filter list
            const filteredVocab = allVocab.filter(v => {
                const matchesSearch = v.word.toLowerCase().includes(searchTerm) || 
                                     v.translation.toLowerCase().includes(searchTerm);
                const matchesSubject = subjectFilter === 'Alle' || v.subject === subjectFilter;
                return matchesSearch && matchesSubject;
            });

            // 3. Update Stats (based on ALL vocab, or filtered? Let's use ALL for global progress)
            const stats = {
                total: allVocab.length,
                learning: allVocab.filter(v => (v.level || 1) <= 3).length,
                mastered: allVocab.filter(v => (v.level || 1) > 3).length
            };

            const statsTotal = document.getElementById('stats-total');
            const statsLearning = document.getElementById('stats-learning');
            const statsMastered = document.getElementById('stats-mastered');

            if (statsTotal) statsTotal.textContent = stats.total;
            if (statsLearning) statsLearning.textContent = stats.learning;
            if (statsMastered) statsMastered.textContent = stats.mastered;

            // 4. Update Subject Filter Dropdown (only if not already interactive)
            const subjectSelect = document.getElementById('vocab-subject-filter');
            if (subjectSelect && !subjectSelect.dataset.initialized) {
                const subjects = [...new Set(allVocab.map(v => v.subject || 'Allgemein'))];
                const currentVal = subjectSelect.value;
                subjectSelect.innerHTML = '<option value="Alle">Alle Fächer</option>' + 
                    subjects.map(s => `<option value="${s}" ${s === currentVal ? 'selected' : ''}>${s}</option>`).join('');
                
                subjectSelect.dataset.initialized = "true"; // Simple way to prevent re-rendering options every time if not needed
                
                subjectSelect.addEventListener('change', () => window.UIRenderer.renderVocabList());
                document.getElementById('vocab-search')?.addEventListener('input', () => window.UIRenderer.renderVocabList());
            }

            // 5. Render Table rows
            listBody.innerHTML = filteredVocab.map(v => {
                const subjectIcon = window.StorageService.getFolderIcon(v.subject || 'Allgemein');
                const isMastered = (v.level || 1) > 3;

                let levelHtml = '<div class="level-dots">';
                for(let i=1; i<=5; i++) {
                    levelHtml += `<div class="level-dot ${i <= (v.level || 1) ? 'active' : ''}"></div>`;
                }
                levelHtml += '</div>';

                return `
                    <tr class="fade-in ${isMastered ? 'vocab-row-mastered' : ''}">
                        <td><strong class="u-text-white">${v.word}</strong></td>
                        <td>${v.translation}</td>
                        <td>
                            <div class="u-flex u-flex-center u-gap-0-5 u-font-size-xs u-muted-text">
                                <span>${subjectIcon}</span> ${v.subject || 'Allgemein'}
                            </div>
                        </td>
                        <td>${levelHtml}</td>
                        <td class="u-text-right">
                            <button class="vocab-delete-btn" onclick="window.UIAction.deleteVocabItem(${v.id})">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('');

            if (filteredVocab.length === 0 && allVocab.length > 0) {
                listBody.innerHTML = `<tr><td colspan="5" class="u-text-center u-p-2 u-muted-text">Keine Ergebnisse für deine Suche.</td></tr>`;
            }
        },

        renderTrainerSetup: (subjects) => {
            const overlay = document.getElementById('trainer-overlay');
            if (!overlay) return;

            const subjectOptions = subjects.map(s => `<option value="${s}">${s}</option>`).join('');

            overlay.innerHTML = `
                <div class="trainer-header">
                    <h2 class="u-mt-0">Lern-Session setup</h2>
                    <button class="secondary-btn" onclick="window.UIAction.closeTrainer()">Schließen</button>
                </div>

                <div class="trainer-setup card fade-in">
                    <div class="setup-option">
                        <label>Was möchtest du üben?</label>
                        <select id="trainer-subject-select" class="modern-input u-w-100">
                            <option value="Alle">Alle Fächer</option>
                            ${subjectOptions}
                        </select>
                    </div>

                    <div class="setup-option">
                        <label>Lern-Modus</label>
                        <div class="u-grid u-grid-2 u-gap-1">
                            <button id="mode-flashcard" class="secondary-btn active" onclick="this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); this.classList.add('active')">Karteikarten</button>
                            <button id="mode-type" class="secondary-btn" onclick="this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); this.classList.add('active')">Tippen</button>
                        </div>
                    </div>

                    <div class="setup-option">
                        <label>Richtung</label>
                        <select id="trainer-direction-select" class="modern-input u-w-100">
                            <option value="mixed">Zufällig gemischt</option>
                            <option value="a-b">Wort -> Übersetzung</option>
                            <option value="b-a">Übersetzung -> Wort</option>
                        </select>
                    </div>

                    <button class="record-btn u-w-100 u-mt-1 u-font-size-md" style="height: 60px;" onclick="window.UIAction.startTrainerSession()">
                        Session starten 🚀
                    </button>
                </div>
            `;
            overlay.style.display = 'flex';
        },

        renderTrainerCard: (card) => {
            const overlay = document.getElementById('trainer-overlay');
            if (!overlay) return;

            const progressPercent = (card.index / card.total) * 100;

            let interactionHtml = '';
            if (card.mode === 'flashcard') {
                interactionHtml = `
                    <div id="flashcard-controls" class="hidden u-w-100 u-max-w-500 u-gap-1-5">
                        <button class="secondary-btn u-flex-1 u-danger-text u-rounded-16" style="height: 60px;" onclick="window.UIAction.handleTrainerFeedback(false)">
                            Nicht gewusst ❌
                        </button>
                        <button class="record-btn u-flex-1 u-rounded-16" style="height: 60px; background: var(--success);" onclick="window.UIAction.handleTrainerFeedback(true)">
                            Gewusst! ✅
                        </button>
                    </div>
                    <p id="click-hint" class="u-muted-text u-font-size-sm">Klicke auf die Karte zum Umdrehen</p>
                `;
            } else {
                interactionHtml = `
                    <div class="type-input-wrap fade-in">
                        <input type="text" id="trainer-type-input" class="trainer-input" placeholder="Übersetzung eingeben..." autofocus autocomplete="off">
                        <p class="u-muted-text u-font-size-xs">Drücke ENTER zum Bestätigen</p>
                    </div>
                `;
            }

            overlay.innerHTML = `
                <div class="trainer-header">
                    <div class="u-flex u-flex-center u-gap-1">
                        <span class="u-bg-glass-light u-rounded-12 u-font-size-xs u-border-accent-soft" style="padding: 5px 12px;">
                            ${card.subject}
                        </span>
                    </div>
                    <button class="secondary-btn" onclick="window.UIAction.closeTrainer()">Abbrechen</button>
                </div>

                <div class="trainer-progress-wrap">
                    <div class="u-flex u-flex-between u-mb-0-6 u-font-size-xs">
                        <span>Vokabel ${card.index} von ${card.total}</span>
                        <span>${Math.round(progressPercent)}%</span>
                    </div>
                    <div class="progress-bar-bg u-h-8" style="height: 8px;">
                        <div class="progress-bar-fill" style="width: ${progressPercent}%; background: var(--accent-primary); box-shadow: 0 0 10px var(--accent-primary);"></div>
                    </div>
                </div>

                <div class="flashcard-container" id="trainer-card" onclick="window.UIAction.flipTrainerCard()">
                    <div class="flashcard-inner">
                        <div class="flashcard-front">
                            <span class="flashcard-label">FRAGE</span>
                            <div class="flashcard-word">${card.question}</div>
                        </div>
                        <div class="flashcard-back">
                            <span class="flashcard-label">ANTWORT</span>
                            <div class="flashcard-word">${card.answer}</div>
                        </div>
                    </div>
                </div>

                ${interactionHtml}
            `;

            // Focus input if in type mode
            if (card.mode === 'type') {
                setTimeout(() => {
                    const input = document.getElementById('trainer-type-input');
                    if (input) {
                        input.focus();
                        input.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') window.UIAction.handleTrainerTypeSubmit();
                        });
                    }
                }, 100);
            }
        },

        renderTrainerResults: (stats) => {
            const overlay = document.getElementById('trainer-overlay');
            if (!overlay) return;

            overlay.innerHTML = `
                <div class="trainer-header">
                    <h2 class="u-mt-0">Session beendet!</h2>
                </div>

                <div class="card fade-in u-max-w-500 u-w-100 u-text-center" style="padding: 3rem 2rem;">
                    <div class="u-font-size-xl u-mb-1-5" style="font-size: 4rem;">${stats.percentage > 80 ? '🏆' : stats.percentage > 50 ? '🥈' : '📚'}</div>
                    <h2 class="u-mb-0-5">Klasse Leistung!</h2>
                    <p class="u-muted-text u-mb-2">Du hast die Session erfolgreich abgeschlossen.</p>
                    
                    <div class="result-stats-grid">
                        <div class="stat-item">
                             <div class="stat-value u-success-text">${stats.correct}</div>
                             <div class="stat-label">Richtig</div>
                        </div>
                        <div class="stat-item">
                             <div class="stat-value u-primary-text">${stats.percentage}%</div>
                             <div class="stat-label">Erfolg</div>
                        </div>
                    </div>

                    <button class="record-btn u-w-100 u-mt-2" style="height: 60px;" onclick="window.UIAction.closeTrainer()">
                        Zurück zur Übersicht
                    </button>
                </div>
            `;
        },

        renderDeadlines: (containerElement) => {
            if (!containerElement) return;
            const history = window.StorageService.getHistory();
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

        // --- QUIZ RENDERING ---
        renderQuizSetup: () => {
            document.getElementById('quiz-setup').classList.remove('hidden');
            document.getElementById('quiz-active').classList.add('hidden');
            document.getElementById('quiz-results').classList.add('hidden');
        },

        renderQuizQuestion: (q) => {
            const container = document.getElementById('quiz-question-container');
            const setupView = document.getElementById('quiz-setup');
            const activeView = document.getElementById('quiz-active');

            if (!q || !container) return;

            setupView.classList.add('hidden');
            activeView.classList.remove('hidden');

            // Update Progress
            const progress = window.QuizService.getProgress();
            const stats = window.QuizService.getStats();
            
            document.getElementById('quiz-progress-text').textContent = `Frage ${stats.results.length + 1} von ${stats.total}`;
            document.getElementById('quiz-score-text').textContent = `Punkte: ${stats.score}`;
            document.getElementById('quiz-progress-bar').style.width = `${progress}%`;

            container.innerHTML = `
                <div class="fade-in">
                    <h3 class="u-mb-2 u-lh-1-4">${q.question}</h3>
                    <div class="quiz-options">
                        ${q.options.map((opt, i) => `
                            <button class="quiz-option-btn u-w-100" onclick="window.UIAction.submitQuizAnswer(${i}, this)">
                                ${opt}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        },

        renderQuizResults: (stats) => {
            const container = document.getElementById('quiz-results');
            const activeView = document.getElementById('quiz-active');
            
            if (!container) return;

            activeView.classList.add('hidden');
            container.classList.remove('hidden');

            const scoreColor = stats.percentage >= 80 ? 'var(--success)' : (stats.percentage >= 50 ? 'var(--accent-gold)' : 'var(--danger)');

            container.innerHTML = `
                <div class="card fade-in u-text-center">
                    <div class="u-font-size-xl u-mb-1" style="font-size: 3rem;">🎓</div>
                    <h2>Quiz beendet!</h2>
                    <p class="u-muted-text u-mb-2">Thema: ${stats.topics}</p>

                    <div class="result-stat-circle" style="border-color: ${scoreColor}">
                        <div class="result-stat-value">${stats.score}/${stats.total}</div>
                        <div class="result-stat-label">Punkte</div>
                    </div>

                    <h3 class="u-mb-1-5 u-text-left">Antworten im Überblick</h3>
                    <div class="u-text-left u-mb-3">
                        ${stats.results.map(r => `
                            <div class="quiz-review-item u-mb-1 ${r.isCorrect ? '' : 'u-border-danger-soft'}">
                                <div class="u-flex u-flex-between u-mb-0-5">
                                    <div class="quiz-review-q">${r.question}</div>
                                    <span>${r.isCorrect ? '✅' : '❌'}</span>
                                </div>
                                <div class="quiz-review-ans ${r.isCorrect ? 'u-success-text' : 'u-muted-text'}">Deine Wahl: ${r.selected}</div>
                                ${!r.isCorrect ? `<div class="quiz-review-ans u-success-text">Richtig: ${r.correct}</div>` : ''}
                                <div class="quiz-explanation">${r.explanation}</div>
                            </div>
                        `).join('')}
                    </div>

                    <button class="record-btn u-w-100 u-font-700" onclick="window.UIAction.resetQuiz()">
                        Neues Quiz starten 🔄
                    </button>
                </div>
            `;
        }

    };
})();
