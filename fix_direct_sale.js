const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

// Fix the direct sale payment_method — it reads e.target.innerText after it was changed to 'Processing...'
// Replace the broken payment_method line with one that reads the button ID reliably
const oldLine = `payment_method: e.target.innerText.replace('Processing...', e.target.id.includes('mpesa') ? 'M-Pesa' : 'Cash'),`;
const newLine = `payment_method: e.target.id.includes('mpesa') ? 'mpesa' : 'cash',`;

if (code.includes(oldLine)) {
    code = code.replace(oldLine, newLine);
    console.log('Fixed direct sale payment_method!');
} else {
    console.log('ERROR: Could not find target line. Searching...');
    const idx = code.indexOf("e.target.innerText.replace('Processing...'");
    if (idx > -1) {
        const lineStart = code.lastIndexOf('\n', idx) + 1;
        const lineEnd = code.indexOf('\n', idx);
        console.log('Found at:', code.slice(lineStart, lineEnd));
    }
}

fs.writeFileSync('public/js/pos.js', code);
console.log('Done.');
