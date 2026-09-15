// IndexedDB offline queue for sales
// Queues sales when offline and syncs to Supabase when connectivity returns.

const DB_NAME = 'essie-offline';
const DB_VERSION = 1;
const STORE = 'pending_sales';

function openOfflineDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function queueOfflineSale(payload) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add({ ...payload, queued_at: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function getPendingSales() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deletePendingSale(id) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function insertSaleWithOfflineSupport(supabase, payload) {
    if (!navigator.onLine) {
        await queueOfflineSale(payload);
        console.log('[Offline] Sale queued locally:', payload);
        return { offline: true };
    }
    const { data, error } = await supabase.from('sales_log').insert([payload]).select().single();
    if (error) throw error;
    return { data };
}

export async function syncOfflineSales(supabase) {
    const pending = await getPendingSales();
    if (!pending.length) return;

    console.log(`[Sync] ${pending.length} pending sales to sync...`);
    let synced = 0;

    for (const sale of pending) {
        const { id, queued_at, ...payload } = sale;
        try {
            const { error } = await supabase.from('sales_log').insert([payload]);
            if (!error) {
                await deletePendingSale(id);
                synced++;
            }
        } catch (err) {
            console.warn('[Sync] Failed to sync sale:', err.message);
        }
    }

    if (synced > 0) {
        console.log(`[Sync] Synced ${synced} offline sales`);
        return synced;
    }
    return 0;
}
