import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { insertSaleWithOfflineSupport, syncOfflineSales, insertExpenseWithOfflineSupport, syncOfflineExpenses } from './offlineQueue.js';
import { checkAndNotifyLowStock, playAlertChime, playPopChime, playSuccessChime } from './notificationHelper.js';
requireAuth();
let inventory = [], customers = [], todaysSales = [];
let currentLowStockItems = [];

window.setQuickPayUI = function(method) {
    quickPay = method;
    const btnM = document.getElementById('quick-pay-mpesa');
    const btnC = document.getElementById('quick-pay-cash');
    if (quickPay === 'M-Pesa') {
        btnM.className = 'flex-1 bg-blue-700 text-white py-2 rounded font-medium shadow transition';
        btnC.className = 'flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium transition';
    } else {
        btnC.className = 'flex-1 bg-blue-600 text-white py-2 rounded font-medium shadow transition';
        btnM.className = 'flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium transition';
    }
};

let activeQuick = "Print / Copy", quickPay = "M-Pesa", mainPay = "M-Pesa";


let activeBindingGroup = null;
let bindingGroups = [];
let linkedBindingResources = [];
let showTapeButton = false;
let activeBindingItem = null;

async function loadBindingSettings() {
    try {
        if (!navigator.onLine) throw new Error('Offline');
        const { data: rows } = await supabase.from('settings').select('key, value')
            .in('key', ['binding_groups', 'binding_linked_resources', 'binding_show_tape', 'quick_add_order']);
        if (rows) localStorage.setItem('essie_settings_cache', JSON.stringify(rows));
        applySettingsRows(rows || []);
    } catch (e) {
        const cached = localStorage.getItem('essie_settings_cache');
        applySettingsRows(cached ? JSON.parse(cached) : []);
    }
}

let quickAddOrder = [];
function applySettingsRows(rows) {
    const map = {};
    rows.forEach(r => map[r.key] = r.value);
    bindingGroups = map['binding_groups'] ? JSON.parse(map['binding_groups']) : [];
    showTapeButton = map['binding_show_tape'] === 'true';
    if (map['binding_linked_resources']) {
        linkedBindingResources = JSON.parse(map['binding_linked_resources']);
    } else {
        linkedBindingResources = inventory
            .filter(i => i.name === 'EMBOSSED' || i.name === 'PVC (BLUE)')
            .map(i => ({ id: i.id, name: i.name }));
    }
    quickAddOrder = map['quick_add_order'] ? JSON.parse(map['quick_add_order']) : [];
}

function renderBindingOptions() {
    const container = document.getElementById('binding-options-container');
    if (!container) return;

    if (bindingGroups.length === 0) {
        // Fallback: show all spirals individually
        const spirals = inventory.filter(i => { const n = i.name.toLowerCase(); return n.includes('spiral') && !n.includes('a5 spiral'); });
        if (!activeBindingItem && spirals.length > 0) activeBindingItem = spirals[0];
        container.innerHTML = spirals.map(m => `<button onclick="window.selectBindingItem('${m.id}')" class="px-2 py-1 rounded text-xs font-bold ${activeBindingItem && activeBindingItem.id === m.id ? 'bg-slate-700 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}">${m.name} (${m.selling_price})</button>`).join('');
        return;
    }

    if (!activeBindingGroup) activeBindingGroup = bindingGroups[0];
    let html = bindingGroups.map(g => `<button onclick="window.setBindingGroup('${g.id}')" class="px-3 py-1.5 rounded text-xs font-bold transition-all ${activeBindingGroup && activeBindingGroup.id === g.id ? 'bg-slate-700 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">${g.name}</button>`).join('');

    if (showTapeButton) {
        html += `<button onclick="window.setBindingGroup('__tape__')" class="px-3 py-1.5 rounded text-xs font-bold ${activeBindingGroup && activeBindingGroup.id === '__tape__' ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">🏷️ Tape</button>`;
    }

    if (activeBindingGroup && activeBindingGroup.id !== '__tape__' && activeBindingGroup.items && activeBindingGroup.items.length > 0) {
        html += `<div class="w-full flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-200">`;
        html += activeBindingGroup.items.map(item => {
            const inv_item = inventory.find(i => i.id === item.id);
            const price = inv_item ? inv_item.selling_price : item.selling_price;
            return `<button onclick="window.selectBindingItem('${item.id}')" class="px-2 py-1 rounded text-xs font-semibold ${activeBindingItem && activeBindingItem.id === item.id ? 'bg-slate-700 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}" data-binding-item="${item.id}">${item.name} (${price})</button>`;
        }).join('');
        html += `</div>`;
    }

    container.innerHTML = html;
}

window.setBindingGroup = function(id) {
    if (id === '__tape__') {
        activeBindingGroup = { id: '__tape__', name: 'Tape', items: [], noStock: true };
        activeBindingItem = null;
        document.getElementById('quick-amount').value = '';
    } else {
        activeBindingGroup = bindingGroups.find(g => g.id === id) || null;
        activeBindingItem = activeBindingGroup && activeBindingGroup.items[0]
            ? inventory.find(i => i.id === activeBindingGroup.items[0].id) : null;
        // Auto-fill amount from group name price (e.g. "KSH 50" → 50)
        if (activeBindingGroup) {
            const price = parseFloat((activeBindingGroup.name || '').replace(/[^0-9.]/g, ''));
            if (price) document.getElementById('quick-amount').value = price;
        }
    }
    renderBindingOptions();
};

window.selectBindingItem = function(itemId) {
    activeBindingItem = inventory.find(i => i.id === itemId);
    if (activeBindingItem) {
        document.getElementById('quick-amount').value = activeBindingItem.selling_price;
    }
    renderBindingOptions();
};

async function deductBindingMaterials(qty) {
    for (const res of linkedBindingResources) {
        const item = inventory.find(i => i.id === res.id);
        if (item) {
            const newStock = (item.stock_quantity || 0) - qty;
            try {
                // if (navigator.onLine) await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); /* Handled by Postgres Trigger */
            } catch(e) {}
            item.stock_quantity = newStock;
        }
    }
}

async function loadData() {
    try {
        if (!navigator.onLine) throw new Error('Offline');
        const [{data:inv}, {data:cust}] = await Promise.all([
            supabase.from('inventory').select('*').order('name'),
            supabase.from('customers').select('*').order('name')
        ]);
        inventory = inv || [];
        customers = cust || [];
        localStorage.setItem('essie_inventory_cache', JSON.stringify(inventory));
        localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
    } catch (e) {
        inventory = JSON.parse(localStorage.getItem('essie_inventory_cache') || '[]');
        customers = JSON.parse(localStorage.getItem('essie_customers_cache') || '[]');
        console.warn('Offline mode: Loaded inventory/customers from cache', inventory.length);
    }

    await loadBindingSettings();
    renderBindingOptions();

    // ── Feature 1: Populate customer dropdown (pos-customer) ──────────────
    populateCustomerDropdown();

    // ── Feature 2: Populate debt panel dropdown (customers with balance > 0) ──
    populateDebtDropdown();
    populateDebtSaleDropdown();

    // ── Feature 3: Render dynamic Quick Add buttons ───────────────────────
    renderQuickAddButtons();

    // Subscribe to real-time inventory updates
    supabase.channel('public:inventory').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, payload => {
        if (payload.eventType === 'INSERT') {
            inventory.push(payload.new);
            inventory.sort((a,b) => a.name.localeCompare(b.name));
        } else if (payload.eventType === 'UPDATE') {
            const idx = inventory.findIndex(i => i.id === payload.new.id);
            if (idx >= 0) inventory[idx] = payload.new;
        } else if (payload.eventType === 'DELETE') {
            inventory = inventory.filter(i => i.id !== payload.old.id);
        }
        renderQuickAddButtons(); // keep buttons in sync on live updates
    }).subscribe();

    await fetchTodaysSales();
    await checkTodaysOpenedResources();

    // ── Low Stock Notification & UI Indicator ──
    currentLowStockItems = checkAndNotifyLowStock(inventory) || [];
    updateLowStockUI(currentLowStockItems);
}

// ── Low Stock Indicator & Modal Wiring ─────────────────────────────────────
function updateLowStockUI(lowItems) {
    const pill = document.getElementById('pos-low-stock-pill');
    const countEl = document.getElementById('pos-low-stock-count');
    if (!pill || !countEl) return;

    if (lowItems && lowItems.length > 0) {
        pill.classList.remove('hidden');
        pill.classList.add('flex');
        countEl.textContent = `${lowItems.length} Low Stock`;
    } else {
        pill.classList.add('hidden');
        pill.classList.remove('flex');
    }
}

document.getElementById('pos-low-stock-pill')?.addEventListener('click', () => {
    playPopChime();
    const modal = document.getElementById('modal-low-stock');
    const list = document.getElementById('low-stock-list-container');
    if (!modal || !list) return;

    if (!currentLowStockItems || currentLowStockItems.length === 0) {
        list.innerHTML = '<div class="py-6 text-center text-slate-400 text-xs">All items are sufficiently stocked!</div>';
    } else {
        list.innerHTML = currentLowStockItems.map(item => `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                    <div class="font-bold text-slate-900 text-xs sm:text-sm">${item.name}</div>
                    <div class="text-[10px] text-slate-400 font-mono">Min Threshold: ${item.min_threshold || 5} units</div>
                </div>
                <div class="text-right">
                    <span class="px-2 py-1 rounded-lg text-xs font-black bg-red-100 text-red-700">
                        ${item.stock_quantity} remaining
                    </span>
                </div>
            </div>
        `).join('');
    }

    modal.classList.remove('hidden');
});

document.getElementById('btn-close-low-stock')?.addEventListener('click', () => {
    document.getElementById('modal-low-stock')?.classList.add('hidden');
});

// ── Shift Consumables Popup Modal & Status Check ────────────────────────────
function openShiftConsumablesModal() {
    playPopChime();
    const modal = document.getElementById('modal-shift-consumables');
    const select = document.getElementById('modal-shift-res-select');
    if (!modal || !select) return;

    // Filter bulk consumable items (e.g. reams, toner, cartridges, pouches, spirals)
    const bulkCandidates = inventory.filter(i => {
        const n = (i.name || '').toLowerCase();
        return (i.tier_level && i.tier_level > 1) || (i.units_per_parent && i.units_per_parent > 1) ||
            n.includes('ream') || n.includes('toner') || n.includes('cartridge') || n.includes('pouch') || n.includes('box') || n.includes('spiral');
    });

    const candidateList = bulkCandidates.length > 0 ? bulkCandidates : inventory.filter(i => !i.is_service);

    select.innerHTML = '<option value="">-- Choose Consumable to Open --</option>' +
        candidateList.map(i => `
            <option value="${i.id}" data-name="${i.name}" data-cost="${i.buying_price || 0}" data-yield="${i.units_per_parent || i.stock_quantity || '-'}">
                ${i.name} (Cost: Ksh ${i.buying_price || 0})
            </option>
        `).join('');

    select.onchange = () => {
        const opt = select.selectedOptions[0];
        if (!opt || !opt.value) {
            document.getElementById('modal-shift-res-preview')?.classList.add('hidden');
            return;
        }
        const cost = parseFloat(opt.dataset.cost || 0);
        const yieldVal = opt.dataset.yield || '-';
        const costInput = document.getElementById('modal-shift-res-cost');
        const costDisp = document.getElementById('modal-shift-res-cost-display');
        const yieldDisp = document.getElementById('modal-shift-res-yield-display');
        if (costInput) costInput.value = cost;
        if (costDisp) costDisp.textContent = `Ksh ${cost.toFixed(2)}`;
        if (yieldDisp) yieldDisp.textContent = `Yield / Units inside: ${yieldVal} pcs`;
        document.getElementById('modal-shift-res-preview')?.classList.remove('hidden');
    };

    modal.classList.remove('hidden');
}

