import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';
requireAuth();
if (currentUser.role !== 'admin') window.location.href = '/pos.html';

let inventoryItems = [];

async function load() {
    const d = new Date(), ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const periodStr = document.getElementById('admin-period').value;
    let dateFilter = periodStr === 'month' ? ym : d.toISOString().split('T')[0];
    
    // Header Totals
    let sQuery = supabase.from('sales_log').select('*').eq('is_voided', false);
    if(periodStr === 'month') sQuery = sQuery.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    else sQuery = sQuery.gte('timestamp', `${dateFilter}T00:00:00Z`);
    
    const {data:s} = await sQuery;
    let gr=0, kyo=0; (s||[]).forEach(x=> { gr += x.total_charged; kyo += (x.kyocera_pages||0); });
    document.getElementById('hdr-gross').innerText = `KSh ${gr.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Fetch Overheads
    const {data:o} = await supabase.from('overhead_entries').select('*').eq('period', ym).maybeSingle();
    let ovTotal = 0;
    if(o) { 
        ovTotal = (o.rent||0) + (o.electricity||0) + (o.wifi_internet||0) + (o.other_fixed||0);
        document.getElementById('ov-rent').value = o.rent || ''; 
        document.getElementById('ov-elec').value = o.electricity || '';
        document.getElementById('ov-wifi').value = o.wifi_internet || '';
        document.getElementById('ov-other').value = o.other_fixed || '';
    }
    
    // Fetch Wages
    const {data:w} = await supabase.from('attendance_log').select('*').like('work_date', `${ym}%`);
    let wageTotal = 0; (w||[]).forEach(x => wageTotal += parseFloat(x.wage_assigned||0));

    const expenses = ovTotal + wageTotal + (kyo * 2.5);
    document.getElementById('hdr-expenses').innerText = `KSh ${expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('hdr-net').innerText = `KSh ${(gr - expenses).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    // Resources Tab (Active)
    const {data:r} = await supabase.from('resources').select('*').order('opened_at', { ascending: false });
    const rt = document.getElementById('res-tbody'); rt.innerHTML = '';
    const activeResources = (r || []).filter(x => x.status === 'active');
    
    if (activeResources.length === 0) {
        rt.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs font-semibold">No active opened resources currently.</td></tr>`;
    } else {
        activeResources.forEach(x => {
            const dateStr = x.opened_at ? new Date(x.opened_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
            const nameSafe = (x.name || 'Resource').replace(/'/g, "\\'");
            const costVal = parseFloat(x.cost || 0);

            rt.innerHTML += `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="py-3 px-4 font-bold text-slate-900">${x.name} <span class="text-xs text-slate-400 font-normal">(${x.units} units)</span></td>
                    <td class="py-3 px-4 text-right font-black text-blue-700">KSh ${costVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="py-3 px-4 text-xs text-slate-500">${dateStr}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">
                        <button onclick="editResourceCost('${x.id}', '${nameSafe}', ${costVal})" class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold mr-1 transition">
                            ✏️ Edit Cost
                        </button>
                        <button onclick="exhaust('${x.id}')" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold transition">
                            Exhaust
                        </button>
                    </td>
                </tr>`;
        });
    }

    // Populate Inventory Data
    const {data:inv} = await supabase.from('inventory').select('*').eq('is_service', false).order('name');
    inventoryItems = inv || [];

    // Wages Tab (Current month cashier shift summary)
    const {data: ws} = await supabase.from('sales_log').select('cashier_id, timestamp, users:users!sales_log_cashier_id_fkey(username)').gte('timestamp', `${ym}-01T00:00:00Z`);
    const shifts = {};
    (ws||[]).forEach(x => {
        const date = x.timestamp.split('T')[0];
        const key = `${date}_${x.cashier_id}`;
        if(!shifts[key]) shifts[key] = { date, userId: x.cashier_id, user: x.users?.username, count: 0 };
        shifts[key].count++;
    });
    const wageMap = {}; 
    (w||[]).forEach(x => {
        wageMap[`${x.work_date}_${x.user_id}`] = x.wage_assigned;
        const key = `${x.work_date}_${x.user_id}`;
        if (!shifts[key]) {
            shifts[key] = { date: x.work_date, userId: x.user_id, user: 'Unknown (Logged)', count: 0 };
        }
    });

    // Map user IDs to names
    const {data: allUsers} = await supabase.from('users').select('id, username');
    const userDict = {};
    (allUsers||[]).forEach(u => userDict[u.id] = u.username);
    Object.values(shifts).forEach(sh => {
        if (sh.user === 'Unknown (Logged)' || !sh.user) {
            sh.user = userDict[sh.userId] || 'Staff';
        }
    });

    const wt = document.getElementById('wage-tbody'); wt.innerHTML = '';
    const sortedShifts = Object.values(shifts).sort((a,b)=>b.date.localeCompare(a.date));
    
    if (sortedShifts.length === 0) {
        wt.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs font-semibold">No cashier shifts or wages recorded for this month.</td></tr>`;
    } else {
        sortedShifts.forEach(sh => {
            const wage = wageMap[`${sh.date}_${sh.userId}`] || 0;
            wt.innerHTML += `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="py-3 px-4 font-bold text-slate-800">${sh.date}</td>
                    <td class="py-3 px-4 font-semibold text-slate-900">${sh.user}</td>
                    <td class="py-3 px-4 text-right font-black text-emerald-700">KSh ${parseFloat(wage).toFixed(2)}</td>
                    <td class="py-3 px-4 text-center">
                        <button onclick="openWageModal('${sh.userId}', '${sh.date}', '${sh.user}', ${wage})" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg font-bold text-xs transition">
                            Set / Adjust Wage
                        </button>
                    </td>
                </tr>`;
        });
    }
}

function calcResCost() {
    const id = document.getElementById('res-item-id').value;
    const qty = parseInt(document.getElementById('res-qty').value || 1);
    const item = inventoryItems.find(i => i.id === id);
    if(item && item.buying_price > 0) {
        document.getElementById('res-cost').value = (item.buying_price * qty).toFixed(2);
    }
}

document.getElementById('res-item-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const resDiv = document.getElementById('res-search-results');
    document.getElementById('res-item-id').value = '';
    
    if(!term) {
        resDiv.classList.add('hidden');
        return;
    }
    
    const matches = inventoryItems.filter(i => i.name.toLowerCase().includes(term));
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-2 text-sm text-gray-500">No items found</div>';
    } else {
        resDiv.innerHTML = matches.map(i => `<div class="p-2.5 text-sm cursor-pointer hover:bg-blue-50 border-b last:border-0" onclick="selectResItem('${i.id}', '${i.name.replace(/'/g, "\\'")}', ${i.buying_price || 0})"><div class="font-bold text-slate-900">${i.name}</div><div class="text-xs text-slate-400">Stock: ${i.stock_quantity} | Cost: Ksh ${i.buying_price || 0}</div></div>`).join('');
    }
    resDiv.classList.remove('hidden');
});

