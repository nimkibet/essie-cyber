const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

// Find and replace the grouping key line only
code = code.replace(
    "const key = (s.inventory?.name || 'Unknown') + '||' + s.payment_method;",
    "const key = (s.inventory?.name || 'Unknown');"
);

// Update the group structure to track per-method totals separately but in one group
code = code.replace(
    `if (!groups[key]) {
            groups[key] = {
                name: s.inventory?.name || 'Unknown',
                method: s.payment_method,
                totalQty: 0,
                totalAmount: 0,
                entries: []
            };
        }`,
    `if (!groups[key]) {
            groups[key] = {
                name: s.inventory?.name || 'Unknown',
                totalQty: 0,
                totalAmount: 0,
                mpesaAmount: 0,
                cashAmount: 0,
                entries: []
            };
        }`
);

// Add per-method accumulation inside the forEach
code = code.replace(
    `groups[key].totalQty += (s.calculated_qty || 0);
        groups[key].totalAmount += (s.total_charged || 0);
        groups[key].entries.push(s);

        if (s.payment_method === 'mpesa') m += s.total_charged;
        else c += s.total_charged;`,
    `groups[key].totalQty += (s.calculated_qty || 0);
        groups[key].totalAmount += (s.total_charged || 0);
        if (s.payment_method === 'mpesa') { groups[key].mpesaAmount += s.total_charged; m += s.total_charged; }
        else { groups[key].cashAmount += s.total_charged; c += s.total_charged; }
        groups[key].entries.push(s);`
);

// Update the method badge to show both if mixed
code = code.replace(
    `const methodBadge = grp.method === 'mpesa'
            ? '<span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">M-Pesa</span>'
            : '<span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Cash</span>';`,
    `let methodBadge = '';
        if (grp.mpesaAmount > 0) methodBadge += '<span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mr-1">M-Pesa ' + grp.mpesaAmount.toFixed(0) + '</span>';
        if (grp.cashAmount > 0) methodBadge += '<span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Cash ' + grp.cashAmount.toFixed(0) + '</span>';`
);

fs.writeFileSync('public/js/pos.js', code);
console.log('Done - ledger now groups by item only, shows both payment method totals.');