async function checkTodaysOpenedResources() {
    const todayStr = new Date().toISOString().split('T')[0];
    const pill = document.getElementById('pos-shift-res-pill');
    const statusLabel = document.getElementById('pos-shift-res-status');

    try {
        const { data: resData } = await supabase
            .from('resources')
            .select('id, name, units, cost, status, opened_at')
            .gte('opened_at', `${todayStr}T00:00:00Z`);

        const activeResources = (resData || []).filter(r => r.status === 'active' || (r.opened_at && r.opened_at.startsWith(todayStr)));

        if (activeResources.length > 0) {
            if (pill) {
                pill.className = 'flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 border border-blue-400 text-blue-200 rounded-xl text-xs sm:text-sm font-bold cursor-pointer hover:bg-blue-500/30 transition shadow-sm';
            }
            if (statusLabel) {
                statusLabel.textContent = `Stock: ${activeResources.length} Active`;
            }
        } else {
            if (pill) {
                pill.className = 'flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs sm:text-sm font-bold cursor-pointer hover:bg-amber-500/30 transition shadow-sm';
            }
            if (statusLabel) {
                statusLabel.textContent = 'Consumable Check';
            }

            // Pop up if not dismissed during this browser session
            const dismissed = sessionStorage.getItem('shift_res_popup_dismissed');
            if (!dismissed) {
                setTimeout(openShiftConsumablesModal, 700);
            }
        }
    } catch (e) {
        console.warn('Could not check shift resources:', e);
    }
}

document.getElementById('pos-shift-res-pill')?.addEventListener('click', openShiftConsumablesModal);
document.getElementById('btn-close-shift-res-modal')?.addEventListener('click', () => {
    document.getElementById('modal-shift-consumables')?.classList.add('hidden');
});
document.getElementById('btn-dismiss-shift-res')?.addEventListener('click', () => {
    sessionStorage.setItem('shift_res_popup_dismissed', '1');
    document.getElementById('modal-shift-consumables')?.classList.add('hidden');
});

document.getElementById('btn-submit-shift-res')?.addEventListener('click', async () => {
    const select = document.getElementById('modal-shift-res-select');
    const opt = select?.selectedOptions[0];
    const itemId = select?.value;
    const name = opt?.dataset.name || 'Consumable';
    const qty = parseInt(document.getElementById('modal-shift-res-qty')?.value || 1);
    const cost = parseFloat(document.getElementById('modal-shift-res-cost')?.value || 0);

    if (!itemId) return alert('Please select a consumable to open.');
    if (cost <= 0) {
        if (!confirm('Unit cost is Ksh 0. Opening with 0 cost will not track profit accurately. Continue anyway?')) return;
    }

    const btn = document.getElementById('btn-submit-shift-res');
    btn.disabled = true;
    btn.textContent = 'Opening...';

    try {
        const item = inventory.find(i => i.id === itemId);
        const unitsInside = item?.units_per_parent || 500;
        const totalUnits = unitsInside * qty;
        const totalCost = cost * qty;

        // 1. Insert into resources
        const { error: resErr } = await supabase.from('resources').insert([{
            name: `${name} (${qty}x)`,
            units: totalUnits,
            cost: totalCost,
            status: 'active',
            opened_at: new Date().toISOString()
        }]);
        if (resErr) throw resErr;

        // 2. Insert expense
        await supabase.from('expenses').insert([{
            description: `[Opened Consumable] ${name} (${qty}x)`,
            amount: totalCost,
            timestamp: new Date().toISOString()
        }]);

        // 3. Update stock quantity if fixed product
        if (item && !item.is_service && typeof item.stock_quantity === 'number') {
            const newStock = Math.max(0, item.stock_quantity - qty);
            await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', itemId);
            item.stock_quantity = newStock;
        }

        playSuccessChime();
        sessionStorage.setItem('shift_res_popup_dismissed', '1');
        document.getElementById('modal-shift-consumables')?.classList.add('hidden');
        await checkTodaysOpenedResources();
        alert(`Successfully opened ${qty}x ${name}! Shift profit is now tracked.`);
    } catch (e) {
        alert('Error opening consumable: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '☀️ Open Stock & Record';
    }
});

// ── Feature 1 helper: (re)populate #pos-customer, keeping current selection ──
function populateCustomerDropdown() {
    const sel = document.getElementById('pos-customer');
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Walk-in</option>';
    customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.outstanding_debt > 0
            ? `${c.name} (owes Ksh ${parseFloat(c.outstanding_debt).toFixed(0)})`
            : c.name;
        sel.appendChild(opt);
    });
    // Restore prior selection if still valid
    if (currentVal) sel.value = currentVal;
}

