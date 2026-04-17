/**
 * Flex2Abi - UI Renderer Module
 * Encapsulates all HTML generation and list rendering logic.
 */

window.UIRenderer = (function() {

    function createHistoryCardHTML(item, showFolderBadge = false) {
        const displayDate = item.date ? item.date.split(',')[0] : 'Unbekannt';
        const displayKeywords = (item.keywords && Array.isArray(item.keywords)) ? item.keywords.join(', ') : 'Keine Schlagworte';
        const folderName = item.folder ? item.folder.replace(/\*/g, '').trim() : 'Allgemein';
        
        let audioPlayerHtml = '';
        if (window.CloudSync && window.CloudSync.isLoggedIn()) {
            const audioUrl = window.CloudSync.getAudioUrl(item.id);
            if (audioUrl) {
                audioPlayerHtml = `
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--glass-border);">
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">Audio-Backup (Löscht sich nach 24h):</p>
                        <audio controls src="${audioUrl}" style="height: 35px; width: 100%; border-radius: 8px; outline: none;"
                            onerror="this.parentElement.innerHTML = \`
                                <div style='display:flex; align-items:center; gap:0.6rem; padding:0.6rem 0.9rem; border-radius:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);'>
                                    <span style='font-size:1.1rem; opacity:0.5;'>🎙️</span>
                                    <div>
                                        <div style='font-size:0.78rem; color:var(--text-muted); font-weight:500;'>Kein Audio-Backup verfügbar</div>
                                        <div style='font-size:0.7rem; color:var(--text-muted); opacity:0.6; margin-top:0.1rem;'>Backups werden automatisch nach 24h gelöscht.</div>
                                    </div>
                                </div>
                            \`">
                        </audio>
                    </div>
                `;

            }
        }

        const badgeHtml = showFolderBadge ? `<span class="history-label" style="margin-left: 1rem; color: var(--accent-secondary); font-weight: 500;">${folderName}</span>` : '';

        return `
            <div class="history-header">
                <span class="history-date">${displayDate}</span>
                ${badgeHtml}
                <span class="history-preview">${displayKeywords}</span>
                <div style="display: flex; align-items: center; gap: 0.8rem;">
                    <span class="history-toggle-icon">▼</span>
                    <button class="history-delete-btn" onclick="window.UIAction.deleteHistoryItem(${item.id}, event)">🗑️</button>
                </div>
            </div>
            <div class="history-content">
                <div class="summary-container">${parseMarkdown(item.summaryHtml || item.masterText || 'Keine Zusammenfassung verfügbar')}</div>
                <div style="margin-top: 1.5rem; display: flex; gap: 1rem; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
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
            .replace(/^---+$/gm, '<hr style="border-color: var(--glass-border); margin: 1rem 0;">')
            // Headers: ### Header -> h3
            .replace(/^### (.*$)/gm, '<h3 style="color: var(--accent-primary); margin-top: 1.2rem;">$1</h3>')
            // Math: $...$ -> styled span
            .replace(/\$([^$\n]+)\$/g, '<code style="background: rgba(255,255,255,0.08); padding: 0.1em 0.4em; border-radius: 4px; font-size: 0.95em; color: var(--accent-secondary);">$1</code>')
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Bullet lists: lines starting with "- " or "* " (multi-line)
            .replace(/^[*-] (.+)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul style="padding-left: 1.5rem; margin: 0.5rem 0;">${match}</ul>`)
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
            header.className = 'card';
            header.style.marginBottom = '2rem';
            header.style.border = '2px solid var(--accent-secondary)';
            header.innerHTML = parseMarkdown(masterText
                .replace(/FACH: (.+)/g, '<h2 style="color: var(--accent-secondary); margin-top:0;">STUDY: $1</h2>')
                .replace(/SCHLAGWORTE: (.+)/g, '<p style="color: var(--text-muted); font-size: 0.85rem;">TAGS: $1</p>')
                .replace(/### (.+)/g, '<h3 style="margin-top:1.5rem;">$1</h3>')
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
            card.className = 'card fade-in deadline-confirm-card';
            card.style.cssText = 'margin-top: 2rem; border: 2px solid var(--accent-primary); border-radius: 16px; padding: 1.5rem; width: 100%;';

            const rows = deadlines.map((d, i) => `
                <div id="deadline-row-${i}" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.8rem 0; border-bottom: 1px solid var(--glass-border); flex-wrap: wrap;">
                    <div>
                        <span style="font-size: 1.2rem; margin-right: 0.5rem;">📅</span>
                        <strong style="color: var(--accent-primary);">${d.date}</strong>
                        <span style="color: var(--text-main); margin-left: 0.6rem;">${d.task}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                        <button class="secondary-btn" style="padding: 0.35rem 0.9rem; font-size: 0.82rem; border-color: var(--accent-secondary); color: var(--accent-secondary);"
                            onclick="window.UIAction.confirmDeadline(${JSON.stringify(d).replace(/"/g, '&quot;')}, ${sessionId}, ${i})">
                            ✅ Übernehmen
                        </button>
                        <button class="secondary-btn" style="padding: 0.35rem 0.9rem; font-size: 0.82rem; opacity: 0.5;"
                            onclick="window.UIAction.dismissDeadlineRow(${i})">
                            ✕
                        </button>
                    </div>
                </div>
            `).join('');

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem;">
                    <span style="font-size: 1.4rem;">🗓️</span>
                    <div>
                        <h3 style="margin: 0; font-size: 1rem; color: var(--accent-primary);">Erkannte Termine</h3>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">Sind diese Daten korrekt? Wähle, welche in den Kalender-Reiter übernommen werden sollen.</p>
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
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: auto;">Zuletzt: ${latestDate}</p>
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
            libraryGrid.style.display = 'none';
            detailView.style.display = 'block';
            
            window.UIRenderer.renderSubjectItems(folderName);
        },

        renderSubjectItems: (folderName) => {
            const container = document.getElementById('subject-items-container');
            if (!container) return;
            
            const history = window.StorageService.getHistory();
            const filtered = history.filter(item => (item.folder || 'Allgemein') === folderName);
            
            if (filtered.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted);">Keine Einträge in diesem Ordner.</p>';
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

        renderHistory: () => {
            const historyContainer = document.getElementById('history-container');
            if (!historyContainer) return;

            const history = window.StorageService.getHistory();
            if (history.length === 0) {
                historyContainer.innerHTML = '<p style="color: var(--text-muted);">Noch keine Aufnahmen im Archiv.</p>';
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
            
            if (!listBody || !emptyState || !tableContainer) return;

            const vocab = window.StorageService.getVocabList();
            
            if (vocab.length === 0) {
                emptyState.style.display = 'block';
                tableContainer.style.display = 'none';
                return;
            }

            emptyState.style.display = 'none';
            tableContainer.style.display = 'block';
            
            listBody.innerHTML = vocab.map(v => `
                <tr class="fade-in">
                    <td><strong style="color: white;">${v.word}</strong></td>
                    <td>${v.translation}</td>
                    <td style="text-align: right;">
                        <button class="vocab-delete-btn" onclick="window.UIAction.deleteVocabItem(${v.id})">🗑️</button>
                    </td>
                </tr>
            `).join('');
        }
    };
})();
