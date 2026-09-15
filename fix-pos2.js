const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');
code = code.replace(/<option value="\$\{c.id\}">\$\{c.name\}<\/option>/g, '`<option value="${c.id}">${c.name}</option>`');
fs.writeFileSync('public/js/pos.js', code);
console.log('Fixed for real.');