// ── Feature 2 helper: populate debt-customer-select with only indebted customers ──
function populateDebtDropdown() {
    const sel = document.getElementById('debt-customer-select');
    if (!sel) return;
    const prior = sel.value;
    sel.innerHTML = '<option value="">— select customer —</option>';
    customers
        .filter(c => parseFloat(c.outstanding_debt || 0) > 0)
        .forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} — Ksh ${parseFloat(c.outstanding_debt).toFixed(2)}`;
            sel.appendChild(opt);
        });
    if (prior) sel.value = prior;
}

// ── Feature 3 helper: build Quick Add buttons from is_quick_add flag ──────────
// ── Online Services Presets & Modal ──────────────────────────────────────────
const ONLINE_SERVICE_PRESETS = [
    { title: 'Good Conduct', cat: 'eCitizen', price: 1050, desc: 'Police Clearance Certificate' },
    { title: 'Driving License Renewal', cat: 'eCitizen', price: 650, desc: 'NTSA eCitizen Renewal' },
    { title: 'Business Search / Reg', cat: 'eCitizen', price: 850, desc: 'BRS Business Registration' },
    { title: 'Passport Application', cat: 'eCitizen', price: 4550, desc: 'Immigration Passport Form' },
    { title: 'KRA PIN Registration', cat: 'KRA', price: 200, desc: 'New KRA PIN Certificate' },
    { title: 'KRA Tax Returns (Nil)', cat: 'KRA', price: 150, desc: 'Annual Nil Return Filing' },
    { title: 'KRA Tax Returns (P9)', cat: 'KRA', price: 300, desc: 'Employment Income Filing' },
    { title: 'Tax Compliance (TCC)', cat: 'KRA', price: 350, desc: 'Tax Compliance Certificate' },
    { title: 'HELB Loan Application', cat: 'HELB', price: 300, desc: 'First Time / Subsequent Loan' },
    { title: 'HELB Clearance', cat: 'HELB', price: 200, desc: 'HELB Compliance Certificate' },
    { title: 'NTSA TIMS Account', cat: 'NTSA', price: 250, desc: 'Portal Account & Logbook Search' },
    { title: 'CV / Resume Writing', cat: 'General', price: 200, desc: 'Curriculum Vitae Typesetting' },
    { title: 'Job / College Application', cat: 'General', price: 150, desc: 'Online Form & Document Upload' },
    { title: 'Passport Photo Upload', cat: 'General', price: 100, desc: 'Digital Photo Crop & Resize' },
    { title: 'Custom Online Service', cat: 'General', price: 0, desc: 'Other Online Cyber Service' }
];

function openOnlineServicesModal() {
    playPopChime();
    const modal = document.getElementById('modal-online-services');
    const grid = document.getElementById('online-srv-presets-grid');
    if (!modal || !grid) return;

    grid.innerHTML = ONLINE_SERVICE_PRESETS.map((p, idx) => `
        <div class="preset-card p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer transition flex flex-col justify-between" onclick="selectOnlinePreset(${idx})">
            <div>
                <span class="text-[10px] font-black uppercase tracking-wider text-blue-600 block">${p.cat}</span>
                <span class="font-bold text-xs sm:text-sm text-slate-800 block">${p.title}</span>
                <span class="text-[11px] text-slate-500 block leading-tight mt-0.5">${p.desc}</span>
            </div>
            <div class="mt-2 text-right">
                <span class="text-xs sm:text-sm font-black text-blue-700">${p.price > 0 ? `Ksh ${p.price}` : 'Variable'}</span>
            </div>
        </div>
    `).join('');

    document.getElementById('online-srv-name-input').value = '';
    document.getElementById('online-srv-amt-input').value = '';
    modal.classList.remove('hidden');
}

window.selectOnlinePreset = (idx) => {
    const p = ONLINE_SERVICE_PRESETS[idx];
    if (!p) return;
    document.getElementById('online-srv-name-input').value = p.title;
    document.getElementById('online-srv-amt-input').value = p.price > 0 ? p.price : '';
    document.getElementById('online-srv-amt-input').focus();
};

document.getElementById('btn-close-online-srv')?.addEventListener('click', () => {
    document.getElementById('modal-online-services')?.classList.add('hidden');
});

document.getElementById('btn-online-srv-quick-log')?.addEventListener('click', async () => {
    const name = document.getElementById('online-srv-name-input').value.trim() || 'Online Service';
    const amt = parseFloat(document.getElementById('online-srv-amt-input').value || 0);
    if (!amt || amt <= 0) return alert('Please enter a valid amount.');

    const onlineItem = inventory.find(i => (i.name || '').toUpperCase().includes('ONLINE SERVICE')) 
        || { id: '5fd6f715-e7eb-4106-a234-d26516f5d987', name: 'ONLINE SERVICE' };

    const btn = document.getElementById('btn-online-srv-quick-log');
    btn.disabled = true; btn.textContent = 'Logging...';

    try {
        const _qRes = await insertSaleWithOfflineSupport(supabase, {
            item_id: onlineItem.id,
            total_charged: amt,
            calculated_qty: 1,
            calculated_profit: amt,
            cashier_id: currentUser ? currentUser.id : null,
            payment_method: quickPay.toLowerCase().replace('-', '')
        });

        playSuccessChime();
        document.getElementById('modal-online-services').classList.add('hidden');
        await fetchTodaysSales();
        alert(`Logged ${name} for Ksh ${amt.toFixed(2)} (${quickPay})!`);
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Log Sale';
    }
});

document.getElementById('btn-online-srv-add-cart')?.addEventListener('click', () => {
    const name = document.getElementById('online-srv-name-input').value.trim() || 'Online Service';
    const amt = parseFloat(document.getElementById('online-srv-amt-input').value || 0);
    if (!amt || amt <= 0) return alert('Please enter a valid amount.');

    const onlineItem = inventory.find(i => (i.name || '').toUpperCase().includes('ONLINE SERVICE')) 
        || { id: '5fd6f715-e7eb-4106-a234-d26516f5d987', name: 'ONLINE SERVICE' };

    docCart.push({
        id: onlineItem.id,
        name: `Online Service - ${name}`,
        qty: 1,
        price: amt,
        total: amt,
        buying_price: 0,
        kyocera_pages: 0
    });

    playPopChime();
    renderDocCart();
    document.getElementById('modal-online-services').classList.add('hidden');
    // If not in a cart mode, switch to receipt mode so cashier sees it
    if (currentSaleMode === 'direct') {
        setSaleMode('receipt');
    }
});

// ── Feature 3: Smart Quick Add with Best Sellers ────────────────────────────
async function renderQuickAddButtons() {
    const container = document.getElementById('quick-srv-container');
    if (!container) return;

    // 1. Fixed Button 1: Print / Copy (Daily volume leader)
    const printItem = inventory.find(i => {
        const n = (i.name || '').toLowerCase();
        return n === 'print / copy' || n === 'print/copy';
    }) || { id: '637a64d2-1c87-468a-b3d3-37ef914621a8', name: 'Print / Copy', is_service: true, selling_price: 10 };

    // 2. Fixed Button 2: Online Services
    const onlineItem = {
        id: '5fd6f715-e7eb-4106-a234-d26516f5d987',
        name: 'Online Services',
        isOnlineTrigger: true,
        icon: '🌐'
    };

    // 3. Dynamic Slots: Rank top selling items for the week, EXCLUDING Print / Copy & Debt Repayment!
    let dynamicItems = [];
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: salesHistory } = await supabase
            .from('sales_log')
            .select('item_id')
            .gte('timestamp', sevenDaysAgo)
            .eq('is_voided', false)
            .not('status', 'eq', 'debt_collection');

        const freq = {};
        (salesHistory || []).forEach(s => {
            if (s.item_id) freq[s.item_id] = (freq[s.item_id] || 0) + 1;
        });

        const sortedIds = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
        for (const id of sortedIds) {
            const item = inventory.find(i => i.id === id);
            if (!item) continue;
            const lower = (item.name || '').toLowerCase();
            // Strictly exclude Print/Copy and Debt Repayment as requested
            if (lower.includes('print') || lower.includes('copy') || lower.includes('debt repayment') || lower.includes('online service')) {
                continue;
            }
            dynamicItems.push(item);
            if (dynamicItems.length >= 4) break;
        }
    } catch (e) {
        console.warn('Could not rank top sellers:', e);
    }

    // Fallbacks if not enough sales history yet (e.g. Spiral Binding, Typesetting, Laminating)
    if (dynamicItems.length < 4) {
        const fallbackCandidates = inventory.filter(i => {
            const lower = (i.name || '').toLowerCase();
            return !lower.includes('print') && !lower.includes('copy') && !lower.includes('debt repayment') && !lower.includes('online service')
                && !dynamicItems.find(d => d.id === i.id);
        });
        dynamicItems = dynamicItems.concat(fallbackCandidates.slice(0, 4 - dynamicItems.length));
    }

    const allButtons = [
        { ...printItem, isFixedPrint: true, icon: '🖨️' },
        onlineItem,
        ...dynamicItems.map(item => ({ ...item, isDynamicTop: true, icon: '🔥' }))
    ];

    if (!allButtons.find(i => i.name === activeQuick)) {
        activeQuick = printItem.name;
    }

    container.innerHTML = allButtons.map(item => {
        const isActive = item.name === activeQuick;
        let badgeHtml = '';
        if (item.isFixedPrint) {
            badgeHtml = '<span class="text-[9px] uppercase font-black bg-blue-800 text-blue-100 px-1.5 py-0.5 rounded">Daily</span>';
        } else if (item.isOnlineTrigger) {
            badgeHtml = '<span class="text-[9px] uppercase font-black bg-emerald-700 text-emerald-100 px-1.5 py-0.5 rounded">Portal</span>';
        } else {
            badgeHtml = '<span class="text-[9px] uppercase font-black bg-amber-500/20 text-amber-800 px-1.5 py-0.5 rounded">Top</span>';
        }

        const cls = isActive
            ? 'quick-srv-btn bg-blue-600 text-white border-2 border-blue-600 py-3 px-3.5 rounded-xl text-sm font-black shadow-md shadow-blue-600/30 transition flex items-center justify-between text-left'
            : 'quick-srv-btn bg-white hover:bg-blue-50 text-slate-800 border-2 border-slate-200 hover:border-blue-300 py-3 px-3.5 rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-between text-left';

        return `
            <button class="${cls}" data-name="${item.name}" data-is-online="${item.isOnlineTrigger ? '1' : '0'}">
                <span class="truncate flex items-center gap-1.5"><span>${item.icon}</span> ${item.name}</span>
                ${badgeHtml}
            </button>
        `;
    }).join('');

    container.querySelectorAll('.quick-srv-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isOnline = btn.dataset.isOnline === '1';
            const name = btn.dataset.name;
            if (isOnline) {
                openOnlineServicesModal();
            } else {
                window.setQuickServiceUI(name);
            }
        });
    });
}



async function fetchTodaysSales() {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('sales_log')
        .select('*, inventory(name), customer:customers(id, name, outstanding_debt)')
        .gte('timestamp', `${today}T00:00:00Z`)
        .eq('is_voided', false)
        .order('timestamp', { ascending: false });
    if (error) console.error('Error fetching today sales:', error);
    todaysSales = data || [];
    renderLedger();
}

function renderLedger() {
    let m = 0, c = 0, debtIssuedTotal = 0, debtRepaidTotal = 0;
    const tbody = document.getElementById('sales-tbody');
    tbody.innerHTML = '';

    const regularSales = [];
    const debtCollections = [];

    todaysSales.forEach(s => {
        if (s.status === 'debt_collection') {
            debtCollections.push(s);
        } else {
            regularSales.push(s);
        }
    });

    // Group regular sales by item name
    const groups = {};
    regularSales.forEach(s => {
        const key = (s.inventory?.name || 'Unknown');
        if (!groups[key]) {
            groups[key] = {
                name: s.inventory?.name || 'Unknown',
                totalQty: 0,
                totalAmount: 0,
                mpesaAmount: 0,
                cashAmount: 0,
                debtAmount: 0,
                entries: []
            };
        }
        groups[key].totalQty += (s.calculated_qty || 0);
        groups[key].totalAmount += (s.total_charged || 0);
        if (s.status === 'debt') {
            groups[key].debtAmount = (groups[key].debtAmount || 0) + s.total_charged;
            debtIssuedTotal += s.total_charged;
        } else if ((s.payment_method || '').toLowerCase() === 'mpesa') {
            groups[key].mpesaAmount += s.total_charged;
            m += s.total_charged;
        } else {
            groups[key].cashAmount += s.total_charged;
            c += s.total_charged;
        }
        groups[key].entries.push(s);
    });

    Object.entries(groups).forEach(([key, grp], idx) => {
        let methodBadge = '';
        if (grp.mpesaAmount > 0) methodBadge += '<span class="text-xs font-bold text-slate-700 bg-emerald-50 px-2 py-0.5 rounded-full mr-1">M-Pesa ' + grp.mpesaAmount.toFixed(0) + '</span>';
        if (grp.cashAmount > 0) methodBadge += '<span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full mr-1">Cash ' + grp.cashAmount.toFixed(0) + '</span>';
        if (grp.debtAmount > 0) methodBadge += '<span class="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">Debt ' + grp.debtAmount.toFixed(0) + '</span>';

        const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_') + '_' + idx;

        // Summary (grouped) row
        tbody.innerHTML += `
        <tr class="hover:bg-gray-50 cursor-pointer border-b" onclick="toggleLedgerGroup('${safeKey}')">
            <td class="py-2 px-4 font-semibold text-slate-800">${grp.name}</td>
            <td class="py-2 px-4 text-center text-slate-600">${grp.totalQty}</td>
            <td class="py-2 px-4 text-right font-bold">Ksh ${grp.totalAmount.toFixed(2)}</td>
            <td class="py-2 px-4 text-center">${methodBadge}</td>
            <td class="py-2 px-4 text-center">
                <span class="text-xs text-blue-500 font-bold select-none">▶ Edit</span>
            </td>
        </tr>
        <tr id="grp-${safeKey}" class="hidden bg-slate-50">
            <td colspan="5" class="p-0">
                <table class="w-full text-xs">
                    <thead><tr class="bg-slate-100 text-slate-500">
                        <th class="py-1.5 px-6 text-left">Time</th>
                        <th class="py-1.5 px-4 text-center">Qty</th>
                        <th class="py-1.5 px-4 text-right">Amount</th>
                        <th class="py-1.5 px-4 text-center">Method</th>
                        <th class="py-1.5 px-4 text-center">Del</th>
                    </tr></thead>
                    <tbody>
                        ${grp.entries.map(e => `
                        <tr class="border-t border-slate-100 hover:bg-red-50" id="entry-row-${e.id}">
                            <td class="py-1.5 px-6 text-slate-500">
                                ${new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                ${e.customer?.name ? `<span class="text-[11px] font-bold text-slate-700 ml-1">(${e.customer.name})</span>` : ''}
                            </td>
                            <td class="py-1.5 px-4 text-center">${e.calculated_qty}</td>
                            <td class="py-1.5 px-4 text-right font-semibold">Ksh ${e.total_charged.toFixed(2)}</td>
                            <td class="py-1.5 px-4 text-center"><button onclick="togglePayment('${e.id}', '${e.payment_method}')" class="px-2 py-0.5 rounded text-xs font-bold ${e.status === 'debt' ? 'bg-orange-100 text-orange-700' : (e.payment_method || '').toLowerCase() === 'mpesa' ? 'bg-slate-100 text-slate-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" title="Click to change">${e.status === 'debt' ? 'DEBT' : (e.payment_method || 'cash').toUpperCase()}</button></td>
                            <td class="py-1.5 px-4 text-center">
                                <button onclick="voidSale('${e.id}')" class="text-red-500 hover:text-red-700 font-bold text-base leading-none" title="Void this entry">&times;</button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </td>
        </tr>`;
    });

    // Render Debt Collections at the bottom
    if (debtCollections.length > 0) {
        tbody.innerHTML += `
        <tr class="bg-blue-50/80 border-t-2 border-blue-200 text-xs font-bold text-blue-900 select-none">
            <td colspan="5" class="py-2 px-4 flex items-center justify-between">
                <span>💰 DEBT REPAYMENTS (TODAY)</span>
                <span class="text-blue-700 font-normal">Customer balance reductions</span>
            </td>
        </tr>`;

        debtCollections.forEach(dc => {
            const cust = dc.customer || customers.find(c => c.id === dc.customer_id);
            const custName = cust?.name || 'Customer';
            const remDebt = cust ? parseFloat(cust.outstanding_debt || 0) : 0;
            const isMpesa = (dc.payment_method || '').toLowerCase() === 'mpesa';

            debtRepaidTotal += dc.total_charged;
            if (isMpesa) {
                m += dc.total_charged;
            } else {
                c += dc.total_charged;
            }

            tbody.innerHTML += `
            <tr class="border-b border-slate-100 hover:bg-blue-50/50 bg-blue-50/20" id="entry-row-${dc.id}">
                <td class="py-2 px-4 text-slate-800">
                    <span class="inline-block px-1.5 py-0.5 text-[10px] font-black bg-emerald-100 text-emerald-800 rounded mr-1">DEBT REPAID</span>
                    <span class="font-bold text-slate-900">${custName}</span>
                    <span class="text-xs font-semibold text-emerald-700 ml-1">KSh ${dc.total_charged.toFixed(0)}</span>
                    <span class="text-xs text-slate-500 font-medium ml-1">(Rem: KSh ${remDebt.toFixed(0)})</span>
                </td>
                <td class="py-2 px-4 text-center text-slate-400 text-xs">${new Date(dc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td class="py-2 px-4 text-right font-bold text-emerald-700">Ksh ${dc.total_charged.toFixed(2)}</td>
                <td class="py-2 px-4 text-center">
                    <button onclick="togglePayment('${dc.id}', '${dc.payment_method}')" class="px-2 py-0.5 rounded text-xs font-bold ${isMpesa ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}" title="Click to change payment method">${isMpesa ? 'M-PESA' : 'CASH'}</button>
                </td>
                <td class="py-2 px-4 text-center">
                    <button onclick="voidSale('${dc.id}')" class="text-red-500 hover:text-red-700 font-bold text-base leading-none p-1 rounded hover:bg-red-50" title="Void debt collection (restores customer debt)">&times;</button>
                </td>
            </tr>`;
        });
    }

    if (todaysSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs italic">No sales or debt collections recorded today.</td></tr>`;
    }

    if (document.getElementById('lbl-mpesa')) document.getElementById('lbl-mpesa').innerText = `Ksh ${m.toFixed(2)}`;
    if (document.getElementById('lbl-cash')) document.getElementById('lbl-cash').innerText = `Ksh ${c.toFixed(2)}`;
    if (document.getElementById('lbl-debt-issued')) document.getElementById('lbl-debt-issued').innerText = `Ksh ${debtIssuedTotal.toFixed(2)}`;
    if (document.getElementById('lbl-debt-repaid')) document.getElementById('lbl-debt-repaid').innerText = `Ksh ${debtRepaidTotal.toFixed(2)}`;
}

window.toggleLedgerGroup = (key) => {
    const row = document.getElementById(`grp-${key}`);
    if (!row) return;
    row.classList.toggle('hidden');
    // Rotate arrow on the toggle button
    const parentRow = row.previousElementSibling;
    const arrow = parentRow ? parentRow.querySelector('span.select-none') : null;
    if (arrow) {
        arrow.textContent = row.classList.contains('hidden') ? '▶ Edit' : '▼ Close';
    }
};


window.setQuickServiceUI = function(name) {
    activeQuick = name;
    document.querySelectorAll('.quick-srv-btn').forEach(b => {
        if (b.dataset.name === name) {
            b.className = 'quick-srv-btn bg-blue-600 text-white py-2 rounded text-sm font-medium shadow-sm transition-all';
        } else {
            b.className = 'quick-srv-btn bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium hover:bg-gray-200 transition-all';
        }
    });
    
    const bindingContainer = document.getElementById('binding-options-container');
    const amountInput = document.getElementById('quick-amount');
    const qtyInput = document.getElementById('quick-qty');
    const qtyContainer = document.getElementById('quick-qty-container');
    
    if (qtyInput) qtyInput.value = 1;
    
    const item = inventory.find(i => i.name === name);
    const isService = item ? (item.is_service === true || item.is_service === 1 || item.is_service === 'true') : true;

    if (qtyContainer) {
        if (isService || name === 'Binding Service') {
            qtyContainer.classList.add('hidden');
        } else {
            qtyContainer.classList.remove('hidden');
        }
    }

    if (bindingContainer) {
        if (name === 'Binding Service') {
            bindingContainer.classList.remove('hidden');
            // Re-render so the active item gets highlighted
            renderBindingOptions();
            // If a ring is already selected, fill the amount; otherwise auto-pick the first
            if (!activeBindingItem) {
                // Try first item in active group, or first spiral
                const firstId = activeBindingGroup?.items?.[0]?.id
                    || inventory.find(i => { const n = i.name.toLowerCase(); return n.includes('spiral') && !n.includes('a5'); })?.id;
                if (firstId) window.selectBindingItem(firstId);
            } else {
                if(amountInput) amountInput.value = activeBindingItem.selling_price;
            }
        } else {
            bindingContainer.classList.add('hidden');
            
            // Auto-populate price if recorded in inventory
            if (amountInput) {
                if (item && item.selling_price > 0) {
                    amountInput.value = item.selling_price;
                } else {
                    amountInput.value = ''; // clear if no fixed price
                }
                amountInput.focus();
            }
        }
    }
};

