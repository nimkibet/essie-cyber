const fs = require('fs');
let html = fs.readFileSync('public/pos.html', 'utf8');

if (!html.includes('jspdf.umd.min.js')) {
    html = html.replace('</head>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"></script></head>');
}

const oldHeader = '<h2 class="text-lg font-bold text-gray-800 mb-4">Main Sale Form</h2>';
const newHeader = `
<div class="flex justify-between items-center mb-4">
    <h2 class="text-lg font-bold text-gray-800">Main Sale Form</h2>
    <div class="flex items-center bg-gray-100 rounded-lg p-1">
        <button id="mode-direct" class="px-3 py-1 text-sm font-bold bg-white shadow-sm rounded-md text-blue-600 transition-all">Direct Sale</button>
        <button id="mode-doc" class="px-3 py-1 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-md transition-all">Quote/Receipt</button>
    </div>
</div>
`;
html = html.replace(oldHeader, newHeader);

const oldBtnsRegex = /<div class="flex gap-2">\s*<button id="main-pay-mpesa".*?<\/button>\s*<button id="main-pay-cash".*?<\/button>\s*<\/div>/;
const newBtns = `
<div id="direct-actions" class="flex gap-2">
    <button id="main-pay-mpesa" class="flex-1 bg-emerald-700 text-white py-2 rounded font-medium shadow">M-Pesa</button>
    <button id="main-pay-cash" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium shadow">Cash</button>
</div>
<div id="doc-actions" class="hidden flex gap-2">
    <button id="btn-add-to-doc" class="w-full bg-blue-600 text-white py-2 rounded font-bold shadow">Add to Document</button>
</div>

<!-- Temporary Document Cart -->
<div id="doc-cart-panel" class="hidden mt-4 pt-4 border-t border-gray-200">
    <h3 class="text-sm font-bold text-gray-700 mb-2">Document Items</h3>
    <div class="bg-gray-50 border rounded-lg max-h-40 overflow-y-auto mb-2">
        <table class="w-full text-xs text-left">
            <tbody id="doc-cart-tbody" class="divide-y divide-gray-200"></tbody>
        </table>
    </div>
    <div class="flex justify-between items-center font-bold text-sm mb-3 text-gray-800">
        <span>Total:</span>
        <span id="doc-cart-total">Ksh 0.00</span>
    </div>
    <div class="flex gap-2">
        <button id="btn-dl-quote" class="flex-1 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 py-1.5 rounded text-sm font-bold transition">Quote PDF</button>
        <button id="btn-dl-receipt" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded text-sm font-bold shadow transition">Receipt PDF</button>
        <button id="btn-clear-doc" class="px-2 text-red-500 hover:text-red-700 font-bold" title="Clear">&times;</button>
    </div>
</div>
`;
html = html.replace(oldBtnsRegex, newBtns);

fs.writeFileSync('public/pos.html', html);
console.log('Done!');
