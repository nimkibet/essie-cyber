const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

const searchRegex = /document\.getElementById\('pos-item-search'\)\.addEventListener\('input', \(e\) => \{[\s\S]*?resDiv\.classList\.remove\('hidden'\);\n\}\);/;

const replacement = `
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
        resDiv.innerHTML = matches.map(i => \`<div class="p-3 text-sm cursor-pointer hover:bg-blue-50 border-b flex justify-between items-center transition-colors" onclick="selectPosItem('\${i.id}', '\${i.name.replace(/'/g, "\\\\'")}', \${i.selling_price})"><div class="font-bold text-gray-800">\${i.name}</div><div class="font-bold text-blue-600">Ksh \${i.selling_price}</div></div>\`).join('');
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
`;

code = code.replace(searchRegex, replacement);
fs.writeFileSync('public/js/pos.js', code);
console.log('pos.js search updated');