// ── Feature 1: Add New Customer modal wiring ──────────────────────────────────
function openAddCustomerModal() {
    document.getElementById('new-cust-name').value = '';
    document.getElementById('new-cust-phone').value = '';
    document.getElementById('new-cust-error').classList.add('hidden');
    document.getElementById('modal-add-customer').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-cust-name').focus(), 100);
}

document.getElementById('btn-add-cust-inline').addEventListener('click', openAddCustomerModal);

document.getElementById('btn-cancel-new-cust').addEventListener('click', () => {
    document.getElementById('modal-add-customer').classList.add('hidden');
});

document.getElementById('btn-save-new-cust').addEventListener('click', async () => {
    const name = document.getElementById('new-cust-name').value.trim();
    const phone = document.getElementById('new-cust-phone').value.trim();
    const errEl = document.getElementById('new-cust-error');

    if (!name) {
        errEl.textContent = 'Name is required.';
        errEl.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('btn-save-new-cust');
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
        const { data, error } = await supabase
            .from('customers')
            .insert([{ name, phone, outstanding_debt: 0 }])
            .select()
            .single();
        if (error) throw error;

        // Update local cache and refresh dropdowns
        customers.push(data);
        customers.sort((a, b) => a.name.localeCompare(b.name));
        localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
        populateCustomerDropdown();
        populateDebtDropdown();
    populateDebtSaleDropdown();

        // Auto-select the newly created customer in pos-customer & debt-sale-customer-select
        document.getElementById('pos-customer').value = data.id;
        const debtSel = document.getElementById('debt-sale-customer-select');
        if (debtSel) debtSel.value = data.id;

        document.getElementById('modal-add-customer').classList.add('hidden');
    } catch (err) {
        errEl.textContent = 'Error: ' + err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Customer';
    }
});

// ── Feature 2: Debt Collection wiring ────────────────────────────────────────
document.getElementById('debt-customer-select').addEventListener('change', function() {
    const cust = customers.find(c => c.id == this.value);
    const balEl = document.getElementById('debt-current-balance');
    balEl.value = cust ? `Ksh ${parseFloat(cust.outstanding_debt || 0).toFixed(2)}` : '';
    document.getElementById('debt-status-msg').classList.add('hidden');
    document.getElementById('debt-amount-input').value = '';
});

document.getElementById('btn-collect-debt').addEventListener('click', async () => {
    const custId = document.getElementById('debt-customer-select').value;
    const amount = parseFloat(document.getElementById('debt-amount-input').value);
    const statusEl = document.getElementById('debt-status-msg');

    if (!custId) return alert('Please select a customer.');
    if (!amount || amount <= 0) return alert('Enter a valid amount.');

    const cust = customers.find(c => c.id == custId);
    if (!cust) return;

    const currentDebt = parseFloat(cust.outstanding_debt || 0);
    if (amount > currentDebt) {
        return alert(`Amount exceeds balance. Max payable: Ksh ${currentDebt.toFixed(2)}`);
    }

    const newDebt = Math.max(0, currentDebt - amount);
    const btn = document.getElementById('btn-collect-debt');
    btn.disabled = true; btn.textContent = 'Processing...';

    const method = document.getElementById('debt-method-select').value;

    try {
        // Link to dedicated DEBT REPAYMENT service item (prevents dummy items like 1 Litre Soda)
        const repaymentItem = inventory.find(i => i.name === 'DEBT REPAYMENT') 
            || inventory.find(i => i.is_service) 
            || inventory[0];
        const dummyItemId = repaymentItem ? repaymentItem.id : null;

        const { error: dbError } = await supabase
            .from('customers')
            .update({ outstanding_debt: newDebt })
            .eq('id', custId);
        if (dbError) throw dbError;

        // Insert into sales_log for daily tracking with explicit debt_collection status
        const { error: logError } = await supabase.from('sales_log').insert([{
            item_id: dummyItemId,
            calculated_qty: 1,
            quantity: 1,
            total_charged: amount,
            calculated_profit: 0,
            payment_method: method.toLowerCase(),
            status: 'debt_collection',
            customer_id: custId,
            cashier_id: currentUser ? currentUser.id : null,
            timestamp: new Date().toISOString()
        }]);
        if (logError) throw logError;

        // Update local cache
        cust.outstanding_debt = newDebt;
        localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
        populateCustomerDropdown();
        populateDebtDropdown();
        populateDebtSaleDropdown();
        await fetchTodaysSales();

        document.getElementById('debt-amount-input').value = '';
        document.getElementById('debt-current-balance').value = `Ksh ${newDebt.toFixed(2)}`;
        document.getElementById('debt-customer-select').value = '';
        document.getElementById('debt-current-balance').value = '';

        statusEl.textContent = `✅ Collected Ksh ${amount.toFixed(2)} from ${cust.name}. Remaining balance: Ksh ${newDebt.toFixed(2)}`;
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 5000);
    } catch (err) {
        alert('Error collecting debt: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Collect Payment';
    }
});



function updateQuickAmountFromQty() {
    const qtyInput = document.getElementById('quick-qty');
    const amountInput = document.getElementById('quick-amount');
    if (!qtyInput || !amountInput) return;
    
    const qty = parseInt(qtyInput.value) || 1;
    if (activeQuick !== 'Binding Service') {
        const item = inventory.find(i => i.name === activeQuick);
        if (item && item.selling_price > 0) {
            amountInput.value = item.selling_price * qty;
        }
    }
}

document.getElementById('quick-qty-plus')?.addEventListener('click', () => {
    const input = document.getElementById('quick-qty');
    if (input) {
        input.value = (parseInt(input.value) || 1) + 1;
        updateQuickAmountFromQty();
    }
});

document.getElementById('quick-qty-minus')?.addEventListener('click', () => {
    const input = document.getElementById('quick-qty');
    if (input) {
        const newVal = (parseInt(input.value) || 1) - 1;
        input.value = newVal < 1 ? 1 : newVal;
        updateQuickAmountFromQty();
    }
});
document.getElementById('quick-pay-mpesa').addEventListener('click', () => window.setQuickPayUI('M-Pesa'));
document.getElementById('quick-pay-cash').addEventListener('click', () => window.setQuickPayUI('Cash'));


document.getElementById('quick-log-btn').addEventListener('click', async () => {
      const amt = parseFloat(document.getElementById('quick-amount').value); if(!amt) return;

      let logItem = null, logQty = 1, logProfit = amt, isBinding = (activeQuick === 'Binding Service');

      if (isBinding) {
          const isNoStock = activeBindingGroup && activeBindingGroup.noStock;
          const ringItem = activeBindingItem || (activeBindingGroup && activeBindingGroup.items && activeBindingGroup.items[0] ? inventory.find(i => i.id === activeBindingGroup.items[0].id) : null);

          if (ringItem && !isNoStock) {
              // Service price per binding job comes from the GROUP NAME (e.g. "KSH 50" → 50)
              const groupNamePrice = activeBindingGroup
                  ? parseFloat((activeBindingGroup.name || '').replace(/[^0-9.]/g, '')) || null
                  : null;
              const standardPrice = groupNamePrice || ringItem.selling_price || 50;
              logQty = Math.max(1, Math.floor(amt / standardPrice));
              logItem = ringItem;
              logProfit = amt - (ringItem.buying_price * logQty);
              // Deduct ring stock by quantity
              const newRingStock = (logItem.stock_quantity || 0) - logQty;
              try {
                  // if (navigator.onLine) await supabase.from('inventory').update({ stock_quantity: newRingStock }).eq('id', logItem.id); /* Handled by Postgres Trigger */
              } catch(e) {}
              if (logItem) logItem.stock_quantity = newRingStock;
          } else {
              // Tape binding or no item configured — use generic Binding Service item
              let svcItem = inventory.find(i => i.name === 'Binding Service');
              if (!svcItem) { 
                  try {
                      if (navigator.onLine) {
                          const {data} = await supabase.from('inventory').insert([{name: 'Binding Service', type: 'variable', selling_price: 0, is_service: true}]).select().single(); 
                          svcItem = data; 
                      } else {
                          svcItem = { id: 'temp-binding-srv', name: 'Binding Service', type: 'variable', selling_price: 0, is_service: true };
                      }
                  } catch(e) { svcItem = { id: 'temp-binding-srv', name: 'Binding Service', type: 'variable', selling_price: 0, is_service: true }; }
                  inventory.push(svcItem); 
              }
              logItem = svcItem;
          }
          // Always deduct linked resources (covers) for any binding job
          await deductBindingMaterials(logQty);
            } else {
          let item = inventory.find(i => i.name === activeQuick);
          if (!item) { 
              try {
                  if (navigator.onLine) {
                      const {data} = await supabase.from('inventory').insert([{name: activeQuick, type: 'variable', selling_price: 0, is_service: true}]).select().single(); 
                      item = data; 
                  } else {
                      item = { id: 	emp- + activeQuick.replace(/\s+/g,'-'), name: activeQuick, type: 'variable', selling_price: 0, is_service: true };
                  }
              } catch(e) { item = { id: 	emp- + activeQuick.replace(/\s+/g,'-'), name: activeQuick, type: 'variable', selling_price: 0, is_service: true }; }
              inventory.push(item); 
          }
          logItem = item;
          
          const qtyInput = document.getElementById('quick-qty');
          logQty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
          logProfit = amt - ((logItem.buying_price || 0) * logQty);

          if (!logItem.is_service && typeof logItem.stock_quantity === 'number') {
              const newStock = logItem.stock_quantity - logQty;
              try {
                  // if (navigator.onLine) await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', logItem.id); /* Handled by Postgres Trigger */
                  logItem.stock_quantity = newStock;
              } catch(e) {}
          }
      }

      // If in Multi-Item Receipt, Quotation, or Debt mode, add to Cart instead of immediate direct sale
      if (currentSaleMode === 'receipt' || currentSaleMode === 'quote' || currentSaleMode === 'debt') {
          docCart.push({
              id: logItem.id,
              name: logItem.name,
              qty: logQty,
              price: amt / logQty,
              total: amt,
              buying_price: logItem.buying_price || 0,
              kyocera_pages: 0
          });
          playPopChime();
          renderDocCart();
          document.getElementById('quick-amount').value = '';
          return;
      }

      const _qRes = await insertSaleWithOfflineSupport(supabase, {
          item_id: logItem.id, total_charged: amt, calculated_qty: logQty,
          calculated_profit: logProfit, cashier_id: currentUser ? currentUser.id : null,
          payment_method: quickPay.toLowerCase().replace('-', '')
      });
      playSuccessChime();
            if (_qRes.offline) {
          document.getElementById('quick-amount').value = '';
          if(document.getElementById('quick-qty')) document.getElementById('quick-qty').value = 1;
          if(window.setQuickPayUI) window.setQuickPayUI('M-Pesa');
          if(window.setQuickServiceUI) window.setQuickServiceUI('Print / Copy');
          alert('No internet - sale saved locally and will sync when back online.');
          setTimeout(()=>document.getElementById('quick-amount').focus(), 100);
          return;
      }

      document.getElementById('quick-amount').value = '';
      if(document.getElementById('quick-qty')) document.getElementById('quick-qty').value = 1;
      if(window.setQuickPayUI) window.setQuickPayUI('M-Pesa');
      if(window.setQuickServiceUI) window.setQuickServiceUI('Print / Copy');
      fetchTodaysSales();
      setTimeout(()=>document.getElementById('quick-amount').focus(), 100);
});


