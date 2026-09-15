import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
let inventory = [], customers = [], todaysSales = [];
let activeQuick = "Print / Copy", quickPay = "M-Pesa", mainPay = "M-Pesa";

async function loadData() {
    const {data:inv} = await supabase.from('inventory').select('*').order('name'); const {data:cust} = await supabase.from('customers').select('*').order('name');
    inventory = inv || []; customers = cust || []; console.log('DEBUG: Loaded inventory length:', inventory.length);
    
        const csel = document.getElementById('pos-customer'); csel.innerHTML = '<option value="">Walk-in</option>';
    customers.forEach(c => csel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    
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
    }).subscribe();

    await fetchTodaysSales();
}

async function fetchTodaysSales() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('sales_log').select('*, inventory(name)').gte('timestamp', `${today}T00:00:00Z`).eq('is_voided', false).order('timestamp', { ascending: false });
    todaysSales = data || []; renderLedger();
}

function renderLedger() {
    let m = 0, c = 0;
    const tbody = document.getElementById('sales-tbody');
    tbody.innerHTML = '';

    // Group by item name + payment method
    const groups = {};
    todaysSales.forEach(s => {
        const key = (s.inventory?.name || 'Unknown');
        if (!groups[key]) {
            groups[key] = {
                name: s.inventory?.name || 'Unknown',
                totalQty: 0,
                totalAmount: 0,
                mpesaAmount: 0,
                cashAmount: 0,
                entries: []
            };
        }
        groups[key].totalQty += (s.calculated_qty || 0);
        groups[key].totalAmount += (s.total_charged || 0);
        if (s.payment_method === 'mpesa') { groups[key].mpesaAmount += s.total_charged; m += s.total_charged; }
        else { groups[key].cashAmount += s.total_charged; c += s.total_charged; }
        groups[key].entries.push(s);
    });

    Object.entries(groups).forEach(([key, grp], idx) => {
        let methodBadge = '';
        if (grp.mpesaAmount > 0) methodBadge += '<span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mr-1">M-Pesa ' + grp.mpesaAmount.toFixed(0) + '</span>';
        if (grp.cashAmount > 0) methodBadge += '<span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Cash ' + grp.cashAmount.toFixed(0) + '</span>';

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
                            <td class="py-1.5 px-6 text-slate-500">${new Date(e.timestamp).toLocaleTimeString()}</td>
                            <td class="py-1.5 px-4 text-center">${e.calculated_qty}</td>
                            <td class="py-1.5 px-4 text-right font-semibold">Ksh ${e.total_charged.toFixed(2)}</td>
                            <td class="py-1.5 px-4 text-center">${e.payment_method}</td>
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

    document.getElementById('lbl-mpesa').innerText = `Ksh ${m.toFixed(2)}`;
    document.getElementById('lbl-cash').innerText = `Ksh ${c.toFixed(2)}`;
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

document.querySelectorAll('.quick-srv-btn').forEach(b => b.addEventListener('click', e => { activeQuick = e.target.dataset.name; }));
document.getElementById('quick-pay-mpesa').addEventListener('click', () => quickPay = 'M-Pesa');
document.getElementById('quick-pay-cash').addEventListener('click', () => quickPay = 'Cash');

document.getElementById('quick-log-btn').addEventListener('click', async () => {
    const amt = parseFloat(document.getElementById('quick-amount').value); if(!amt) return;
    let item = inventory.find(i => i.name === activeQuick);
    if (!item) { const {data} = await supabase.from('inventory').insert([{name: activeQuick, type: 'variable', selling_price: 0, is_service: true}]).select().single(); item = data; inventory.push(item); }
    await supabase.from('sales_log').insert([{item_id: item.id, total_charged: amt, calculated_qty: 1, calculated_profit: amt, cashier_id: currentUser.id, payment_method: quickPay.toLowerCase().replace('-', '')}]);
    document.getElementById('quick-amount').value = ''; fetchTodaysSales();
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
        
        await supabase.from('sales_log').insert([{
            item_id: item.id, 
            total_charged: amt, 
            calculated_qty: qty, 
            calculated_profit: amt - (bc*qty), 
            cashier_id: currentUser.id, 
            payment_method: e.target.id.includes('mpesa') ? 'mpesa' : 'cash', 
            kyocera_pages: kyo
        }]);
        
        // Reset form
        document.getElementById('pos-item-search').value = '';
        document.getElementById('pos-item-id').value = '';
        document.getElementById('pos-total').value = '';
        document.getElementById('pos-qty').value = 1;
        fetchTodaysSales();
    } finally {
        e.target.innerText = e.target.id.includes('mpesa') ? 'M-Pesa' : 'Cash';
        e.target.disabled = false;
    }
}));


// --- Document Builder Logic ---
let isDocMode = false;
let docCart = [];

document.getElementById('mode-direct').addEventListener('click', () => {
    isDocMode = false;
    document.getElementById('mode-direct').className = "px-3 py-1 text-sm font-bold bg-white shadow-sm rounded-md text-blue-600 transition-all";
    document.getElementById('mode-doc').className = "px-3 py-1 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-md transition-all";
    document.getElementById('direct-actions').classList.remove('hidden');
    document.getElementById('doc-actions').classList.add('hidden');
    document.getElementById('doc-cart-panel').classList.add('hidden');
});

document.getElementById('mode-doc').addEventListener('click', () => {
    isDocMode = true;
    document.getElementById('mode-doc').className = "px-3 py-1 text-sm font-bold bg-white shadow-sm rounded-md text-blue-600 transition-all";
    document.getElementById('mode-direct').className = "px-3 py-1 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-md transition-all";
    document.getElementById('doc-actions').classList.remove('hidden');
    document.getElementById('direct-actions').classList.add('hidden');
    document.getElementById('doc-cart-panel').classList.remove('hidden');
});

function renderDocCart() {
    const tbody = document.getElementById('doc-cart-tbody');
    tbody.innerHTML = '';
    let total = 0;
    docCart.forEach((item, idx) => {
        total += item.total;
        tbody.innerHTML += `
            <tr class="hover:bg-gray-100">
                <td class="p-2">${item.name}</td>
                <td class="p-2 text-center">${item.qty}</td>
                <td class="p-2 text-right">Ksh ${item.total.toFixed(2)}</td>
                <td class="p-2 text-center text-red-500 cursor-pointer" onclick="removeDocItem(${idx})">&times;</td>
            </tr>
        `;
    });
    document.getElementById('doc-cart-total').innerText = `Ksh ${total.toFixed(2)}`;
}

window.removeDocItem = (idx) => {
    docCart.splice(idx, 1);
    renderDocCart();
};

document.getElementById('btn-add-to-doc').addEventListener('click', () => {
    const amt = parseFloat(document.getElementById('pos-total').value);
    const qty = parseInt(document.getElementById('pos-qty').value);
    const item = inventory.find(i => i.id === document.getElementById('pos-item-id').value);
    
    if(!item || !amt) return alert('Select an item and enter amount');
    
    let bc = item.buying_price || 0, kyo = 0;
    if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
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
    
    // Reset inputs
    document.getElementById('pos-item-search').value = '';
    document.getElementById('pos-item-id').value = '';
    document.getElementById('pos-total').value = '';
    document.getElementById('pos-qty').value = 1;
    document.getElementById('kyocera-fields').classList.add('hidden');
    
    renderDocCart();
});

document.getElementById('btn-clear-doc').addEventListener('click', () => {
    if(confirm('Clear document cart?')) { docCart = []; renderDocCart(); }
});

function generatePDF(type, paymentMethod = '') {
    if (docCart.length === 0) return alert('Document cart is empty.');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const custId = document.getElementById('pos-customer').value;
    const cust = customers.find(c => c.id === custId) || { name: 'Walk-in Customer' };
    
    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Essie Cyber", 14, 20);
    
    doc.setFontSize(14);
    doc.text(type === 'quote' ? 'QUOTATION' : 'RECEIPT', 170, 20, { align: 'right' });
    
    // Bill To
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text("Bill To:", 14, 45);
    doc.setFontSize(12);
    doc.text(cust.name, 14, 52);
    if(cust.phone) doc.text(`Phone: ${cust.phone}`, 14, 58);
    
    // Date & Ref
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 170, 45, { align: 'right' });
    doc.text(`Ref: ${Math.random().toString(36).substr(2, 6).toUpperCase()}`, 170, 52, { align: 'right' });
    if(paymentMethod) doc.text(`Paid via: ${paymentMethod}`, 170, 59, { align: 'right' });
    
    // Table
    const tableData = docCart.map(item => [
        item.name,
        item.qty,
        `Ksh ${item.price.toFixed(2)}`,
        `Ksh ${item.total.toFixed(2)}`
    ]);
    
    let sum = 0; docCart.forEach(i => sum += i.total);
    tableData.push(['', '', 'TOTAL', `Ksh ${sum.toFixed(2)}`]);
    
    doc.autoTable({
        startY: 70,
        head: [['Description', 'Qty', 'Unit Price', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { font: 'helvetica', fontSize: 10 },
        columnStyles: { 3: { fontStyle: 'bold' } },
        didParseCell: function (data) {
            if (data.row.index === tableData.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [240, 240, 240];
            }
        }
    });
    
    const finalY = doc.lastAutoTable.finalY || 80;
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("Thank you for your business!", 105, finalY + 20, { align: 'center' });
    
    doc.save(`${type === 'quote' ? 'Quotation' : 'Receipt'}_${cust.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
}

async function processReceipt(paymentMethod) {
    if (docCart.length === 0) return alert('Cart is empty.');
    
    // Disable buttons
    document.getElementById('btn-receipt-mpesa').disabled = true;
    document.getElementById('btn-receipt-cash').disabled = true;
    document.getElementById('btn-receipt-mpesa').innerText = 'Processing...';
    
    try {
        const logs = docCart.map(i => ({
            item_id: i.id,
            total_charged: i.total,
            calculated_qty: i.qty,
            calculated_profit: i.total - (i.buying_price * i.qty),
            cashier_id: currentUser.id,
            payment_method: paymentMethod.toLowerCase().replace('-', ''),
            kyocera_pages: i.kyocera_pages
        }));
        
        const { error } = await supabase.from('sales_log').insert(logs);
        if(error) throw error;
        
        generatePDF('receipt', paymentMethod);
        
        docCart = [];
        renderDocCart();
        fetchTodaysSales();
    } catch(err) {
        alert('Error logging receipt: ' + err.message);
    } finally {
        document.getElementById('btn-receipt-mpesa').disabled = false;
        document.getElementById('btn-receipt-cash').disabled = false;
        document.getElementById('btn-receipt-mpesa').innerText = 'Receipt (M-Pesa)';
    }
}

document.getElementById('btn-dl-quote').addEventListener('click', () => generatePDF('quote'));
document.getElementById('btn-receipt-mpesa').addEventListener('click', () => processReceipt('M-Pesa'));
document.getElementById('btn-receipt-cash').addEventListener('click', () => processReceipt('Cash'));

loadData();








window.voidSale = async (id) => {
    if (!confirm('Are you sure you want to void this entry?')) return;
    try {
        const { error } = await supabase.from('sales_log').update({
            is_voided: true,
            voided_by: currentUser.id
        }).eq('id', id);
        if (error) throw error;
        fetchTodaysSales();
    } catch(err) {
        alert('Error voiding sale: ' + err.message);
    }
};


// ─── LEDGER TOGGLE ────────────────────────────────────────────────────────────
let ledgerVisible = true;
document.getElementById('btn-toggle-ledger').addEventListener('click', () => {
    ledgerVisible = !ledgerVisible;
    const table = document.getElementById('ledger-table-wrap');
    const totals = document.getElementById('ledger-totals');
    const icon = document.getElementById('ledger-toggle-icon');
    const label = document.getElementById('ledger-toggle-label');
    if (ledgerVisible) {
        table.classList.remove('hidden');
        totals.classList.remove('hidden');
        icon.textContent = '👁';
        label.textContent = 'Hide';
    } else {
        table.classList.add('hidden');
        totals.classList.add('hidden');
        icon.textContent = '🚫';
        label.textContent = 'Show';
    }
});

// ─── QUICK EXPENSE LOGGER ─────────────────────────────────────────────────────
document.getElementById('btn-log-expense').addEventListener('click', async () => {
    const desc = document.getElementById('exp-desc').value.trim();
    const amt = parseFloat(document.getElementById('exp-amount').value);
    if (!desc || !amt) return alert('Enter description and amount.');
    const btn = document.getElementById('btn-log-expense');
    btn.disabled = true; btn.textContent = 'Logging...';
    try {
        const { error } = await supabase.from('overhead_entries').insert([{
            period: new Date().toISOString().slice(0, 7),
            other_fixed: amt,
            note: desc,
            rent: 0, electricity: 0, wifi_internet: 0
        }]);
        if (error) throw error;
        document.getElementById('exp-desc').value = '';
        document.getElementById('exp-amount').value = '';
        alert('Expense logged: ' + desc + ' - Ksh ' + amt);
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
        `<div class="p-2 text-sm cursor-pointer hover:bg-purple-50 border-b"
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
    document.getElementById('qres-cost').value = bp;
    qresResults.classList.add('hidden');
};

document.addEventListener('click', e => {
    if (!e.target.closest('#qres-search') && !e.target.closest('#qres-results')) {
        qresResults.classList.add('hidden');
    }
});

document.getElementById('btn-open-resource').addEventListener('click', async () => {
    const itemId = document.getElementById('qres-item-id').value;
    const qty = parseInt(document.getElementById('qres-qty').value || 1);
    const cost = parseFloat(document.getElementById('qres-cost').value || 0);
    const name = document.getElementById('qres-search').value;
    if (!itemId || qty < 1) return alert('Select an item and enter quantity.');
    const btn = document.getElementById('btn-open-resource');
    btn.disabled = true; btn.textContent = 'Opening...';
    try {
        const { error } = await supabase.from('resources').insert([{
            item_id: itemId,
            name: name,
            units: qty,
            cost: cost * qty,
            status: 'active',
            opened_at: new Date().toISOString()
        }]);
        if (error) throw error;
        document.getElementById('qres-search').value = '';
        document.getElementById('qres-item-id').value = '';
        document.getElementById('qres-qty').value = 1;
        document.getElementById('qres-cost').value = '';
        alert('Resource opened: ' + name + ' x' + qty);
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Open Resource';
    }
});
