const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

// Remove the old renderLedger + voidSale
const oldRender = `function renderLedger() {
    let m = 0, c = 0; const tbody = document.getElementById('sales-tbody'); tbody.innerHTML = '';
    todaysSales.forEach(s => {
        if(s.payment_method === 'mpesa') m += s.total_charged; else c += s.total_charged;
        tbody.innerHTML += \`<tr><td class="py-2 px-4">\${new Date(s.timestamp).toLocaleTimeString()}</td><td class="py-2 px-4">\${s.inventory?.name}</td><td class="py-2 px-4 text-center">\${s.calculated_qty}</td><td class="py-2 px-4 text-right">\${s.total_charged.toFixed(2)}</td><td class="py-2 px-4 text-right">\${s.payment_method}</td><td class="py-2 px-4 text-center"><button onclick="voidSale('\${s.id}')" class="text-red-500 hover:text-red-700 font-bold" title="Void Sale">&times;</button></td></tr>\`;
    });
    document.getElementById('lbl-mpesa').innerText = \`Ksh \${m.toFixed(2)}\`; document.getElementById('lbl-cash').innerText = \`Ksh \${c.toFixed(2)}\`;
}`;

const newRender = `function renderLedger() {
    let m = 0, c = 0;
    const tbody = document.getElementById('sales-tbody');
    tbody.innerHTML = '';

    // Group by item name + payment method
    const groups = {};
    todaysSales.forEach(s => {
        const key = (s.inventory?.name || 'Unknown') + '||' + s.payment_method;
        if (!groups[key]) {
            groups[key] = {
                name: s.inventory?.name || 'Unknown',
                method: s.payment_method,
                totalQty: 0,
                totalAmount: 0,
                entries: []
            };
        }
        groups[key].totalQty += (s.calculated_qty || 0);
        groups[key].totalAmount += (s.total_charged || 0);
        groups[key].entries.push(s);

        if (s.payment_method === 'mpesa') m += s.total_charged;
        else c += s.total_charged;
    });

    Object.entries(groups).forEach(([key, grp], idx) => {
        const methodBadge = grp.method === 'mpesa'
            ? '<span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">M-Pesa</span>'
            : '<span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Cash</span>';

        const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_') + '_' + idx;

        // Summary (grouped) row
        tbody.innerHTML += \`
        <tr class="hover:bg-gray-50 cursor-pointer border-b" onclick="toggleLedgerGroup('\${safeKey}')">
            <td class="py-2 px-4 font-semibold text-slate-800">\${grp.name}</td>
            <td class="py-2 px-4 text-center text-slate-600">\${grp.totalQty}</td>
            <td class="py-2 px-4 text-right font-bold">Ksh \${grp.totalAmount.toFixed(2)}</td>
            <td class="py-2 px-4 text-center">\${methodBadge}</td>
            <td class="py-2 px-4 text-center">
                <span class="text-xs text-blue-500 font-bold select-none">▶ Edit</span>
            </td>
        </tr>
        <tr id="grp-\${safeKey}" class="hidden bg-slate-50">
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
                        \${grp.entries.map(e => \`
                        <tr class="border-t border-slate-100 hover:bg-red-50" id="entry-row-\${e.id}">
                            <td class="py-1.5 px-6 text-slate-500">\${new Date(e.timestamp).toLocaleTimeString()}</td>
                            <td class="py-1.5 px-4 text-center">\${e.calculated_qty}</td>
                            <td class="py-1.5 px-4 text-right font-semibold">Ksh \${e.total_charged.toFixed(2)}</td>
                            <td class="py-1.5 px-4 text-center">\${e.payment_method}</td>
                            <td class="py-1.5 px-4 text-center">
                                <button onclick="voidSale('\${e.id}')" class="text-red-500 hover:text-red-700 font-bold text-base leading-none" title="Void this entry">&times;</button>
                            </td>
                        </tr>
                        \`).join('')}
                    </tbody>
                </table>
            </td>
        </tr>\`;
    });

    document.getElementById('lbl-mpesa').innerText = \`Ksh \${m.toFixed(2)}\`;
    document.getElementById('lbl-cash').innerText = \`Ksh \${c.toFixed(2)}\`;
}

window.toggleLedgerGroup = (key) => {
    const row = document.getElementById(\`grp-\${key}\`);
    if (!row) return;
    row.classList.toggle('hidden');
    // Rotate arrow on the toggle button
    const parentRow = row.previousElementSibling;
    const arrow = parentRow ? parentRow.querySelector('span.select-none') : null;
    if (arrow) {
        arrow.textContent = row.classList.contains('hidden') ? '▶ Edit' : '▼ Close';
    }
};`;

if (code.includes('function renderLedger()')) {
    // Find and replace the renderLedger block
    const start = code.indexOf('function renderLedger()');
    // Find the closing brace
    let depth = 0;
    let end = start;
    let found = false;
    for (let i = start; i < code.length; i++) {
        if (code[i] === '{') depth++;
        if (code[i] === '}') {
            depth--;
            if (depth === 0) { end = i + 1; found = true; break; }
        }
    }
    if (found) {
        code = code.slice(0, start) + newRender + code.slice(end);
        console.log('Successfully replaced renderLedger!');
    } else {
        console.log('Could not find end of renderLedger - appending');
        code += '\n' + newRender;
    }
} else {
    code += '\n' + newRender;
}

// Remove old voidSale if it exists and re-add cleanly
if (code.includes('window.voidSale =')) {
    const vStart = code.indexOf('window.voidSale =');
    let depth = 0, vEnd = vStart, inFn = false;
    for (let i = vStart; i < code.length; i++) {
        if (code[i] === '{') { depth++; inFn = true; }
        if (code[i] === '}') {
            depth--;
            if (inFn && depth === 0) { vEnd = i + 2; break; }
        }
    }
    code = code.slice(0, vStart) + code.slice(vEnd);
}

code += `
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
`;

fs.writeFileSync('public/js/pos.js', code);
console.log('Done!');