function handlePosSearch(e) {
    const term = e.target ? e.target.value.toLowerCase() : e.toLowerCase();
    const resDiv = document.getElementById('pos-search-results');
    
    let matches = inventory;
    if(term) {
        matches = inventory.filter(i => i.name.toLowerCase().includes(term));
    }
    
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-3 text-sm text-gray-500 font-medium">No items found</div>';
    } else {
        resDiv.innerHTML = matches.map(i => `<div class="p-3 text-sm cursor-pointer hover:bg-blue-50 border-b flex justify-between items-center transition-colors" onclick="selectPosItem('${i.id}', '${i.name.replace(/'/g, "\\'")}', ${i.selling_price})"><div class="font-bold text-gray-800">${i.name}</div><div class="font-bold text-blue-600">Ksh ${i.selling_price}</div></div>`).join('');
    }
    resDiv.classList.remove('hidden');
}

document.getElementById('pos-item-search').addEventListener('focus', (e) => handlePosSearch(e));
document.getElementById('pos-item-search').addEventListener('input', (e) => {
    document.getElementById('pos-item-id').value = ''; 
    document.getElementById('pos-total').value = '';
    document.getElementById('kyocera-fields').classList.add('hidden');
    handlePosSearch(e);
});


window.selectPosItem = (id, name, price) => {
    document.getElementById('pos-item-id').value = id;
    document.getElementById('pos-item-search').value = name;
    document.getElementById('pos-search-results').classList.add('hidden');
    
    const qty = parseInt(document.getElementById('pos-qty').value || 1);
    document.getElementById('pos-total').value = (price * qty).toFixed(2);
    
    document.getElementById('kyocera-fields').className = name.toLowerCase().includes('kyocera') ? 'p-3 bg-blue-50 border border-blue-100 rounded-lg mb-4' : 'hidden';
};

document.addEventListener('click', (e) => {
    if(!e.target.closest('#pos-item-search') && !e.target.closest('#pos-search-results')) {
        const res = document.getElementById('pos-search-results');
        if(res) res.classList.add('hidden');
    }
});

document.getElementById('pos-qty').addEventListener('input', () => {
    const id = document.getElementById('pos-item-id').value;
    if(!id) return;
    const item = inventory.find(i => i.id === id);
    if(item) {
        document.getElementById('pos-total').value = (item.selling_price * parseInt(document.getElementById('pos-qty').value || 1)).toFixed(2);
    }
});

['main-pay-mpesa', 'main-pay-cash'].forEach(id => document.getElementById(id).addEventListener('click', async (e) => {
    const amt = parseFloat(document.getElementById('pos-total').value), qty = parseInt(document.getElementById('pos-qty').value);
    const item = inventory.find(i => i.id === document.getElementById('pos-item-id').value);
    
    if(!item || !amt) return alert('Select an item and enter amount');
    
    // Quick validation before submitting
    e.target.innerText = 'Processing...';
    e.target.disabled = true;
    
    try {
        let bc = item.buying_price || 0, kyo = 0;
        if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
            kyo = parseInt(document.getElementById('kyo-pages').value); 
            bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value); 
        }
        
        const logPayload = {
              item_id: item.id, 
              total_charged: amt, 
              calculated_qty: qty, 
              calculated_profit: amt - (bc*qty), 
              cashier_id: currentUser.id, 
              payment_method: e.target.id.includes('mpesa') ? 'mpesa' : 'cash', 
              kyocera_pages: kyo
          };
          
          const qRes = await insertSaleWithOfflineSupport(supabase, logPayload);
          if (qRes.offline) {
              alert('No internet — sale saved locally and will sync when back online.');
          }
        
        // Reset form
        document.getElementById('pos-item-search').value = '';
          setTimeout(()=>document.getElementById('quick-amount').focus(), 100);
        document.getElementById('pos-item-id').value = '';
        document.getElementById('pos-total').value = '';
        document.getElementById('pos-qty').value = 1;
        fetchTodaysSales();
    } finally {
        e.target.innerText = e.target.id.includes('mpesa') ? 'M-Pesa' : 'Cash';
        e.target.disabled = false;
    }
}));


// ── Document / Multi-Item Cart & Quotation Logic ────────────────────────────
let currentSaleMode = 'direct'; // 'direct' | 'receipt' | 'quote' | 'debt'
let docCart = [];

function setSaleMode(mode) {
    currentSaleMode = mode;

    const btnDirect = document.getElementById('mode-direct');
    const btnReceipt = document.getElementById('mode-receipt');
    const btnQuote = document.getElementById('mode-quote');
    const btnDebt = document.getElementById('mode-debt');

    const activeCls = 'flex-1 sm:flex-none px-3.5 py-2 text-xs sm:text-sm font-black bg-white shadow-sm rounded-lg text-blue-600 transition';
    const inactiveCls = 'flex-1 sm:flex-none px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 rounded-lg transition';

    if (btnDirect) btnDirect.className = mode === 'direct' ? activeCls : inactiveCls;
    if (btnReceipt) btnReceipt.className = mode === 'receipt' ? activeCls : inactiveCls;
    if (btnQuote) btnQuote.className = mode === 'quote' ? activeCls : inactiveCls;
    if (btnDebt) btnDebt.className = mode === 'debt' ? activeCls : inactiveCls;

    const docActions = document.getElementById('doc-actions');
    const directActions = document.getElementById('direct-actions');
    const docCartPanel = document.getElementById('doc-cart-panel');
    const quoteContainer = document.getElementById('quote-details-container');
    const debtContainer = document.getElementById('debt-customer-container');
    const custWrap = document.getElementById('pos-customer-wrap');
    const addDocBtnLabel = document.getElementById('btn-add-to-doc-label');

    const cartActionsReceipt = document.getElementById('cart-actions-receipt');
    const cartActionsQuote = document.getElementById('cart-actions-quote');
    const cartActionsDebt = document.getElementById('cart-actions-debt');

    if (mode === 'direct') {
        docActions?.classList.add('hidden');
        directActions?.classList.remove('hidden');
        docCartPanel?.classList.add('hidden');
        quoteContainer?.classList.add('hidden');
        debtContainer?.classList.add('hidden');
        custWrap?.classList.remove('hidden');
        document.getElementById('main-pay-mpesa')?.classList.remove('hidden');
        document.getElementById('main-pay-cash')?.classList.remove('hidden');
        document.getElementById('main-pay-debt')?.classList.add('hidden');
    } else {
        docActions?.classList.remove('hidden');
        directActions?.classList.add('hidden');
        docCartPanel?.classList.remove('hidden');

        if (mode === 'receipt') {
            quoteContainer?.classList.add('hidden');
            debtContainer?.classList.add('hidden');
            custWrap?.classList.remove('hidden');
            cartActionsReceipt?.classList.remove('hidden');
            cartActionsQuote?.classList.add('hidden');
            cartActionsDebt?.classList.add('hidden');
            if (addDocBtnLabel) addDocBtnLabel.textContent = 'Add to Multi-Item Receipt';
        } else if (mode === 'quote') {
            quoteContainer?.classList.remove('hidden');
            debtContainer?.classList.add('hidden');
            custWrap?.classList.add('hidden');
            cartActionsReceipt?.classList.add('hidden');
            cartActionsQuote?.classList.remove('hidden');
            cartActionsDebt?.classList.add('hidden');
            if (addDocBtnLabel) addDocBtnLabel.textContent = 'Add to Quotation';
        } else if (mode === 'debt') {
            quoteContainer?.classList.add('hidden');
            debtContainer?.classList.remove('hidden');
            custWrap?.classList.remove('hidden');
            cartActionsReceipt?.classList.add('hidden');
            cartActionsQuote?.classList.add('hidden');
            cartActionsDebt?.classList.remove('hidden');
            if (addDocBtnLabel) addDocBtnLabel.textContent = 'Add to Debt Cart';
        }
    }
    renderDocCart();
}

function resetModes() {
    setSaleMode('direct');
}

document.getElementById('mode-direct')?.addEventListener('click', () => setSaleMode('direct'));
document.getElementById('mode-receipt')?.addEventListener('click', () => setSaleMode('receipt'));
document.getElementById('mode-quote')?.addEventListener('click', () => setSaleMode('quote'));
document.getElementById('mode-debt')?.addEventListener('click', () => setSaleMode('debt'));

function renderDocCart() {
    const tbody = document.getElementById('doc-cart-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let total = 0;
    docCart.forEach((item, idx) => {
        total += item.total;
        tbody.innerHTML += `
            <tr class="hover:bg-slate-100/80 transition-colors">
                <td class="p-2.5">
                    <span class="font-bold text-slate-800 block">${item.name}</span>
                    <span class="text-xs text-slate-400">@ Ksh ${item.price.toFixed(2)}</span>
                </td>
                <td class="p-2.5 text-center">
                    <div class="inline-flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-xs">
                        <button onclick="adjustDocItemQty(${idx}, -1)" class="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-black text-sm">-</button>
                        <span class="px-2 py-0.5 font-bold text-xs min-w-[24px] text-center">${item.qty}</span>
                        <button onclick="adjustDocItemQty(${idx}, 1)" class="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-black text-sm">+</button>
                    </div>
                </td>
                <td class="p-2.5 text-right font-medium text-slate-600">Ksh ${item.price.toFixed(2)}</td>
                <td class="p-2.5 text-right font-black text-slate-900">Ksh ${item.total.toFixed(2)}</td>
                <td class="p-2.5 text-center">
                    <button onclick="removeDocItem(${idx})" class="w-6 h-6 rounded-full hover:bg-red-100 text-red-500 font-black text-base inline-flex items-center justify-center transition" title="Remove">&times;</button>
                </td>
            </tr>
        `;
    });
    
    const heading = document.getElementById('doc-cart-heading');
    if (heading) {
        const modeLabel = currentSaleMode === 'quote' ? 'Quotation' : (currentSaleMode === 'debt' ? 'Debt' : 'Receipt');
        heading.textContent = `${modeLabel} Items (${docCart.length})`;
    }
    const totalEl = document.getElementById('doc-cart-total');
    if (totalEl) totalEl.innerText = `Ksh ${total.toFixed(2)}`;
}

window.adjustDocItemQty = (idx, delta) => {
    if (!docCart[idx]) return;
    docCart[idx].qty += delta;
    if (docCart[idx].qty <= 0) {
        docCart.splice(idx, 1);
    } else {
        docCart[idx].total = docCart[idx].qty * docCart[idx].price;
    }
    renderDocCart();
};

window.removeDocItem = (idx) => {
    docCart.splice(idx, 1);
    renderDocCart();
};

document.getElementById('btn-add-to-doc')?.addEventListener('click', () => {
    const amt = parseFloat(document.getElementById('pos-total').value);
    const qty = parseInt(document.getElementById('pos-qty').value) || 1;
    const item = inventory.find(i => i.id === document.getElementById('pos-item-id').value);
    
    if (!item || isNaN(amt) || amt <= 0) return alert('Select an item and enter a valid amount.');
    
    let bc = item.buying_price || 0, kyo = 0;
    if (!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
        kyo = parseInt(document.getElementById('kyo-pages').value) || 0; 
        bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value || 0); 
    }
    
    docCart.push({
        id: item.id,
        name: item.name,
        qty: qty,
        price: amt / qty,
        total: amt,
        buying_price: bc,
        kyocera_pages: kyo
    });
    
    playPopChime();

    // Reset inputs
    document.getElementById('pos-item-search').value = '';
    document.getElementById('pos-item-id').value = '';
    document.getElementById('pos-total').value = '';
    document.getElementById('pos-qty').value = 1;
    document.getElementById('kyocera-fields')?.classList.add('hidden');
    
    renderDocCart();
});

document.getElementById('btn-clear-doc')?.addEventListener('click', () => {
    if (docCart.length === 0) return;
    if (confirm('Clear all items from cart?')) {
        docCart = [];
        renderDocCart();
    }
});

