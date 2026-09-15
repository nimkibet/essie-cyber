const fs = require('fs');
let code = fs.readFileSync('public/js/admin.js', 'utf8');

const searchRegex = /document\.getElementById\('res-item-search'\)\.addEventListener\('input', \(e\) => \{[\s\S]*?resDiv\.classList\.remove\('hidden'\);\n\}\);/;

const replacement = `
function handleResSearch(e) {
    const term = e.target ? e.target.value.toLowerCase() : e.toLowerCase();
    const resDiv = document.getElementById('res-search-results');
    
    let matches = inventoryItems;
    if(term) {
        matches = inventoryItems.filter(i => i.name.toLowerCase().includes(term));
    }
    
    if(matches.length === 0) {
        resDiv.innerHTML = '<div class="p-2 text-sm text-gray-500">No items found</div>';
    } else {
        resDiv.innerHTML = matches.map(i => \`<div class="p-2 text-sm cursor-pointer hover:bg-blue-50 border-b" onclick="selectResItem('\${i.id}', '\${i.name.replace(/'/g, "\\\\'")}')"><div class="font-bold">\${i.name}</div><div class="text-xs text-gray-500">Stock: \${i.stock_quantity} | BP: \${i.buying_price}</div></div>\`).join('');
    }
    resDiv.classList.remove('hidden');
}

document.getElementById('res-item-search').addEventListener('focus', (e) => handleResSearch(e));
document.getElementById('res-item-search').addEventListener('input', (e) => {
    document.getElementById('res-item-id').value = '';
    document.getElementById('res-cost').value = '';
    handleResSearch(e);
});
`;

code = code.replace(searchRegex, replacement);
fs.writeFileSync('public/js/admin.js', code);
console.log('admin.js search updated');