window.selectResItem = (id, name, bp) => {
    document.getElementById('res-item-id').value = id;
    document.getElementById('res-item-search').value = name;
    document.getElementById('res-search-results').classList.add('hidden');
    const qty = parseInt(document.getElementById('res-qty').value || 1);
    if (bp > 0) {
        document.getElementById('res-cost').value = (bp * qty).toFixed(2);
    } else {
        document.getElementById('res-cost').value = '';
        document.getElementById('res-cost').focus();
    }
};

document.addEventListener('click', (e) => {
    if(!e.target.closest('#res-item-search') && !e.target.closest('#res-search-results')) {
        const res = document.getElementById('res-search-results');
        if(res) res.classList.add('hidden');
    }
});

document.getElementById('res-qty').addEventListener('input', calcResCost);
document.getElementById('admin-period').addEventListener('change', load);

document.getElementById('btn-open-res').addEventListener('click', async () => {
    const itemId = document.getElementById('res-item-id').value;
    const qty = parseInt(document.getElementById('res-qty').value || 1);
    const item = inventoryItems.find(i => i.id === itemId);
    
    if(!item || qty < 1) return alert('Select a valid item and enter quantity.');
    
    let cost = parseFloat(document.getElementById('res-cost').value || 0);
    if (cost <= 0) {
        cost = (item.buying_price || 0) * qty;
    }
    if (cost <= 0) {
        const entered = prompt(`Item "${item.name}" has no cost recorded. Enter the expense cost (Ksh) to keep profit accurate:`, "600");
        if (!entered || isNaN(parseFloat(entered)) || parseFloat(entered) <= 0) {
            return alert('Opening cancelled: A valid cost value greater than zero is required.');
        }
        cost = parseFloat(entered);
    }

    const name = item.name;

    showModal('Open Consumable Resource', `
        <p class="text-slate-800">Open <strong>${qty}x ${name}</strong> for use in cyber jobs?</p>
        <p class="text-xs text-slate-500 mt-2">This will record <strong>Ksh ${cost.toFixed(2)}</strong> in expenses and deduct <strong>${qty}</strong> from inventory stock.</p>
    `, async (close) => {
        // 1. Insert into resources with active status
        const { error: rErr } = await supabase.from('resources').insert([{
            name, 
            units: qty, 
            cost, 
            status: 'active',
            opened_at: new Date().toISOString(),
            opened_by: currentUser.id
        }]);
        if (rErr) throw rErr;

        // 2. Deduct from inventory
        const newStock = Math.max(0, (item.stock_quantity || 0) - qty);
        await supabase.from('inventory').update({stock_quantity: newStock}).eq('id', item.id);
        
        document.getElementById('res-item-search').value = '';
        document.getElementById('res-item-id').value = '';
        document.getElementById('res-qty').value = 1;
        document.getElementById('res-cost').value = '';
        close();
        load();
    }, 'Confirm & Open');
});

