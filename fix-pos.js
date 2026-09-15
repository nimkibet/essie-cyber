const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

const regex = /csel\.innerHTML \+\= <option value="\$\{c\.id\}">\$\{c\.name\}<\/option>;/g;
code = code.replace(regex, 'csel.innerHTML += `<option value="${c.id}">${c.name}</option>`;');

fs.writeFileSync('public/js/pos.js', code);
console.log('Fixed syntax error in pos.js');
