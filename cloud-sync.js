/**
 * CLOUD SYNC MODULE (Supabase)
 * This module is isolated from app.js to ensure stability.
 */

(function() {
    let supabase;
    let currentUser = null;
    
    // UI Elements
    const cloudBtn = document.getElementById('cloud-login-btn');
    const cloudModal = document.getElementById('cloud-modal');
    const closeCloudBtn = document.getElementById('close-cloud-btn');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const loginBtn = document.getElementById('auth-login-btn');
    const signupBtn = document.getElementById('auth-signup-btn');
    const statusMsg = document.getElementById('auth-status-msg');
    const cloudStatusContainer = document.getElementById('cloud-status-container');

    // 1. Initialize Supabase
    function initSupabase() {
        if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_URL.includes('DEINE')) {
            console.warn('Cloud Sync: Supabase Konfiguration fehlt oder ist ungültig.');
            return false;
        }
        
        try {
            const { createClient } = window.supabase;
            supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            return true;
        } catch (e) {
            console.error('Cloud Sync: Fehler bei der Initialisierung:', e);
            return false;
        }
    }

    // 2. Auth Listeners
    async function checkUser() {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        handleAuthStateChange(user);
    }

    // Global Event Delegation for Cloud Buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('#logout-btn')) {
            if (supabase) {
                supabase.auth.signOut().then(() => {
                    window.location.replace('login.html');
                });
            }
        }
        if (e.target.closest('#cloud-login-btn')) {
            if (cloudModal) {
                cloudModal.classList.remove('hidden');
                cloudModal.style.display = 'flex';
            }
        }
    });

    function handleAuthStateChange(user) {
        currentUser = user;
        if (user) {
            // Logged In
            cloudStatusContainer.innerHTML = `
                <div class="nav-item cloud-active u-border-accent-soft">
                    <span class="nav-icon">👤</span>
                    <div class="u-flex u-flex-column u-overflow-y-auto">
                        <span class="nav-label u-font-size-xs">${user.email}</span>
                        <span class="u-font-size-xs u-accent-text">Cloud-Sync aktiv</span>
                    </div>
                </div>
                <button class="secondary-btn btn-compact u-w-100 u-mt-0-5 u-font-size-xs" id="logout-btn">Abmelden</button>
            `;
            cloudModal.classList.add('hidden');
            // Start initial sync
            syncData();
        } else {
            // Logged Out
            cloudStatusContainer.innerHTML = `
                <button class="nav-item cloud-btn" id="cloud-login-btn"><span class="nav-icon">☁️</span>
                    <span class="nav-label">Login / Sync</span>
                </button>
            `;
        }
    }

    // 3. Sync Logic (Upload/Download)
    let initialSyncDone = false;
    
    async function syncData() {
        if (!currentUser || !supabase) return;
        
        // A. Upload local new items to Cloud in BATCH (Nur bei Änderungen)
        const localHistory = window.StorageService.getHistory();
        const deletedQueue = window.StorageService.getDeletedQueue();
        const needsUpload = (!initialSyncDone || (window.APP_STATE && window.APP_STATE.syncDirty) || deletedQueue.length > 0);
        
        // --- 1. HANDLE DELETIONS ---
        if (deletedQueue.length > 0) {
            const { error: delError } = await supabase
                .from('recordings')
                .delete()
                .eq('user_id', currentUser.id)
                .in('session_id', deletedQueue);
            
            if (!delError) {
                window.StorageService.clearDeletedQueue(deletedQueue);
            } else {
                console.error('Cloud Sync Deletion Fehler:', delError);
            }
        }

        // --- 2. UPSERT NEW/UPDATED ITEMS ---
        if (localHistory.length > 0 && needsUpload) {
            const upsertData = localHistory.map(item => ({
                session_id: item.id,
                user_id: currentUser.id,
                date: item.date,
                transcript: item.transcript,
                summary_html: item.summaryHtml,
                master_text: item.masterText || null,
                deadlines: item.deadlines || [],
                folder: item.folder || 'Allgemein',
                keywords: item.keywords || []
            }));

            const { error: uploadError } = await supabase
                .from('recordings')
                .upsert(upsertData, { onConflict: 'session_id, user_id' });
                
            if (uploadError) console.error('Cloud Sync Upload Fehler (Batch):', uploadError);
            else if (window.APP_STATE) window.APP_STATE.syncDirty = false;
        }

        // B. Download from Cloud to local (merge)
        const { data: cloudData, error } = await supabase
            .from('recordings')
            .select('*')
            .order('session_id', { ascending: false });

        if (!error && cloudData) {
            let mergedHistory = [...localHistory];
            let dataChanged = false;
            const currentDeleted = window.StorageService.getDeletedQueue();
            
            cloudData.forEach(cloudItem => {
                // Falls das Item gerade gelöscht wurde (aber Cloud-Delete noch nicht durch ist), ignorieren
                if (currentDeleted.includes(cloudItem.session_id)) return;

                const localIndex = mergedHistory.findIndex(h => h.id === cloudItem.session_id);
                if (localIndex === -1) {
                    // Item existiert lokal nicht → von Cloud hinzufügen
                    mergedHistory.push({
                        id: cloudItem.session_id,
                        date: cloudItem.date,
                        transcript: cloudItem.transcript,
                        summaryHtml: cloudItem.summary_html,
                        masterText: cloudItem.master_text || null,
                        deadlines: Array.isArray(cloudItem.deadlines) ? cloudItem.deadlines : [],
                        folder: cloudItem.folder || 'Allgemein',
                        keywords: Array.isArray(cloudItem.keywords) ? cloudItem.keywords : []
                    });
                    dataChanged = true;
                } else {
                    // Item existiert lokal → fehlende Felder von Cloud ergänzen (ohne lokale Daten zu überschreiben)
                    const local = mergedHistory[localIndex];
                    let patched = false;
                    if (!local.masterText && cloudItem.master_text) {
                        local.masterText = cloudItem.master_text;
                        patched = true;
                    }
                    if ((!local.deadlines || local.deadlines.length === 0) && Array.isArray(cloudItem.deadlines) && cloudItem.deadlines.length > 0) {
                        local.deadlines = cloudItem.deadlines;
                        patched = true;
                    }
                    if (patched) dataChanged = true;
                }
            });
            
            if (dataChanged) {
                // Sort merged history by session_id (timestamp-based)
                mergedHistory.sort((a, b) => b.id - a.id);
                localStorage.setItem('ai_record_history', JSON.stringify(mergedHistory));
                
                // Trigger UI Refresh in main app ONLY if actual new data arrived
                if (window.APP_UI) {
                    window.APP_UI.refreshAll();
                }
            }
        }
        
        // C. Purge old audio files (> 24h)
        await purgeOldAudio();
        initialSyncDone = true;
    }

    async function purgeOldAudio() {
        if (!currentUser || !supabase) return;
        const { data, error } = await supabase.storage.from('audio_records').list(currentUser.id);
        if (error || !data) return;
        
        const now = Date.now();
        const toDelete = data.filter(file => {
            const created = new Date(file.created_at).getTime();
            return (now - created) > 24 * 60 * 60 * 1000;
        }).map(file => `${currentUser.id}/${file.name}`);
        
        if (toDelete.length > 0) {
            await supabase.storage.from('audio_records').remove(toDelete);
        }
    }

    // 4. Auth Actions
    async function handleLogin() {
        const email = emailInput.value;
        const password = passwordInput.value;
        showMessage('Status: Melde an...', 'u-primary-text');
        
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            showMessage('Fehler: ' + error.message, 'u-danger-text');
        } else {
            showMessage('Erfolg: Erfolgreich angemeldet!', 'u-accent-text');
        }
    }

    async function handleSignup() {
        const email = emailInput.value;
        const password = passwordInput.value;
        showMessage('Status: Erstelle Account...', 'u-primary-text');

        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
            showMessage('Fehler: ' + error.message, 'u-danger-text');
        } else {
            showMessage('Erfolg: Bestätigungs-E-Mail gesendet! (Bitte prüfen)', 'u-accent-text');
        }
    }

    function showMessage(msg, className) {
        statusMsg.textContent = msg;
        statusMsg.className = 'u-mt-1-5 u-text-center u-font-size-sm ' + className;
        statusMsg.classList.remove('hidden');
    }

    // 5. Setup Events
    if (initSupabase()) {
        checkUser();
        // Subscribe to auth changes
        supabase.auth.onAuthStateChange((event, session) => {
            handleAuthStateChange(session?.user || null);
        });

        loginBtn.addEventListener('click', handleLogin);
        signupBtn.addEventListener('click', handleSignup);
        closeCloudBtn.addEventListener('click', () => cloudModal.classList.add('hidden'));

        // Enter-Taste zum Anmelden
        const handleEnterKey = (e) => { if (e.key === 'Enter') handleLogin(); };
        emailInput.addEventListener('keydown', handleEnterKey);
        passwordInput.addEventListener('keydown', handleEnterKey);
        
        // Periodic sync every 2 minutes (less aggressive)
        setInterval(syncData, 120000);

        // Offline/Online detection
        function updateOfflineBadge(isOffline) {
            if (!currentUser) return;
            const badge = cloudStatusContainer.querySelector('.cloud-active span:last-child');
            if (badge) {
                if (isOffline) {
                    badge.textContent = '⚠️ Offline – Daten lokal gesichert';
                    badge.className = 'u-font-size-xs u-gold-text';
                } else {
                    badge.textContent = 'Cloud-Sync aktiv';
                    badge.className = 'u-font-size-xs u-accent-text';
                }
            }
        }

        window.addEventListener('offline', () => updateOfflineBadge(true));
        window.addEventListener('online', () => {
            updateOfflineBadge(false);
            syncData(); // Sofort synchronisieren wenn wieder online
        });
    }

    // 6. Public API for Audio & Auth
    window.CloudSync = {
        isLoggedIn: () => !!currentUser,
        getAuthToken: async () => {
            if (!supabase) return null;
            const { data: { session } } = await supabase.auth.getSession();
            return session?.access_token || null;
        },
        uploadAudio: async (blob, sessionId) => {
            if (!currentUser || !supabase) return false;
            const filePath = `${currentUser.id}/${sessionId}.webm`;
            const { error } = await supabase.storage.from('audio_records').upload(filePath, blob, { upsert: true });
            if (error) console.error("Audio Upload Fehler:", error);
            return !error;
        },
        getAudioUrl: (sessionId) => {
             if (!currentUser || !supabase) return null;
             const filePath = `${currentUser.id}/${sessionId}.webm`;
             const { data } = supabase.storage.from('audio_records').getPublicUrl(filePath);
             return data?.publicUrl || null;
        },
        deleteAccount: async () => {
            if (!currentUser || !supabase || !CONFIG.EDGE_FUNCTION_URL) return { error: 'Nicht eingeloggt oder Proxy fehlt.' };
            
            try {
                const token = await window.CloudSync.getAuthToken();
                if (!token) throw new Error('Authentifizierung fehlgeschlagen.');

                const response = await fetch(CONFIG.EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'apikey': CONFIG.SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({ action: 'delete-account' })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Serverfehler beim Löschen.');
                }

                return await response.json();
            } catch (e) {
                console.error('Account Löschen Fehler:', e);
                return { error: e.message };
            }
        }
    };

})();