window.editResourceCost = (id, name, currentCost) => {
    showModal(`Adjust Cost for ${name}`, `
        <div class="space-y-3">
            <p class="text-xs text-slate-500">Correct any mistaken or missing cost for this consumable to fix profit calculations:</p>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Expense Cost (KSh)</label>
                <input type="number" id="edit-res-cost-input" step="any" min="0" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 font-black text-lg text-slate-900 focus:outline-none focus:border-blue-500" value="${currentCost}">
            </div>
        </div>
    `, async (close) => {
        const newCost = parseFloat(document.getElementById('edit-res-cost-input').value || 0);
        if (newCost < 0) throw new Error("Cost cannot be negative");

        const { error } = await supabase.from('resources').update({ cost: newCost }).eq('id', id);
        if (error) throw error;
        close();
        load();
    }, 'Update Cost');
};

document.getElementById('btn-save-ov').addEventListener('click', async () => {
    const d = new Date(), ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const rent = parseFloat(document.getElementById('ov-rent').value||0);
    const elec = parseFloat(document.getElementById('ov-elec').value||0);
    const wifi = parseFloat(document.getElementById('ov-wifi').value||0);
    const other = parseFloat(document.getElementById('ov-other').value||0);
    await supabase.from('overhead_entries').upsert({period: ym, rent, electricity: elec, wifi_internet: wifi, other_fixed: other, entered_by: currentUser.id}, {onConflict: 'period'});
    showModal('Success', '<p class="text-emerald-600 font-bold">Monthly fixed overheads successfully saved!</p>', (close) => close(), 'OK');
    load();
});

window.exhaust = (id) => {
    showModal('Exhaust Resource', '<p class="text-slate-600">Mark this consumable as fully used / exhausted?</p>', async (close) => {
        await supabase.from('resources').update({status:'exhausted'}).eq('id',id);
        close(); load();
    }, 'Mark Exhausted');
};

window.openWageModal = (userId, date, username, currentWage) => {
    showModal(
        `Set Wage for ${username}`, 
        `
        <div class="space-y-3">
            <div class="text-xs text-slate-500 font-bold">Work Date: <span class="text-slate-800">${date}</span></div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Daily Cashier Wage (KSh)</label>
                <input type="number" id="modal-wage-input" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-black text-lg text-slate-900 focus:outline-none focus:border-emerald-500" value="${currentWage}">
            </div>
        </div>
        `,
        async (close) => {
            const val = parseFloat(document.getElementById('modal-wage-input').value || 0);
            await supabase.from('attendance_log').upsert({user_id: userId, work_date: date, wage_assigned: val}, {onConflict: 'user_id, work_date'});
            
            // Also mirror to expenses
            const desc = `Wage - ${username}`;
            await supabase.from('expenses').insert([{
                description: desc,
                amount: val,
                timestamp: new Date().toISOString()
            }]);

            close(); load();
        },
        'Save Wage'
    );
};

load();
