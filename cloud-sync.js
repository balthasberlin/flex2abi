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
            cloudModal.style.display = 'flex';
        }
    });

    function handleAuthStateChange(user) {
        currentUser = user;
        if (user) {
            // Logged In
            cloudStatusContainer.innerHTML = `
                <div class="nav-item cloud-active" style="cursor: default; background: rgba(0, 210, 158, 0.05); border: 1px solid rgba(0, 210, 158, 0.2);">
                    <span class="nav-icon">👤</span>
                    <div style="display: flex; flex-direction: column; overflow: hidden;">
                        <span class="nav-label" style="font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.email}</span>
                        <span style="font-size: 0.65rem; color: var(--accent-secondary);">Cloud-Sync aktiv</span>
                    </div>
                </div>
                <button class="secondary-btn" id="logout-btn" style="width: 100%; margin-top: 0.5rem; font-size: 0.7rem; padding: 0.3rem;">Abmelden</button>
            `;
            cloudModal.style.display = 'none';
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
        const localHistory = JSON.parse(localStorage.getItem('ai_record_history') || '[]');
        const needsUpload = (!initialSyncDone || (window.APP_STATE && window.APP_STATE.syncDirty));
        
        if (localHistory.length > 0 && needsUpload) {
            console.log('Cloud Sync: Lade lokale Änderungen hoch...');
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
            
            cloudData.forEach(cloudItem => {
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
            console.log("Cloud Sync: " + toDelete.length + " alte Audio-Datei(en) nach 24h Limits gelöscht.");
        }
    }

    // 4. Auth Actions
    async function handleLogin() {
        const email = emailInput.value;
        const password = passwordInput.value;
        showMessage('Status: Melde an...', 'var(--accent-primary)');
        
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            showMessage('Fehler: ' + error.message, 'var(--danger)');
        } else {
            showMessage('Erfolg: Erfolgreich angemeldet!', 'var(--accent-secondary)');
        }
    }

    async function handleSignup() {
        const email = emailInput.value;
        const password = passwordInput.value;
        showMessage('Status: Erstelle Account...', 'var(--accent-primary)');

        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
            showMessage('Fehler: ' + error.message, 'var(--danger)');
        } else {
            showMessage('Erfolg: Bestätigungs-E-Mail gesendet! (Bitte prüfen)', 'var(--accent-secondary)');
        }
    }

    function showMessage(msg, color) {
        statusMsg.textContent = msg;
        statusMsg.style.color = color;
        statusMsg.style.display = 'block';
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
        closeCloudBtn.addEventListener('click', () => cloudModal.style.display = 'none');

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
                    badge.style.color = '#fbbf24';
                } else {
                    badge.textContent = 'Cloud-Sync aktiv';
                    badge.style.color = 'var(--accent-secondary)';
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
        }
    };

})();
