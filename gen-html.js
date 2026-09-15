const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const jsDir = path.join(publicDir, 'js');

// Helper: Common Head & Nav
const getHead = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Essie Cyber</title>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#1e293b">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <style>
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .keypad-btn:active { transform: scale(0.95); background-color: #e2e8f0; }
        .pin-dot { transition: all 0.2s ease; }
    </style>
</head>
<body class="bg-gray-100 h-screen flex flex-col font-sans text-gray-800 overflow-hidden">
`;

const getNav = (active) => `
    <nav class="bg-slate-900 text-white shadow-md flex-shrink-0">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-14">
                <div class="flex items-center">
                    <span class="text-xl font-bold text-blue-400">Essie Cyber</span>
                </div>
                <div class="flex space-x-2 overflow-x-auto">
                    <a href="/pos.html" class="px-3 py-1.5 text-sm font-medium rounded ${active === 'pos' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}">POS</a>
                    <a href="/inventory.html" class="px-3 py-1.5 text-sm font-medium rounded admin-only hidden ${active === 'inventory' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}">Inventory</a>
                    <a href="/admin.html" class="px-3 py-1.5 text-sm font-medium rounded admin-only hidden ${active === 'admin' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}">Admin / Resources</a>
                    <a href="/analytics.html" class="px-3 py-1.5 text-sm font-medium rounded admin-only hidden ${active === 'analytics' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}">Analytics</a>
                    <button id="btn-logout" class="px-3 py-1.5 text-sm font-medium rounded border border-slate-600 hover:bg-slate-800 text-red-400">Logout</button>
                </div>
            </div>
        </div>
    </nav>
`;

// 1. LOGIN HTML
fs.writeFileSync(path.join(publicDir, 'login.html'), getHead('Login') + `
    <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-4">
        <div class="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-100 p-6 md:p-8 flex flex-col items-center">
            <div class="flex flex-col items-center mb-6">
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-3 text-2xl font-black">EC</div>
                <h1 class="text-2xl font-black text-slate-900 tracking-tight">Essie Cyber</h1>
            </div>
            <div class="w-full flex gap-2 p-1 bg-slate-100 rounded-xl mb-5">
                <button type="button" data-user="cashier" class="user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-blue-600 shadow-sm">👤 Cashier</button>
                <button type="button" data-user="admin" class="user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900">🛡️ Admin</button>
            </div>
            <div class="flex justify-center gap-3 mb-6" id="pin-display">
                <div class="w-4 h-4 rounded-full border-2 border-slate-300 pin-dot"></div>
                <div class="w-4 h-4 rounded-full border-2 border-slate-300 pin-dot"></div>
                <div class="w-4 h-4 rounded-full border-2 border-slate-300 pin-dot"></div>
                <div class="w-4 h-4 rounded-full border-2 border-slate-300 pin-dot"></div>
            </div>
            <div id="login-error" class="w-full mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-600 hidden">
                ⚠️ <span id="login-error-msg">Invalid credentials</span>
            </div>
            <div class="grid grid-cols-3 gap-3 w-full mb-6">
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="1">1</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="2">2</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="3">3</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="4">4</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="5">5</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="6">6</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="7">7</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="8">8</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="9">9</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-100 text-slate-600 font-bold" data-val="clear">C</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-50 border border-slate-100 text-xl font-semibold text-slate-700 shadow-sm" data-val="0">0</button>
                <button class="keypad-btn h-14 rounded-2xl bg-slate-100 text-slate-600 font-bold" data-val="back">⌫</button>
            </div>
            <button id="btn-login-submit" class="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base transition flex items-center justify-center shadow-lg">Sign In</button>
        </div>
    </div>
    <script type="module" src="/js/login.js"></script>
</body></html>`);

// 2. POS HTML
fs.writeFileSync(path.join(publicDir, 'pos.html'), getHead('POS') + getNav('pos') + `
    <main class="flex-1 overflow-y-auto p-4">
        <div class="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto pb-4">
            <!-- Left: Entry Forms -->
            <div class="w-full lg:w-5/12 flex flex-col gap-4">
                <div class="bg-white rounded-xl shadow border border-gray-200 p-5">
                    <h2 class="text-lg font-bold text-gray-800 mb-3">Quick Add</h2>
                    <div class="grid grid-cols-3 gap-2 mb-4">
                        <button class="quick-srv-btn bg-blue-600 text-white py-2 rounded text-sm font-medium" data-name="Print / Copy">Print / Copy</button>
                        <button class="quick-srv-btn bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium" data-name="Typesetting">Typesetting</button>
                        <button class="quick-srv-btn bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium" data-name="Binding Service">Binding</button>
                    </div>
                    <div class="flex gap-2 mb-4">
                        <button id="quick-pay-mpesa" class="flex-1 bg-emerald-700 text-white py-2 rounded font-medium">📱 M-Pesa</button>
                        <button id="quick-pay-cash" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium">💵 Cash</button>
                    </div>
                    <div class="flex gap-2">
                        <input type="number" id="quick-amount" class="flex-1 border border-gray-300 rounded px-3 py-2 font-bold text-lg" placeholder="Amount (Ksh)">
                        <button id="quick-log-btn" class="bg-blue-600 text-white px-4 py-2 rounded font-bold">✓ Log</button>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow border border-gray-200 p-5">
                    <h2 class="text-lg font-bold text-gray-800 mb-4">Main Sale Form</h2>
                    <select id="pos-item-search" class="w-full border border-gray-300 rounded px-3 py-2 mb-4"><option value="">Loading...</option></select>
                    
                    <div id="kyocera-fields" class="hidden p-3 bg-blue-50 border border-blue-100 rounded-lg mb-4">
                        <h3 class="text-xs font-bold text-blue-800 uppercase mb-2">Kyocera Details</h3>
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="text-xs">Pages</label><input type="number" id="kyo-pages" class="w-full border rounded px-2" value="1"></div>
                            <div><label class="text-xs">Cost/Page</label><input type="number" id="kyo-cost-pp" class="w-full border rounded px-2" value="2.5"></div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label class="block text-sm font-semibold mb-1">Quantity</label>
                            <div class="flex"><button id="qty-minus" class="bg-gray-200 px-3 py-2 rounded-l">-</button><input type="number" id="pos-qty" class="w-full text-center border-y py-2 font-bold" value="1"><button id="qty-plus" class="bg-gray-200 px-3 py-2 rounded-r">+</button></div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-blue-600 mb-1">Total (Ksh)</label>
                            <input type="number" id="pos-total" class="w-full border border-blue-300 rounded px-3 py-2 font-bold text-lg bg-blue-50">
                        </div>
                    </div>
                    
                    <select id="pos-customer" class="w-full border border-gray-300 rounded px-3 py-2 mb-4 bg-gray-50"><option value="">Walk-in</option></select>
                    <div class="flex gap-2">
                        <button id="main-pay-mpesa" class="flex-1 bg-emerald-700 text-white py-2 rounded font-medium">M-Pesa</button>
                        <button id="main-pay-cash" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded font-medium">Cash</button>
                    </div>
                </div>
            </div>

            <!-- Right: Ledger -->
            <div class="w-full lg:w-7/12 flex flex-col gap-4">
                <div class="bg-white rounded-xl shadow border border-gray-200 p-4">
                    <div class="flex justify-between items-center mb-3">
                        <h2 class="text-lg font-bold text-gray-800">Financial Ledger (Today)</h2>
                    </div>
                    <div class="flex justify-end gap-6 border-t pt-3">
                        <div class="text-sm"><span class="font-bold text-emerald-700">M-Pesa:</span> <span id="lbl-mpesa">Ksh 0.00</span></div>
                        <div class="text-sm"><span class="font-bold text-blue-600">Cash:</span> <span id="lbl-cash">Ksh 0.00</span></div>
                    </div>
                </div>
                <div class="bg-white rounded-xl shadow border flex-1 flex flex-col overflow-hidden min-h-[300px]">
                    <div class="flex-1 overflow-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-100 sticky top-0 text-sm text-gray-600">
                                <tr><th class="py-3 px-4 border-b">Time</th><th class="py-3 px-4 border-b">Item</th><th class="py-3 px-4 border-b text-center">Qty</th><th class="py-3 px-4 border-b text-right">Sales</th><th class="py-3 px-4 border-b text-right">Method</th></tr>
                            </thead>
                            <tbody id="sales-tbody" class="text-sm divide-y divide-gray-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </main>
    <script type="module" src="/js/pos.js"></script>
</body></html>`);

// 3. INVENTORY HTML
fs.writeFileSync(path.join(publicDir, 'inventory.html'), getHead('Inventory') + getNav('inventory') + `
    <main class="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold text-slate-800">Inventory Management</h1>
            <button id="btn-add-item" class="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">+ Add New Item</button>
        </div>
        
        <div class="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-600">
                    <tr><th class="py-3 px-4 border-b">Name</th><th class="py-3 px-4 border-b">Type</th><th class="py-3 px-4 border-b text-right">Buying</th><th class="py-3 px-4 border-b text-right">Selling</th><th class="py-3 px-4 border-b text-center">Stock</th><th class="py-3 px-4 border-b text-center">Actions</th></tr>
                </thead>
                <tbody id="inv-tbody" class="divide-y divide-slate-100"></tbody>
            </table>
        </div>
    </main>
    <script type="module" src="/js/inventory.js"></script>
</body></html>`);

// 4. ADMIN HTML
fs.writeFileSync(path.join(publicDir, 'admin.html'), getHead('Admin') + getNav('admin') + `
    <main class="flex-1 overflow-y-auto bg-gray-50">
        <div class="bg-slate-900 text-white shadow-md">
            <div class="max-w-7xl mx-auto flex">
                <div class="flex-1 py-4 px-6 text-center border-r border-slate-700">
                    <div class="text-xs font-bold text-slate-400 mb-1 uppercase">Gross Sales</div><div id="hdr-gross" class="text-2xl font-bold">Ksh 0.00</div>
                </div>
                <div class="flex-1 py-4 px-6 text-center border-r border-slate-700">
                    <div class="text-xs font-bold text-red-400 mb-1 uppercase">Expenses</div><div id="hdr-expenses" class="text-2xl font-bold text-red-400">Ksh 0.00</div>
                </div>
                <div class="flex-1 py-4 px-6 text-center border-r border-slate-700">
                    <div class="text-xs font-bold text-emerald-400 mb-1 uppercase">Net Profit</div><div id="hdr-net" class="text-2xl font-bold text-emerald-400">Ksh 0.00</div>
                </div>
                <div class="py-4 px-6 flex items-center gap-3">
                    <span class="text-sm font-semibold">Period:</span><select id="admin-period" class="bg-slate-800 border rounded px-3 py-1.5 text-sm"><option value="today">Today</option><option value="month">This Month</option></select>
                </div>
            </div>
        </div>

        <div class="max-w-7xl mx-auto p-6 space-y-8">
            <!-- Resources -->
            <div class="bg-white rounded-xl shadow border p-5">
                <h2 class="text-lg font-bold mb-4 border-b pb-2">Resource Management (Amortized)</h2>
                <div class="grid grid-cols-4 gap-4 items-end mb-6 bg-slate-50 p-4 rounded border">
                    <div class="col-span-2"><label class="block text-sm font-semibold mb-1">Item Name</label><input type="text" id="res-name" class="w-full border rounded px-3 py-2"></div>
                    <div><label class="block text-sm font-semibold mb-1">Cost (Ksh)</label><input type="number" id="res-cost" class="w-full border rounded px-3 py-2"></div>
                    <div><button id="btn-open-res" class="w-full bg-blue-600 text-white font-bold py-2 rounded">Open Resource</button></div>
                </div>
                <table class="w-full text-left text-sm"><thead class="bg-slate-50"><tr><th class="py-2 px-3">Item</th><th class="py-2 px-3 text-right">Cost</th><th class="py-2 px-3">Date</th><th class="py-2 px-3 text-center">Action</th></tr></thead><tbody id="res-tbody"></tbody></table>
            </div>

            <!-- Overheads -->
            <div class="bg-white rounded-xl shadow border border-l-4 border-l-red-500 p-5">
                <h2 class="text-lg font-bold text-red-700 mb-4 border-b pb-2">Fixed Overheads</h2>
                <div class="flex gap-4 items-end">
                    <div class="flex-1"><label class="block text-xs font-semibold mb-1">Rent</label><input type="number" id="ov-rent" class="w-full border rounded px-3 py-2"></div>
                    <div class="flex-1"><label class="block text-xs font-semibold mb-1">Electricity</label><input type="number" id="ov-elec" class="w-full border rounded px-3 py-2"></div>
                    <div class="flex-1"><label class="block text-xs font-semibold mb-1">Internet</label><input type="number" id="ov-wifi" class="w-full border rounded px-3 py-2"></div>
                    <div class="flex-1"><label class="block text-xs font-semibold mb-1">Other</label><input type="number" id="ov-other" class="w-full border rounded px-3 py-2"></div>
                    <div><button id="btn-save-ov" class="bg-blue-600 text-white font-bold px-6 py-2 rounded">Save</button></div>
                </div>
            </div>

            <!-- Wages -->
            <div class="bg-white rounded-xl shadow border border-l-4 border-l-amber-500 p-5">
                <h2 class="text-lg font-bold text-amber-700 mb-4 border-b pb-2">Shift Wages</h2>
                <table class="w-full text-left text-sm mb-4"><thead class="bg-slate-50"><tr><th class="py-2 px-3">Date</th><th class="py-2 px-3">Staff</th><th class="py-2 px-3 text-right">Wage (Ksh)</th><th class="py-2 px-3 text-center">Action</th></tr></thead><tbody id="wage-tbody"></tbody></table>
            </div>
        </div>
    </main>
    <script type="module" src="/js/admin.js"></script>
</body></html>`);

// 5. ANALYTICS HTML
fs.writeFileSync(path.join(publicDir, 'analytics.html'), getHead('Analytics') + getNav('analytics') + `
    <main class="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
        <div class="bg-white p-5 rounded-xl shadow flex justify-between items-center border mb-6">
            <div><h1 class="text-2xl font-bold">Analytics</h1></div>
            <div><select id="ana-period" class="bg-slate-100 border rounded px-4 py-2 font-semibold"><option value="today">Today</option><option value="month">This Month</option></select></div>
        </div>
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-white p-5 rounded-xl shadow text-center border"><div class="text-xs font-bold text-slate-500 uppercase">Transactions</div><div id="kpi-tx" class="text-4xl font-black">0</div></div>
            <div class="bg-white p-5 rounded-xl shadow text-center border"><div class="text-xs font-bold text-slate-500 uppercase">Revenue</div><div id="kpi-rev" class="text-3xl font-black text-emerald-600">Ksh 0</div></div>
            <div class="bg-white p-5 rounded-xl shadow text-center border"><div class="text-xs font-bold text-slate-500 uppercase">Profit</div><div id="kpi-profit" class="text-3xl font-black text-blue-600">Ksh 0</div></div>
        </div>
        <div class="bg-white p-5 rounded-xl shadow border"><h2 class="text-lg font-bold mb-4">Top Items</h2><table class="w-full text-left text-sm"><thead class="bg-slate-50"><tr><th class="py-2 px-3">Item</th><th class="py-2 px-3 text-right">Qty</th></tr></thead><tbody id="top-tbody"></tbody></table></div>
    </main>
    <script type="module" src="/js/analytics.js"></script>
</body></html>`);

console.log("HTML files generated");
