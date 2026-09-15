const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

const newFeatures = `

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
        \`<div class="p-2 text-sm cursor-pointer hover:bg-purple-50 border-b"
              onclick="selectQRes('\${i.id}', '\${i.name.replace(/'/g, "\\\\'")}', \${i.buying_price || 0})">
            <div class="font-bold">\${i.name}</div>
            <div class="text-xs text-gray-400">Stock: \${i.stock_quantity} | BP: Ksh \${i.buying_price || 0}</div>
         </div>\`
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
`;

code += newFeatures;
fs.writeFileSync('public/js/pos.js', code);
console.log('Added ledger toggle, expense logger, and quick resource opener to pos.js');
