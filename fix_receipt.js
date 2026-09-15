const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

// Fix processReceipt to include payment_method and correct calculated_profit
const oldLogs = `const logs = docCart.map(i => ({
              item_id: i.id,
              total_charged: i.total,
              calculated_qty: i.qty,
              calculated_profit: i.total - (i.buying_price * i.qty),
              cashier_id: currentUser.id,
              kyocera_pages: i.kyocera_pages
          }));`;

const newLogs = `const pmMethod = paymentMethod.toLowerCase().replace('-', '').replace(' ', '');
          const logs = docCart.map(i => ({
              item_id: i.id,
              total_charged: i.total,
              calculated_qty: i.qty,
              calculated_profit: i.total - ((i.buying_price || 0) * i.qty),
              cashier_id: currentUser.id,
              kyocera_pages: i.kyocera_pages || 0,
              payment_method: pmMethod
          }));`;

if (code.includes('const logs = docCart.map(i => ({')) {
    code = code.replace(oldLogs, newLogs);
    console.log('Fixed processReceipt logs - added payment_method!');
} else {
    // Try a looser match
    const idx = code.indexOf('const logs = docCart.map');
    if (idx > -1) {
        // Find end of the block
        let depth = 0, end = idx, started = false;
        for (let i = idx; i < code.length; i++) {
            if (code[i] === '(') { depth++; started = true; }
            if (code[i] === ')') { depth--; }
            if (started && depth === 0) { end = i + 2; break; }
        }
        const original = code.slice(idx, end);
        console.log('Original logs block found:', original.substring(0, 100));
        code = code.slice(0, idx) + newLogs + code.slice(end);
        console.log('Replaced via fallback method!');
    } else {
        console.log('ERROR: Could not find logs block!');
    }
}

fs.writeFileSync('public/js/pos.js', code);
console.log('Done.');
