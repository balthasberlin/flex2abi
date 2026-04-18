/**
 * Flex2Abi - Notification Service
 * Manages browser notifications and periodic reminder checks.
 */

window.NotificationService = (function() {
    
    const STORAGE_KEY_NOTIFIED = 'flex2abi_notified_reminders';
    const SETTING_KEY = 'flex2abi_notifications_enabled';

    const getNotifiedList = () => JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFIED) || '[]');
    const saveNotifiedList = (list) => localStorage.setItem(STORAGE_KEY_NOTIFIED, JSON.stringify(list));

    const parseDate = (d) => {
        if (!d || !d.includes('.')) return null;
        const parts = d.split('.');
        const currentYear = new Date().getFullYear();
        // Format: DD.MM.YYYY
        return new Date(parts[2] || currentYear, (parts[1] || 1) - 1, parts[0] || 1);
    };

    return {
        requestPermission: async () => {
            if (!('Notification' in window)) return false;
            if (Notification.permission === 'granted') return true;
            
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        },

        isEnabled: () => {
            return localStorage.getItem(SETTING_KEY) !== 'false' && Notification.permission === 'granted';
        },

        checkReminders: async () => {
            if (localStorage.getItem(SETTING_KEY) === 'false') return;
            if (Notification.permission !== 'granted') return;

            const history = window.StorageService.getHistory();
            const notified = getNotifiedList();
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            let newNotifications = false;

            history.forEach(session => {
                if (!session.deadlines) return;

                session.deadlines.forEach(d => {
                    const reminderDays = parseInt(d.reminder);
                    if (!reminderDays || isNaN(reminderDays)) return;

                    const deadlineDate = parseDate(d.date);
                    if (!deadlineDate) return;

                    // Calculate difference in days
                    const diffTime = deadlineDate.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    // Unique ID for this specific reminder: sessionID + task + days
                    const reminderId = `${session.id}_${d.task}_${reminderDays}`;

                    if (diffDays <= reminderDays && diffDays >= 0 && !notified.includes(reminderId)) {
                        // Trigger Notification
                        window.NotificationService.sendNotification(
                            "Termin-Erinnerung 📅",
                            `In ${diffDays} Tag(en): ${d.task} (${d.date})`
                        );
                        notified.push(reminderId);
                        newNotifications = true;
                    }
                });
            });

            if (newNotifications) {
                saveNotifiedList(notified);
            }
        },

        sendNotification: (title, body) => {
            if (Notification.permission !== 'granted') return;

            const options = {
                body: body,
                icon: 'icons/icon-192.png',
                badge: 'icons/icon-192.png',
                vibrate: [200, 100, 200],
                data: { url: window.location.href }
            };

            // Browser Notification
            const n = new Notification(title, options);
            n.onclick = (e) => {
                e.preventDefault();
                window.focus();
                n.close();
            };
            
            // Service Worker Notification (Better for PWA)
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, options);
                });
            }
        }
    };
})();