function generatePDF(type, paymentMethod = '') {
    if (docCart.length === 0) return alert('Cart is empty.');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const quoteCustName = document.getElementById('quote-cust-name')?.value?.trim();
    const custId = document.getElementById('pos-customer')?.value;
    const cust = quoteCustName ? { name: quoteCustName } : (customers.find(c => c.id === custId) || { name: 'Walk-in Customer / Client' });
    const validityDays = parseInt(document.getElementById('quote-validity')?.value || 14);
    
    const today = new Date();
    const validUntilDate = new Date();
    validUntilDate.setDate(today.getDate() + validityDays);

    // Header in Essie Blue
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("ESSIE CYBER SERVICES", 14, 18);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Professional Printing • Photocopy • Scanning • Online Services", 14, 26);
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(type === 'quote' ? 'OFFICIAL QUOTATION' : 'CASH / M-PESA RECEIPT', 196, 20, { align: 'right' });
    
    // Client Details & Reference Box
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("ISSUED TO / CLIENT:", 14, 42);
    doc.setFontSize(12);
    doc.text(cust.name, 14, 49);
    if (cust.phone) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Phone: ${cust.phone}`, 14, 55);
    }
    
    // Date & Ref Box
    const refCode = type === 'quote'
        ? `QUO-${today.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
        : `REC-${today.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Doc Ref:`, 140, 42);
    doc.setFont("helvetica", "normal");
    doc.text(refCode, 196, 42, { align: 'right' });

    doc.setFont("helvetica", "bold");
    doc.text(`Issue Date:`, 140, 48);
    doc.setFont("helvetica", "normal");
    doc.text(today.toLocaleDateString(), 196, 48, { align: 'right' });

    if (type === 'quote') {
        doc.setFont("helvetica", "bold");
        doc.text(`Valid Until:`, 140, 54);
        doc.setFont("helvetica", "normal");
        doc.text(validUntilDate.toLocaleDateString(), 196, 54, { align: 'right' });
    } else if (paymentMethod) {
        doc.setFont("helvetica", "bold");
        doc.text(`Payment:`, 140, 54);
        doc.setFont("helvetica", "normal");
        doc.text(paymentMethod.toUpperCase(), 196, 54, { align: 'right' });
    }
    
    // Table
    const tableData = docCart.map((item, idx) => [
        idx + 1,
        item.name,
        item.qty,
        `Ksh ${item.price.toFixed(2)}`,
        `Ksh ${item.total.toFixed(2)}`
    ]);
    
    let sum = 0; docCart.forEach(i => sum += i.total);
    tableData.push(['', 'TOTAL PAYABLE', '', '', `Ksh ${sum.toFixed(2)}`]);
    
    doc.autoTable({
        startY: 64,
        head: [['#', 'Description of Services / Products', 'Qty', 'Unit Price', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], fontStyle: 'bold' },
        styles: { font: 'helvetica', fontSize: 10, cellPadding: 3.5 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            2: { halign: 'center', cellWidth: 20 },
            3: { halign: 'right', cellWidth: 35 },
            4: { halign: 'right', fontStyle: 'bold', cellWidth: 35 }
        },
        didParseCell: function (data) {
            if (data.row.index === tableData.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fontSize = 11;
                data.cell.styles.fillColor = [239, 246, 255];
                data.cell.styles.textColor = [30, 64, 175];
            }
        }
    });
    
    const finalY = doc.lastAutoTable.finalY || 80;

    // Terms & Signoff
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    if (type === 'quote') {
        doc.text(`Notes & Terms:\n1. This quotation is valid for ${validityDays} days from date of issue.\n2. Prices inclusive of applicable service fees.\n3. Payment via M-Pesa / Cash upon job authorization.`, 14, finalY + 14);
        doc.text("Authorized Signature & Stamp: ______________________", 120, finalY + 30);
    } else {
        doc.text("Thank you for your business! Goods / printed jobs received in good condition.", 105, finalY + 16, { align: 'center' });
    }
    
    const fileName = `${type === 'quote' ? 'Quotation' : 'Receipt'}_${cust.name.replace(/[^a-zA-Z0-9]/g, '_')}_${today.toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}

async function processReceipt(paymentMethod) {
    if (docCart.length === 0) return alert('Cart is empty.');
    
    const btnMpesa = document.getElementById('btn-receipt-mpesa');
    const btnCash = document.getElementById('btn-receipt-cash');
    if (btnMpesa) btnMpesa.disabled = true;
    if (btnCash) btnCash.disabled = true;
    
    try {
        const logs = docCart.map(i => ({
            item_id: i.id,
            total_charged: i.total,
            calculated_qty: i.qty,
            calculated_profit: i.total - (i.buying_price * i.qty),
            cashier_id: currentUser ? currentUser.id : null,
            payment_method: paymentMethod.toLowerCase().replace('-', ''),
            kyocera_pages: i.kyocera_pages || 0
        }));
        
        for (const log of logs) {
            await insertSaleWithOfflineSupport(supabase, log);
        }

        // Deduct inventory for physical items
        for (let item of docCart) {
            const invItem = inventory.find(i => i.id === item.id);
            if (invItem && !invItem.is_service && typeof invItem.stock_quantity === 'number') {
                const newStock = Math.max(0, invItem.stock_quantity - item.qty);
                invItem.stock_quantity = newStock;
            }
        }
        
        playSuccessChime();
        generatePDF('receipt', paymentMethod);
        
        docCart = [];
        renderDocCart();
        await fetchTodaysSales();
        alert(`Receipt processed and downloaded for ${paymentMethod} payment!`);
    } catch(err) {
        alert('Error logging receipt: ' + err.message);
    } finally {
        if (btnMpesa) btnMpesa.disabled = false;
        if (btnCash) btnCash.disabled = false;
    }
}

document.getElementById('btn-dl-quote')?.addEventListener('click', () => {
    generatePDF('quote');
    playSuccessChime();
});
document.getElementById('btn-receipt-mpesa')?.addEventListener('click', () => processReceipt('M-Pesa'));
document.getElementById('btn-receipt-cash')?.addEventListener('click', () => processReceipt('Cash'));

loadData();









window.togglePayment = async (id, currentMethod) => {
    const newMethod = currentMethod.toLowerCase() === 'cash' ? 'mpesa' : 'cash';
    if (!confirm(`Change payment method to ${newMethod.toUpperCase()}?`)) return;
    try {
        const { error } = await supabase.from('sales_log').update({ payment_method: newMethod }).eq('id', id);
        if (error) throw error;
        fetchTodaysSales();
    } catch(err) {
        alert('Error updating payment: ' + err.message);
    }
};

window.voidSale = async (id) => {
    if (!confirm('Are you sure you want to void this entry?')) return;
    try {
        let sale = todaysSales.find(s => s.id === id);
        if (!sale) {
            const { data } = await supabase.from('sales_log').select('*').eq('id', id).single();
            sale = data;
        }

        if (sale && sale.customer_id) {
            let cust = customers.find(c => c.id === sale.customer_id);
            let currentDebt = cust ? parseFloat(cust.outstanding_debt || 0) : 0;

            if (!cust) {
                const { data: dbCust } = await supabase.from('customers').select('*').eq('id', sale.customer_id).single();
                if (dbCust) {
                    cust = dbCust;
                    currentDebt = parseFloat(dbCust.outstanding_debt || 0);
                    customers.push(dbCust);
                }
            }

            if (sale.status === 'debt_collection') {
                // Voiding a collection restores the customer's debt (moves it back up)
                const newDebt = currentDebt + parseFloat(sale.total_charged || 0);
                const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', sale.customer_id);
                if (custErr) throw custErr;
                if (cust) cust.outstanding_debt = newDebt;
            } else if (sale.status === 'debt') {
                // Voiding a credit/debt sale cancels the added debt (moves it back down)
                const newDebt = Math.max(0, currentDebt - parseFloat(sale.total_charged || 0));
                const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', sale.customer_id);
                if (custErr) throw custErr;
                if (cust) cust.outstanding_debt = newDebt;
            }

            localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
            populateCustomerDropdown();
            populateDebtDropdown();
            populateDebtSaleDropdown();
        }

        const { error } = await supabase.from('sales_log').update({
            is_voided: true,
            voided_at: new Date().toISOString(),
            voided_by: currentUser ? currentUser.id : null
        }).eq('id', id);
        if (error) throw error;

        await fetchTodaysSales();
    } catch(err) {
        alert('Error voiding sale: ' + err.message);
    }
};


// ─── LEDGER TOGGLE ────────────────────────────────────────────────────────────
let ledgerVisible = false;

// Ledger Auto-hide logic (5 minutes)
let ledgerTimer;
function resetLedgerTimer() {
    clearTimeout(ledgerTimer);
    if (ledgerVisible) {
        ledgerTimer = setTimeout(() => {
            if (ledgerVisible) {
                const btn = document.getElementById('btn-toggle-ledger');
                if (btn) btn.click();
            }
        }, 5 * 60 * 1000);
    }
}
document.addEventListener('mousemove', resetLedgerTimer);
document.addEventListener('keydown', resetLedgerTimer);

document.getElementById('btn-toggle-ledger').addEventListener('click', () => {
    ledgerVisible = !ledgerVisible;
    const table = document.getElementById('ledger-table-wrap');
    const totals = document.getElementById('ledger-totals');
    const icon = document.getElementById('ledger-toggle-icon');
    const label = document.getElementById('ledger-toggle-label');
    if (ledgerVisible) {
        table.classList.remove('hidden');
        totals.classList.remove('hidden');
        icon.textContent = '👁️';
        label.textContent = 'Hide';
    } else {
        table.classList.add('hidden');
        totals.classList.add('hidden');
        icon.textContent = '🚫';
        label.textContent = 'Show';
    }
    resetLedgerTimer();
});

// Initialize timer on load
resetLedgerTimer();

// ─── QUICK EXPENSE LOGGER ─────────────────────────────────────────────────────

// Fetch users for wage dropdown
async function loadUsersForWage() {
    const { data } = await supabase.from('users').select('id, username');
    const sel = document.getElementById('exp-wage-user');
    if (sel && data) {
        sel.innerHTML = '<option value="">Select cashier...</option>' + data.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
    }
}
loadUsersForWage();

let activeExpenseTab = 'lunch';

document.querySelectorAll('.exp-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        activeExpenseTab = type;
        
        // Reset tabs UI
        document.querySelectorAll('.exp-tab').forEach(b => {
            b.className = 'exp-tab flex-1 text-xs py-1 rounded font-bold bg-slate-200 text-slate-600 transition-colors';
        });
        e.target.className = 'exp-tab flex-1 text-xs py-1 rounded font-bold bg-slate-700 text-white transition-colors';

        // Toggle fields
        const wageFields = document.getElementById('exp-wage-fields');
        const descField = document.getElementById('exp-desc');
        const amtField = document.getElementById('exp-amount');
        
        wageFields.classList.add('hidden');
        if(descField) descField.classList.add('hidden');
        
        if (type === 'wage') {
            wageFields.classList.remove('hidden');
            amtField.placeholder = "Wage Amount (Ksh)";
        } else if (type === 'other') {
            if(descField) {
                descField.classList.remove('hidden');
                descField.placeholder = "Description...";
            }
            amtField.placeholder = "Amount (Ksh)";
        } else {
            amtField.placeholder = "Amount (Ksh)";
        }
    });
});

document.getElementById('btn-log-expense').addEventListener('click', async () => {
    let desc = '';
    let amt = parseFloat(document.getElementById('exp-amount').value);
    let targetUserId = null;
    
    if (activeExpenseTab === 'lunch') desc = 'Lunch';
    else if (activeExpenseTab === 'transport') desc = 'Transport';
    else if (activeExpenseTab === 'wage') {
        const sel = document.getElementById('exp-wage-user');
        const userId = sel.value;
        if (!userId) return alert('Select a cashier for the wage log.');
        const userName = sel.options[sel.selectedIndex].text;
        desc = `Wage - ${userName}`;
        targetUserId = userId;
    }
    else if (activeExpenseTab === 'other') {
        const descField = document.getElementById('exp-desc');
        desc = descField ? descField.value.trim() : 'Other';
    }

    if (!desc || isNaN(amt) || amt <= 0) return alert('Enter valid details and amount.');
    
    const btn = document.getElementById('btn-log-expense');
    btn.disabled = true; btn.textContent = 'Logging...';
    
    try {
        const payload = {
            amount: amt,
            description: desc
        };
        const res = await insertExpenseWithOfflineSupport(supabase, payload, desc);
        
        // Ensure wage gets tracked in Admin Shift Wages automatically
        if (targetUserId && navigator.onLine) {
            const today = new Date().toISOString().split('T')[0];
            await supabase.from('attendance_log').upsert({
                user_id: targetUserId,
                work_date: today,
                wage_assigned: amt
            }, { onConflict: 'user_id, work_date' });
        }

        const descField = document.getElementById('exp-desc');
        if(descField) descField.value = '';
        document.getElementById('exp-amount').value = '';
        
        if (res.offline) {
            alert('No internet — expense queued locally (' + desc + ' - Ksh ' + amt + ')');
        } else {
            alert('Expense logged: ' + desc + ' - Ksh ' + amt);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Log Expense';
    }
});

// ─── QUICK RESOURCE OPENER ────────────────────────────────────────────────────
const qresInput = document.getElementById('qres-search');
const qresResults = document.getElementById('qres-results');

qresInput.addEventListener('input', () => {
    const term = qresInput.value.toLowerCase();
    const matches = inventory.filter(i => !i.is_service && i.name.toLowerCase().includes(term));
    if (!term || matches.length === 0) { qresResults.classList.add('hidden'); return; }
    qresResults.innerHTML = matches.slice(0, 10).map(i =>
        `<div class="p-2 text-sm cursor-pointer hover:bg-slate-50 border-b"
              onclick="selectQRes('${i.id}', '${i.name.replace(/'/g, "\\'")}', ${i.buying_price || 0})">
            <div class="font-bold">${i.name}</div>
            <div class="text-xs text-gray-400">Stock: ${i.stock_quantity} | BP: Ksh ${i.buying_price || 0}</div>
         </div>`
    ).join('');
    qresResults.classList.remove('hidden');
});

window.selectQRes = (id, name, bp) => {
    document.getElementById('qres-item-id').value = id;
    document.getElementById('qres-search').value = name;
    
    const selectedItem = inventory.find(i => i.id === id);
    const costPreview = document.getElementById('qres-cost-preview');
    const stockDisplay = document.getElementById('qres-stock-display');
    const unitCostInput = document.getElementById('qres-unit-cost');
    const totalExpenseLabel = document.getElementById('qres-total-expense-label');
    const qtyInput = document.getElementById('qres-qty');

    if (costPreview) {
        costPreview.classList.remove('hidden');
        if (stockDisplay) stockDisplay.textContent = `Stock: ${selectedItem?.stock_quantity ?? 0}`;
        const defaultBp = parseFloat(bp || selectedItem?.buying_price || 0);
        if (unitCostInput) unitCostInput.value = defaultBp > 0 ? defaultBp : '';
        const qty = parseInt(qtyInput?.value || 1);
        if (totalExpenseLabel) totalExpenseLabel.textContent = `Total Expense to Log: Ksh ${(defaultBp * qty).toFixed(2)}`;
    }
    
    const children = inventory.filter(i => i.parent_id === id);
    const piecesSidebar = document.getElementById('qres-pieces-sidebar');
    const piecesContent = document.getElementById('qres-pieces-content');
    
    if (piecesSidebar && piecesContent) {
        if (children.length > 0) {
            piecesSidebar.classList.remove('hidden');
            piecesContent.innerHTML = children.map(c => 
                `<div class="bg-white p-1 rounded border mb-1 flex justify-between items-center text-xs">
                    <span class="truncate pr-1">${c.name}</span>
                    <span class="bg-blue-100 text-blue-800 px-1 rounded">${c.units_per_parent || 0}</span>
                </div>`
            ).join('');
        } else {
            piecesSidebar.classList.add('hidden');
            piecesContent.innerHTML = '';
        }
    }
    
    qresResults.classList.add('hidden');
};

function updateQResCostPreview() {
    const unitCost = parseFloat(document.getElementById('qres-unit-cost')?.value || 0);
    const qty = parseInt(document.getElementById('qres-qty')?.value || 1);
    const label = document.getElementById('qres-total-expense-label');
    if (label) label.textContent = `Total Expense to Log: Ksh ${(unitCost * qty).toFixed(2)}`;
}
document.getElementById('qres-unit-cost')?.addEventListener('input', updateQResCostPreview);
document.getElementById('qres-qty')?.addEventListener('input', updateQResCostPreview);

document.addEventListener('click', e => {
    if (!e.target.closest('#qres-search') && !e.target.closest('#qres-results')) {
        qresResults.classList.add('hidden');
    }
});

document.getElementById('btn-open-resource').addEventListener('click', async () => {
    const itemId = document.getElementById('qres-item-id').value;
    const qty = parseInt(document.getElementById('qres-qty').value || 1);
    const name = document.getElementById('qres-search').value;
    if (!itemId || qty < 1) return alert('Select an item and enter quantity.');
    
    const selectedItem = inventory.find(i => i.id === itemId);
    const unitCostInput = document.getElementById('qres-unit-cost');
    let costPerUnit = unitCostInput && unitCostInput.value !== '' ? parseFloat(unitCostInput.value) : (selectedItem ? selectedItem.buying_price : 0);

    if (costPerUnit <= 0) {
        const userCost = prompt(`Buying price for "${name}" is Ksh 0. Please enter the cost per unit to log expense accurately (e.g. 650 for a paper ream):`, "");
        if (!userCost || isNaN(parseFloat(userCost)) || parseFloat(userCost) <= 0) {
            return alert('Opening cancelled. A valid buying price / cost is required to keep profit calculations accurate.');
        }
        costPerUnit = parseFloat(userCost);
    }
    
    const btn = document.getElementById('btn-open-resource');
    btn.disabled = true; btn.textContent = 'Opening...';
    try {
        if (!navigator.onLine) {
            throw new Error("You must be online to open a bulk resource right now.");
        }

        await supabase.from('resources')
            .update({ status: 'exhausted' })
            .eq('name', name)
            .eq('status', 'active');

        const { error } = await supabase.from('resources').insert([{
            name: name,
            units: qty,
            cost: costPerUnit * qty,
            status: 'active',
            opened_at: new Date().toISOString(),
            opened_by: currentUser.id
        }]);
        if (error) throw error;
        
        if (selectedItem) {
            const newParentStock = selectedItem.stock_quantity - qty;
            const { error: pErr } = await supabase.from('inventory')
                .update({ stock_quantity: newParentStock })
                .eq('id', itemId);
            if (pErr) throw pErr;
            
            const children = inventory.filter(i => i.parent_id === itemId);
            for (const child of children) {
                const addQty = qty * (child.units_per_parent || 1);
                const newChildStock = child.stock_quantity + addQty;
                const { error: cErr } = await supabase.from('inventory')
                    .update({ stock_quantity: newChildStock })
                    .eq('id', child.id);
                if (cErr) throw cErr;
            }
            
            if (typeof loadInventory === 'function') {
                await loadInventory();
            }
        }
        
        document.getElementById('qres-search').value = '';
        document.getElementById('qres-item-id').value = '';
        document.getElementById('qres-qty').value = 1;
        document.getElementById('qres-cost-preview')?.classList.add('hidden');
        
        await checkTodaysOpenedResources();
        alert('Resource opened: ' + name + ' x' + qty + ' (Expense logged: Ksh ' + (costPerUnit * qty).toFixed(2) + ')');
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Open Resource';
    }
});


// --- QTY +/- BUTTONS ---
const qtyInput = document.getElementById('pos-qty');
const totalInput = document.getElementById('pos-total');
const btnMinus = document.getElementById('qty-minus');
const btnPlus = document.getElementById('qty-plus');

function updatePosTotal() {
    const itemId = document.getElementById('pos-item-id').value;
    if (!itemId) return;
    const item = inventory.find(i => i.id === itemId);
    if (!item) return;
    let q = parseFloat(qtyInput.value) || 0;
    if(q < 0) q = 0;
    totalInput.value = item.selling_price * q;
}

if (btnMinus && btnPlus) {
    btnMinus.addEventListener('click', (e) => {
        e.preventDefault();
        let val = parseFloat(qtyInput.value) || 0;
        if (val > 1) { qtyInput.value = val - 1; updatePosTotal(); }
    });
    btnPlus.addEventListener('click', (e) => {
        e.preventDefault();
        let val = parseFloat(qtyInput.value) || 0;
        qtyInput.value = val + 1; updatePosTotal();
    });
    qtyInput.addEventListener('input', updatePosTotal);
}

// Ensure pos-qty handles its own updates when manually typed

// --- KEYBOARD SHORTCUTS ---
const quickAmt = document.getElementById('quick-amount');
quickAmt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        // Update global quickPay state
        
        
        window.setQuickPayUI(e.shiftKey ? 'Cash' : 'M-Pesa');
        
        // Trigger save
        document.getElementById('quick-log-btn').click();
    }
});

const mainInputs = ['pos-item-search', 'pos-qty', 'pos-total', 'pos-customer', 'kyo-pages', 'kyo-cost-pp'];
mainInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (isDocMode) return; // Do nothing if in Quote/Receipt mode
                e.preventDefault();
                if (e.shiftKey) {
                    document.getElementById('main-pay-cash').click();
                } else {
                    document.getElementById('main-pay-mpesa').click();
                }
            }
        });
    }
});

// Default focus on load
setTimeout(() => { document.getElementById('quick-amount').focus(); }, 500);

// Set focus back after logging a quick sale
const originalQuickLogCode = "document.getElementById('quick-amount').value = ''; fetchTodaysSales();";
const newQuickLogCode = "document.getElementById('quick-amount').value = ''; fetchTodaysSales(); setTimeout(()=>document.getElementById('quick-amount').focus(), 100);";

// --- AUTO-FOCUS ON INACTIVITY ---
let focusTimer;
function resetFocusTimer() {
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
        const quickAmt = document.getElementById('quick-amount');
        if (quickAmt) quickAmt.focus();
    }, 60 * 1000); // 1 minute
}
document.addEventListener('mousemove', resetFocusTimer);
document.addEventListener('keydown', resetFocusTimer);
document.addEventListener('click', resetFocusTimer);
// --- OFFLINE SYNC LISTENER ---
window.addEventListener('online', async () => {
    console.log('[Network] Back online, syncing sales and expenses...');
    const salesCount = await syncOfflineSales(supabase);
    const expensesCount = await syncOfflineExpenses(supabase);
    if (salesCount > 0) {
        // Refresh the ledger
        fetchTodaysSales();
    }
    if (expensesCount > 0) {
        console.log(`Synced ${expensesCount} expenses.`);
    }
});
resetFocusTimer(); // Init

function populateDebtSaleDropdown() {
    const sel = document.getElementById('debt-sale-customer-select');
    if (!sel) return;
    const prior = sel.value;
    sel.innerHTML = '<option value="">-- Choose Customer --</option>';
    customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
    });
    if (prior) sel.value = prior;
}

const mainPayDebt = document.getElementById('main-pay-debt');
if (mainPayDebt) {
    mainPayDebt.addEventListener('click', async () => {
        if (!navigator.onLine) {
            alert('Debt Sales require an active internet connection.');
            return;
        }
        
        const custId = document.getElementById('debt-sale-customer-select').value || document.getElementById('pos-customer').value;
        if (!custId) {
            alert('Please select a customer for the debt sale.');
            return;
        }

        const amt = parseFloat(document.getElementById('pos-total').value);
        const qty = parseInt(document.getElementById('pos-qty').value || 1);
        const itemId = document.getElementById('pos-item-id').value;
        const item = inventory.find(i => i.id === itemId);
        
        if(!item || !amt) return alert('Select an item and enter amount');

        const cust = customers.find(c => c.id == custId);
        if (!cust) return alert('Customer not found.');

        if (!confirm('Log Ksh ' + amt + ' as Debt for ' + cust.name + '?')) return;

        mainPayDebt.disabled = true;
        mainPayDebt.textContent = 'Processing...';

        try {
            let bc = item.buying_price || 0, kyo = 0;
            if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
                kyo = parseInt(document.getElementById('kyo-pages').value) || 0; 
                bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value || 0); 
            }
            if(item.name.toLowerCase().includes('binding') && !item.is_kyocera) {
                bc = await calculateBindingCost(qty);
            }
            const prof = (item.is_kyocera || !document.getElementById('kyocera-fields').classList.contains('hidden') || item.name.toLowerCase().includes('binding')) ? (amt - bc) : (amt - (bc * qty));

            const { error: insertErr } = await supabase.from('sales_log').insert([{
                item_id: item.id,
                total_charged: amt,
                calculated_qty: qty,
                calculated_profit: prof,
                cashier_id: currentUser ? currentUser.id : null,
                payment_method: 'debt',
                status: 'debt',
                customer_id: custId,
                kyocera_pages: kyo
            }]);
            if (insertErr) throw insertErr;

            // Update customer debt
            const newDebt = parseFloat(cust.outstanding_debt || 0) + amt;
            const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', custId);
            if (custErr) throw custErr;
            
            cust.outstanding_debt = newDebt;
            localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
            populateCustomerDropdown();
            populateDebtDropdown();
            populateDebtSaleDropdown();

            // Deduct inventory
            if (item.type === 'variable' && item.is_service && !item.is_kyocera) {
                if (item.name.toLowerCase().includes('binding')) await deductBindingMaterials(qty);
            } else if (item.type === 'fixed') {
                const newStock = (item.stock_quantity || 0) - qty;
                /* await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); - Handled by Postgres Trigger */
                item.stock_quantity = newStock;
            }

            document.getElementById('pos-item-id').value = '';
            document.getElementById('pos-item-search').value = '';
            document.getElementById('pos-qty').value = '1';
            document.getElementById('pos-total').value = '';
            document.getElementById('kyocera-fields').classList.add('hidden');
            
            fetchTodaysSales();
            resetModes();
            document.getElementById('debt-sale-customer-select').value = '';
        } catch (err) {
            alert('Error processing debt sale: ' + err.message);
        } finally {
            mainPayDebt.disabled = false;
            mainPayDebt.textContent = 'Debt';
        }
    });
}
// NEW DEBT CHECKOUT LOGIC

const btnDebtCart = document.getElementById('btn-debt-cart');
if (btnDebtCart) {
    btnDebtCart.addEventListener('click', async () => {
        if (!navigator.onLine) {
            alert('Debt Sales require an active internet connection.');
            return;
        }
        
        const custId = document.getElementById('debt-sale-customer-select').value || document.getElementById('pos-customer').value;
        if (!custId) {
            alert('Please select a customer for the debt sale.');
            return;
        }

        if (docCart.length === 0) {
            alert('Cart is empty.');
            return;
        }

        const totalAmount = docCart.reduce((sum, item) => sum + item.total, 0);
        const cust = customers.find(c => c.id == custId);
        if (!cust) return alert('Customer not found.');

        if (!confirm('Log Ksh ' + totalAmount + ' as Debt for ' + cust.name + '?')) return;

        btnDebtCart.disabled = true;
        btnDebtCart.textContent = 'Processing...';

        try {
            const inserts = docCart.map(item => ({
                item_id: item.id,
                total_charged: item.total,
                calculated_qty: item.qty,
                calculated_profit: (item.kyocera_pages > 0 || item.name.toLowerCase().includes('binding')) ? (item.total - item.buying_price) : (item.total - (item.buying_price * item.qty)),
                cashier_id: currentUser ? currentUser.id : null,
                payment_method: 'debt',
                status: 'debt',
                customer_id: custId,
                kyocera_pages: item.kyocera_pages || 0
            }));

            const { error: insertErr } = await supabase.from('sales_log').insert(inserts);
            if (insertErr) throw insertErr;

            // Update customer debt
            const newDebt = parseFloat(cust.outstanding_debt || 0) + totalAmount;
            const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', custId);
            if (custErr) throw custErr;
            
            cust.outstanding_debt = newDebt;
            localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
            populateCustomerDropdown();
            populateDebtDropdown();
            populateDebtSaleDropdown();

            // Deduct inventory
            for (let item of docCart) {
                if (item.type === 'variable' && item.is_service && !item.is_kyocera) {
                    if (item.name.toLowerCase().includes('binding')) await deductBindingMaterials(item.qty);
                    continue;
                }
                const logItem = inventory.find(i => i.id === item.id);
                if (logItem && logItem.type === 'fixed') {
                    const newStock = (logItem.stock_quantity || 0) - item.qty;
                    /* await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); - Handled by Postgres Trigger */
                    logItem.stock_quantity = newStock;
                }
            }

            docCart = [];
            renderDocCart();
            fetchTodaysSales();
            resetModes();
            document.getElementById('debt-sale-customer-select').value = '';
        } catch (err) {
            alert('Error processing debt sale: ' + err.message);
        } finally {
            btnDebtCart.disabled = false;
            btnDebtCart.textContent = 'Process Debt';
        }
    });
}

// --- TIERED PRODUCT DRAWER LOGIC ---
const drawerOverlay = document.getElementById('drawer-overlay');
const quickAddDrawer = document.getElementById('quick-add-drawer');

document.getElementById('btn-open-drawer').addEventListener('click', () => {
    drawerOverlay.classList.remove('hidden');
    // slight delay to allow display block to apply before transform
    setTimeout(() => {
        quickAddDrawer.classList.remove('translate-x-full');
    }, 10);
});

document.getElementById('btn-close-drawer').addEventListener('click', () => {
    quickAddDrawer.classList.add('translate-x-full');
    setTimeout(() => {
        drawerOverlay.classList.add('hidden');
    }, 300);
});

drawerOverlay.addEventListener('click', () => {
    document.getElementById('btn-close-drawer').click();
});

// Search and Drag Logic for Drawer
const drawerSearch = document.getElementById('drawer-search-products');
const drawerList = document.getElementById('drawer-products-list');
let drawerDraggedItem = null;

function renderDrawerProducts() {
    const term = drawerSearch.value.toLowerCase();
    const matches = inventory.filter(i => i.name.toLowerCase().includes(term));
    drawerList.innerHTML = matches.slice(0, 15).map(i => `
        <div class="p-2 bg-white border border-slate-200 rounded cursor-grab hover:border-blue-400 shadow-sm flex justify-between items-center text-xs" 
             draggable="true" ondragstart="drawerDragStart(event, '${i.id}')">
            <div>
                <div class="font-bold text-slate-800">${i.name}</div>
                <div class="text-slate-500">Ksh ${i.selling_price || 0}</div>
            </div>
        </div>
    `).join('');
}

window.drawerDragStart = (e, id) => {
    drawerDraggedItem = inventory.find(i => i.id === id);
    e.dataTransfer.setData('text/plain', id);
};

drawerSearch.addEventListener('input', renderDrawerProducts);
// Render once when opened
document.getElementById('btn-open-drawer').addEventListener('click', renderDrawerProducts);

let drawerLinkedTiers = { 1: null, 2: null, 3: null };

function setupDrawerDropzone(tierNum) {
    const section = document.getElementById('dqa-section-' + tierNum);
    section.addEventListener('dragover', e => { e.preventDefault(); section.classList.add('bg-blue-100', 'border-blue-400'); });
    section.addEventListener('dragleave', e => { section.classList.remove('bg-blue-100', 'border-blue-400'); });
    section.addEventListener('drop', e => {
        e.preventDefault();
        section.classList.remove('bg-blue-100', 'border-blue-400');
        if (!drawerDraggedItem) return;

        drawerLinkedTiers[tierNum] = drawerDraggedItem;
        
        document.getElementById('dqa-t' + tierNum + '-name').value = drawerDraggedItem.name;
        document.getElementById('dqa-t' + tierNum + '-cp').value = drawerDraggedItem.buying_price || 0;
        document.getElementById('dqa-t' + tierNum + '-sp').value = drawerDraggedItem.selling_price || 0;
        document.getElementById('dqa-t' + tierNum + '-stock').value = drawerDraggedItem.stock_quantity || 0;
        
        document.getElementById('dqa-linked-badge-' + tierNum).classList.remove('hidden');
        
        if (tierNum === 2) {
            document.getElementById('dqa-t2-en').checked = true;
            document.getElementById('dqa-t2-en').dispatchEvent(new Event('change'));
        }
        if (tierNum === 3) {
            document.getElementById('dqa-t3-en').checked = true;
            document.getElementById('dqa-t3-en').dispatchEvent(new Event('change'));
        }
    });
}

setupDrawerDropzone(1);
setupDrawerDropzone(2);
setupDrawerDropzone(3);

document.getElementById('btn-drawer-quick-add').addEventListener('click', async () => {
    const t1Name = document.getElementById('dqa-t1-name').value;
    if (!t1Name) { alert("Tier 1 Name is required."); return; }

    const type = document.getElementById('dqa-type').value;
    const isService = document.getElementById('dqa-svc').checked;
    const btn = document.getElementById('btn-drawer-quick-add');
    btn.innerHTML = 'Saving...'; btn.disabled = true;

    const tiers = [];
    
    if (document.getElementById('dqa-t3-en').checked) {
        tiers.push({
            level: 3, name: document.getElementById('dqa-t3-name').value,
            type, is_service: isService, tier_level: 3,
            buying_price: parseFloat(document.getElementById('dqa-t3-cp').value||0),
            selling_price: parseFloat(document.getElementById('dqa-t3-sp').value||0),
            stock_quantity: parseInt(document.getElementById('dqa-t3-stock').value||0),
            units_per_parent: 1, _my_units: parseInt(document.getElementById('dqa-t3-units').value||1),
            _linked_product: drawerLinkedTiers[3]
        });
    }
    if (document.getElementById('dqa-t2-en').checked) {
        tiers.push({
            level: 2, name: document.getElementById('dqa-t2-name').value,
            type, is_service: isService, tier_level: 2,
            buying_price: parseFloat(document.getElementById('dqa-t2-cp').value||0),
            selling_price: parseFloat(document.getElementById('dqa-t2-sp').value||0),
            stock_quantity: parseInt(document.getElementById('dqa-t2-stock').value||0),
            _my_units: parseInt(document.getElementById('dqa-t2-units').value||1),
            _linked_product: drawerLinkedTiers[2]
        });
    }
    tiers.push({
        level: 1, name: t1Name,
        type, is_service: isService, tier_level: 1,
        buying_price: parseFloat(document.getElementById('dqa-t1-cp').value||0),
        selling_price: parseFloat(document.getElementById('dqa-t1-sp').value||0),
        stock_quantity: parseInt(document.getElementById('dqa-t1-stock').value||0),
        _linked_product: drawerLinkedTiers[1]
    });

    let lastParentId = null;
    try {
        for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            const payload = {
                name: t.name, type: t.type, is_service: t.is_service,
                tier_level: t.tier_level, buying_price: t.buying_price,
                selling_price: t.selling_price, stock_quantity: t.stock_quantity,
                parent_id: lastParentId
            };
            if (i > 0) payload.units_per_parent = tiers[i-1]._my_units || 1;
            else payload.units_per_parent = 1;

            if (t._linked_product) {
                const { error } = await supabase.from('inventory').update({
                    parent_id: payload.parent_id,
                    units_per_parent: payload.units_per_parent,
                    name: payload.name,
                    buying_price: payload.buying_price,
                    selling_price: payload.selling_price,
                    stock_quantity: payload.stock_quantity
                }).eq('id', t._linked_product.id);
                if (error) throw new Error("Error linking tier " + t.level + ": " + error.message);
                lastParentId = t._linked_product.id;
                
                // Update local cache
                const idx = inventory.findIndex(inv => inv.id === t._linked_product.id);
                if(idx >= 0) inventory[idx] = { ...inventory[idx], ...payload };
            } else {
                const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
                if (error) throw new Error("Error saving tier " + t.level + ": " + error.message);
                lastParentId = data.id;
                inventory.push(data);
            }
        }

        // Reset form
        document.querySelectorAll('#drawer-quick-add-form input[type="text"]').forEach(el => el.value = '');
        document.querySelectorAll('#drawer-quick-add-form input[type="number"]').forEach(el => el.value = '0');
        document.querySelectorAll('#drawer-quick-add-form input[type="checkbox"]').forEach(el => { el.checked = false; el.dispatchEvent(new Event('change')); });
        document.getElementById('dqa-t2-units').value = '1';
        document.getElementById('dqa-t3-units').value = '1';
        
        drawerLinkedTiers = { 1: null, 2: null, 3: null };
        document.getElementById('dqa-linked-badge-1').classList.add('hidden');
        document.getElementById('dqa-linked-badge-2').classList.add('hidden');
        document.getElementById('dqa-linked-badge-3').classList.add('hidden');

        alert('Products created/linked successfully!');
        
        // Re-render UI pieces dependent on inventory
        inventory.sort((a,b) => a.name.localeCompare(b.name));
        renderQuickAddButtons();
        
        // Close drawer
        document.getElementById('btn-close-drawer').click();

    } catch (err) {
        alert(err.message);
    } finally {
        btn.innerHTML = 'Save Product'; btn.disabled = false;
    }
});

// Sync debt customer dropdown with pos-customer dropdown
const debtSaleCustEl = document.getElementById('debt-sale-customer-select');
const posCustEl = document.getElementById('pos-customer');
if (debtSaleCustEl && posCustEl) {
    debtSaleCustEl.addEventListener('change', () => {
        if (debtSaleCustEl.value) posCustEl.value = debtSaleCustEl.value;
    });
    posCustEl.addEventListener('change', () => {
        if (posCustEl.value && isDebtMode) debtSaleCustEl.value = posCustEl.value;
    });
}
