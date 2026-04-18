/**
 * Flex2Abi - Audio Engine Module
 * Managing hardware access, real-time filtering, and visualizer logic.
 */

window.AudioEngine = (function() {
    let audioContext;
    let analyser;
    let dataArray;
    let animationId;
    let wakeLock = null;

    return {
        // --- HARDWARE CONSTRAINTS ---
        getConstraints: () => {
            const useNoiseSuppression = localStorage.getItem('flex2abi_noise_suppression') !== 'false';
            return {
                audio: {
                    echoCancellation: useNoiseSuppression,
                    noiseSuppression: useNoiseSuppression,
                    autoGainControl: useNoiseSuppression,
                    // Advanced hints for browsers
                    channelCount: 1,
                    sampleRate: { ideal: 16000 }
                }
            };
        },

        // --- FILTER PIPELINE ---
        setupFilters: async (sourceStream) => {
            const filterContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const source = filterContext.createMediaStreamSource(sourceStream);
            const filteredDest = filterContext.createMediaStreamDestination();

            const useNoiseSuppression = localStorage.getItem('flex2abi_noise_suppression') !== 'false';

            if (useNoiseSuppression) {
                // Highpass (cut below 80Hz)
                const highpass = filterContext.createBiquadFilter();
                highpass.type = 'highpass';
                highpass.frequency.value = 80;
                highpass.Q.value = 0.7;

                // Lowpass (cut above 8kHz)
                const lowpass = filterContext.createBiquadFilter();
                lowpass.type = 'lowpass';
                lowpass.frequency.value = 8000;
                lowpass.Q.value = 0.7;

                // Dynamics Compressor
                const compressor = filterContext.createDynamicsCompressor();
                compressor.threshold.value = -30;
                compressor.knee.value = 10;
                compressor.ratio.value = 4;
                compressor.attack.value = 0.003;
                compressor.release.value = 0.25;

                source.connect(highpass);
                highpass.connect(lowpass);
                lowpass.connect(compressor);
                compressor.connect(filteredDest);
            } else {
                // RAW Audio Flow: Bypass filters entirely
                source.connect(filteredDest);
            }

            return {
                filteredStream: filteredDest.stream,
                context: filterContext
            };
        },

        // --- VISUALIZER ---
        initVisualizer: (stream, barsElements) => {
            if (audioContext) {
                try { audioContext.close(); } catch(e) {}
            }
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 64;
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            // Pre-set transition to none to save mobile CPU overhead (avoiding layout thrashing)
            for (let i = 0; i < barsElements.length; i++) {
                barsElements[i].style.transition = 'none';
            }

            const draw = () => {
                animationId = requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                
                for (let i = 0; i < barsElements.length; i++) {
                    const barHeight = (dataArray[i % dataArray.length] / 255) * 100;
                    barsElements[i].style.height = Math.max(10, barHeight) + '%';
                }
            };
            draw();
        },

        stopVisualizer: (barsElements) => {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            if (audioContext) {
                audioContext.close().catch(() => {});
                audioContext = null;
            }
            if (barsElements) {
                barsElements.forEach(bar => {
                    bar.style.height = '10%';
                    bar.style.transition = 'height 0.3s ease';
                });
            }
        },

        // --- WAKE LOCK ---
        requestWakeLock: async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await navigator.wakeLock.request('screen');
                } catch (err) {
                    console.warn('Flex2Abi: Wake Lock error:', err);
                }
            }
        },

        releaseWakeLock: () => {
            if (wakeLock !== null) {
                wakeLock.release().then(() => wakeLock = null);
            }
        },

        // --- ERROR DIAGNOSTICS ---
        getFriendlyErrorMessage: (err) => {
            if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
                return 'Blockiert! Bitte oben links im Browser (Schloss-Symbol) oder in den Windows-Einstellungen erlauben.';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                return 'Blockiert von einer anderen App (z.B. Discord/Zoom)! Bitte schließen.';
            } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
                return 'Kein Mikrofon gefunden! Bitte USB-Verbindung prüfen.';
            }
            return 'Unbekannter Fehler beim Mikrofonzugriff.';
        }
    };
})();
