/**
 * Notification Helper for Essie Cyber POS
 * Manages Web Notifications, Web Audio alerts,
 * and in-app alert toasts for low stock warnings on cyber consumables and stationery.
 */

const NOTIFIED_ITEMS_KEY = 'essie_notified_low_stock';

export function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    return Notification.requestPermission();
}

export function playAlertChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6 note

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.35);
    } catch {
        // AudioContext restricted prior to user gesture
    }
}

export function playPopChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5
        osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.14); // D6

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.22);
    } catch {}
}

export function playSuccessChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        
        // 3-note ascending chord (E5, G#5, B5)
        const notes = [659.25, 830.61, 987.77];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.07);
            gain.gain.setValueAtTime(0.18, now + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.28);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + idx * 0.07);
            osc.stop(now + idx * 0.07 + 0.28);
        });
    } catch {}
}

export function showInAppLowStockBanner(itemName, stockQty, threshold) {
    let container = document.getElementById('essie-notification-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'essie-notification-toast-container';
        // Positioned at bottom-right out of the way of all forms, search inputs, and navigation buttons
        container.className = 'fixed bottom-5 right-5 z-40 flex flex-col gap-2 max-w-sm pointer-events-none transition-all';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto bg-slate-900/95 backdrop-blur border-2 border-blue-500 text-white p-3.5 rounded-2xl shadow-2xl flex items-center gap-3 transition-opacity duration-300';
    toast.innerHTML = `
        <span class="w-8 h-8 rounded-xl bg-blue-600/30 text-blue-400 flex items-center justify-center font-black text-sm flex-shrink-0">⚠️</span>
        <div class="flex-1 min-w-0">
            <span class="text-xs font-black text-blue-400 uppercase tracking-wider block">Low Stock Warning</span>
            <span class="text-xs font-bold text-white block truncate">${itemName}</span>
            <span class="text-[10px] text-slate-300 block">Only ${stockQty} remaining (Min: ${threshold || 5}).</span>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
            <a href="/inventory.html" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-black transition">
                Stock
            </a>
            <button class="toast-close-btn text-slate-400 hover:text-white px-1.5 py-1 text-sm font-black">&times;</button>
        </div>
    `;

    toast.querySelector('.toast-close-btn')?.addEventListener('click', () => {
        toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

export function triggerLowStockNotification(item, threshold = 5) {
    if (!item) return;

    // Deduplication check within the current session (30 minutes cooldown per item)
    const now = Date.now();
    let notifiedMap = {};
    try {
        notifiedMap = JSON.parse(sessionStorage.getItem(NOTIFIED_ITEMS_KEY) || '{}');
    } catch {
        notifiedMap = {};
    }

    const lastNotified = notifiedMap[item.id];
    if (lastNotified && (now - lastNotified) < 30 * 60 * 1000) {
        return; // Already notified recently
    }

    // Record notification
    notifiedMap[item.id] = now;
    try {
        sessionStorage.setItem(NOTIFIED_ITEMS_KEY, JSON.stringify(notifiedMap));
    } catch {}

    const title = `⚠️ Low Stock Alert - Essie Cyber`;
    const body = `${item.name} is down to ${item.stock_quantity} units! Please reorder stock or replenish.`;

    // 1. Play audible alert chime
    playAlertChime();

    // 2. In-App Toast Banner
    showInAppLowStockBanner(item.name, item.stock_quantity, threshold);

    // 3. System / Mobile Device Notification
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, {
                        body,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        tag: `low-stock-${item.id}`,
                        vibrate: [200, 100, 200, 100, 200]
                    });
                }).catch(() => {
                    new Notification(title, { body, icon: '/favicon.ico' });
                });
            } else {
                new Notification(title, { body, icon: '/favicon.ico' });
            }
        }
    } catch (e) {
        console.warn('[NotificationHelper] Could not dispatch system notification:', e);
    }
}

export function checkAndNotifyLowStock(itemsList, silentOnLoad = true) {
    if (!Array.isArray(itemsList)) return [];
    const lowItems = itemsList.filter(i => {
        if (i.is_service) return false;
        const qty = parseFloat(i.stock_quantity);
        const threshold = parseFloat(i.min_threshold || 5);
        return !isNaN(qty) && qty <= threshold;
    });

    // On page reload / initial load, do not spam blocking toasts or chimes!
    // The top pill indicator displays the exact count cleanly.
    if (!silentOnLoad) {
        lowItems.slice(0, 2).forEach(item => {
            triggerLowStockNotification(item, item.min_threshold || 5);
        });
    }

    return lowItems;
}
