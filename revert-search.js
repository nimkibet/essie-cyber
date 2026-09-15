const fs = require('fs');

// POS.JS
let posCode = fs.readFileSync('public/js/pos.js', 'utf8');
posCode = posCode.replace(/let posSearchTimeout;[\s\S]*?resDiv\.classList\.remove\('hidden'\);\s*\}, 250\);\s*\}\);/, `// POS Live Search Autocomplete
document.getElementById('pos-item-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const resDiv = document.getElementById('pos-search-results');
    document.getElementById('pos-item-id').value = ''; 
    document.getElementById('pos-total').value = '';
    document.getElementById('kyocera-fields').classList.add('hidden');
    
    if(!term) {
        resDiv.classList.add('hidden');
        return;
    }
    
    const matches = inventory.filter(i => i.name.toLowerCase().includes(term));
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-3 text-sm text-gray-500 font-medium">No items match search</div>';
    } else {
        resDiv.innerHTML = matches.map(i => \`<div class="p-3 text-sm cursor-pointer hover:bg-blue-50 border-b flex justify-between items-center transition-colors" onclick="selectPosItem('\${i.id}', '\${i.name.replace(/'/g, "\\\\'")}', \${i.selling_price})"><div class="font-bold text-gray-800">\${i.name}</div><div class="font-bold text-blue-600">Ksh \${i.selling_price}</div></div>\`).join('');
    }
    resDiv.classList.remove('hidden');
});`);
// If the above replace didn't match, try matching the specific block
if(posCode.includes('Searching database...')) {
    const startIdx = posCode.indexOf('// POS Live Search Autocomplete (Server-side)');
    const endIdx = posCode.indexOf('window.selectPosItem');
    if(startIdx !== -1 && endIdx !== -1) {
        const replaceBlock = `document.getElementById('pos-item-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const resDiv = document.getElementById('pos-search-results');
    document.getElementById('pos-item-id').value = ''; 
    document.getElementById('pos-total').value = '';
    document.getElementById('kyocera-fields').classList.add('hidden');
    
    if(!term) {
        resDiv.classList.add('hidden');
        return;
    }
    
    const matches = inventory.filter(i => i.name.toLowerCase().includes(term));
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-3 text-sm text-gray-500 font-medium">No items match search</div>';
    } else {
        resDiv.innerHTML = matches.map(i => \`<div class="p-3 text-sm cursor-pointer hover:bg-blue-50 border-b flex justify-between items-center transition-colors" onclick="selectPosItem('\${i.id}', '\${i.name.replace(/'/g, "\\\\'")}', \${i.selling_price})"><div class="font-bold text-gray-800">\${i.name}</div><div class="font-bold text-blue-600">Ksh \${i.selling_price}</div></div>\`).join('');
    }
    resDiv.classList.remove('hidden');
});\n\n`;
        posCode = posCode.substring(0, startIdx) + replaceBlock + posCode.substring(endIdx);
    }
}
fs.writeFileSync('public/js/pos.js', posCode);

// ADMIN.JS
let adminCode = fs.readFileSync('public/js/admin.js', 'utf8');
if(adminCode.includes('Searching database...')) {
    const startIdx = adminCode.indexOf('let resSearchTimeout;');
    const endIdx = adminCode.indexOf('window.selectResItem');
    if(startIdx !== -1 && endIdx !== -1) {
        const replaceBlock = `document.getElementById('res-item-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const resDiv = document.getElementById('res-search-results');
    document.getElementById('res-item-id').value = '';
    document.getElementById('res-cost').value = '';
    
    if(!term) {
        resDiv.classList.add('hidden');
        return;
    }
    
    const matches = inventoryItems.filter(i => i.name.toLowerCase().includes(term));
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-2 text-sm text-gray-500">No items found</div>';
    } else {
        resDiv.innerHTML = matches.map(i => \`<div class="p-2 text-sm cursor-pointer hover:bg-blue-50 border-b" onclick="selectResItem('\${i.id}', '\${i.name.replace(/'/g, "\\\\'")}')"><div class="font-bold">\${i.name}</div><div class="text-xs text-gray-500">Stock: \${i.stock_quantity} | BP: \${i.buying_price}</div></div>\`).join('');
    }
    resDiv.classList.remove('hidden');
});\n\n`;
        adminCode = adminCode.substring(0, startIdx) + replaceBlock + adminCode.substring(endIdx);
    }
}
fs.writeFileSync('public/js/admin.js', adminCode);

// INVENTORY.JS
let invCode = fs.readFileSync('public/js/inventory.js', 'utf8');
if(invCode.includes('Searching database...')) {
    const startIdx = invCode.indexOf('let invSearchTimeout;');
    const endIdx = invCode.indexOf('load();');
    if(startIdx !== -1 && endIdx !== -1) {
        const replaceBlock = `document.getElementById('inv-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#inv-tbody tr');
    for(let i=0; i<rows.length; i+=2) {
        const displayRow = rows[i];
        const editRow = rows[i+1];
        if(!displayRow) continue;
        const text = displayRow.innerText.toLowerCase();
        if(text.includes(term)) {
            displayRow.style.display = '';
        } else {
            displayRow.style.display = 'none';
            if(editRow) editRow.classList.add('hidden');
        }
    }
});\n\n`;
        invCode = invCode.substring(0, startIdx) + replaceBlock + invCode.substring(endIdx);
    }
}
fs.writeFileSync('public/js/inventory.js', invCode);

console.log('Reverted searches to local filtering.');
