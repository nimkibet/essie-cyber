const fs = require('fs');
const path = require('path');
const jsDir = path.join(__dirname, 'public', 'js');

// 1. SUPABASE CLIENT
const client = `import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';
export const supabase = createClient('https://cztwpohqhbjdrjqiavec.supabase.co', 'sb_publishable_hw959Pqfc9jDGhifXOuLjQ_fSv5l6Xr');
export let currentUser = null;
export async function login(username, pin) {
    const { data, error } = await supabase.from('users').select('*').eq('username', username).eq('pin', pin).single();
    if (error || !data) return { success: false };
    currentUser = data; localStorage.setItem('essie_session', JSON.stringify(data));
    return { success: true, user: data };
}
export function logout() { currentUser = null; localStorage.removeItem('essie_session'); window.location.href = '/login.html'; }
export function checkSession() {
    const session = localStorage.getItem('essie_session');
    if (session) { currentUser = JSON.parse(session); return true; }
    return false;
}
export function requireAuth() {
    if (!checkSession()) window.location.href = '/login.html';
    else if (currentUser.role === 'admin') document.querySelectorAll('.admin-only').forEach(e => e.classList.remove('hidden'));
    document.getElementById('btn-logout')?.addEventListener('click', logout);
}`;
fs.writeFileSync(path.join(jsDir, 'supabaseClient.js'), client);

// 2. LOGIN.JS
const loginJs = `import { login, checkSession } from './supabaseClient.js';
if (checkSession()) window.location.href = '/pos.html';
let loginUser = 'cashier'; let currentPin = '';
function updatePin() {
    document.querySelectorAll('.pin-dot').forEach((dot, idx) => {
        if (idx < currentPin.length) dot.classList.replace('border-slate-300', 'bg-blue-600');
        else { dot.classList.remove('bg-blue-600'); dot.classList.add('border-slate-300'); }
    });
}
document.querySelectorAll('.user-btn').forEach(btn => btn.addEventListener('click', (e) => {
    loginUser = e.currentTarget.dataset.user;
    document.querySelectorAll('.user-btn').forEach(b => b.className = "user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900");
    e.currentTarget.className = "user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-blue-600 shadow-sm";
}));
document.querySelectorAll('.keypad-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const val = e.currentTarget.dataset.val; document.getElementById('login-error').classList.add('hidden');
    if (val === 'clear') currentPin = '';
    else if (val === 'back') currentPin = currentPin.slice(0, -1);
    else if (currentPin.length < 4) currentPin += val;
    updatePin();
}));
document.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '9' && currentPin.length < 4) { currentPin += e.key; updatePin(); }
    else if (e.key === 'Backspace') { currentPin = currentPin.slice(0, -1); updatePin(); }
    else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') { currentPin = ''; updatePin(); }
    else if (e.key === 'Enter') processLogin();
});
document.getElementById('btn-login-submit').addEventListener('click', processLogin);
async function processLogin() {
    if (currentPin.length < 4) return alert('Enter 4 digit PIN');
    const res = await login(loginUser, currentPin);
    if (res.success) window.location.href = loginUser === 'admin' ? '/admin.html' : '/pos.html';
    else { document.getElementById('login-error').classList.remove('hidden'); currentPin = ''; updatePin(); }
}`;
fs.writeFileSync(path.join(jsDir, 'login.js'), loginJs);

// 3. POS.JS
const posJs = `import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
let inventory = [], customers = [], todaysSales = [];
let activeQuick = "Print / Copy", quickPay = "M-Pesa", mainPay = "M-Pesa";

async function loadData() {
    const [inv, cust] = await Promise.all([supabase.from('inventory').select('*').order('name'), supabase.from('customers').select('*').order('name')]);
    inventory = inv.data || []; customers = cust.data || [];
    
    const isel = document.getElementById('pos-item-search'); isel.innerHTML = '<option value="">-- Select --</option>';
    inventory.forEach(i => isel.innerHTML += \`<option value="\${i.id}" data-price="\${i.selling_price}">\${i.name}</option>\`);
    
    const csel = document.getElementById('pos-customer'); csel.innerHTML = '<option value="">Walk-in</option>';
    customers.forEach(c => csel.innerHTML += \`<option value="\${c.id}">\${c.name}</option>\`);
    
    await fetchTodaysSales();
}

async function fetchTodaysSales() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('sales_log').select('*, inventory(name)').gte('timestamp', \`\${today}T00:00:00Z\`).eq('is_voided', false).order('timestamp', { ascending: false });
    todaysSales = data || []; renderLedger();
}

function renderLedger() {
    let m = 0, c = 0; const tbody = document.getElementById('sales-tbody'); tbody.innerHTML = '';
    todaysSales.forEach(s => {
        if(s.payment_method === 'M-Pesa') m += s.total_charged; else c += s.total_charged;
        tbody.innerHTML += \`<tr><td class="py-2 px-4">\${new Date(s.timestamp).toLocaleTimeString()}</td><td class="py-2 px-4">\${s.inventory?.name}</td><td class="py-2 px-4 text-center">\${s.calculated_qty}</td><td class="py-2 px-4 text-right">\${s.total_charged.toFixed(2)}</td><td class="py-2 px-4 text-right">\${s.payment_method}</td></tr>\`;
    });
    document.getElementById('lbl-mpesa').innerText = \`Ksh \${m.toFixed(2)}\`; document.getElementById('lbl-cash').innerText = \`Ksh \${c.toFixed(2)}\`;
}

document.querySelectorAll('.quick-srv-btn').forEach(b => b.addEventListener('click', e => { activeQuick = e.target.dataset.name; }));
document.getElementById('quick-pay-mpesa').addEventListener('click', () => quickPay = 'M-Pesa');
document.getElementById('quick-pay-cash').addEventListener('click', () => quickPay = 'Cash');

document.getElementById('quick-log-btn').addEventListener('click', async () => {
    const amt = parseFloat(document.getElementById('quick-amount').value); if(!amt) return;
    let item = inventory.find(i => i.name === activeQuick);
    if (!item) { const {data} = await supabase.from('inventory').insert([{name: activeQuick, type: 'variable', selling_price: 0, is_service: true}]).select().single(); item = data; inventory.push(item); }
    await supabase.from('sales_log').insert([{item_id: item.id, total_charged: amt, calculated_qty: 1, calculated_profit: amt, cashier_id: currentUser.id, payment_method: quickPay}]);
    document.getElementById('quick-amount').value = ''; fetchTodaysSales();
});

document.getElementById('pos-item-search').addEventListener('change', (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    if(!opt.value) return;
    document.getElementById('pos-total').value = (parseFloat(opt.dataset.price||0) * parseInt(document.getElementById('pos-qty').value)).toFixed(2);
    document.getElementById('kyocera-fields').className = opt.text.toLowerCase().includes('kyocera') ? 'p-3 bg-blue-50 border border-blue-100 rounded-lg mb-4' : 'hidden';
});

['main-pay-mpesa', 'main-pay-cash'].forEach(id => document.getElementById(id).addEventListener('click', async (e) => {
    const amt = parseFloat(document.getElementById('pos-total').value), qty = parseInt(document.getElementById('pos-qty').value);
    const item = inventory.find(i => i.id === document.getElementById('pos-item-search').value);
    if(!item || !amt) return;
    let bc = item.buying_price || 0, kyo = 0;
    if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { kyo = parseInt(document.getElementById('kyo-pages').value); bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value); }
    await supabase.from('sales_log').insert([{item_id: item.id, total_charged: amt, calculated_qty: qty, calculated_profit: amt - (bc*qty), cashier_id: currentUser.id, payment_method: e.target.innerText, kyocera_pages: kyo}]);
    fetchTodaysSales();
}));

loadData();`;
fs.writeFileSync(path.join(jsDir, 'pos.js'), posJs);

// 4. ADMIN.JS
const adminJs = `import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
if(currentUser.role !== 'admin') window.location.href = '/pos.html';

async function load() {
    // Totals
    const d = new Date(), ym = \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}\`;
    const {data:s} = await supabase.from('sales_log').select('*').gte('timestamp', \`\${ym}-01T00:00:00Z\`);
    let gr=0; (s||[]).forEach(x=>gr+=x.total_charged);
    document.getElementById('hdr-gross').innerText = \`Ksh \${gr.toFixed(2)}\`;
    
    // Resources
    const {data:r} = await supabase.from('resources').select('*').eq('status','active');
    const rt = document.getElementById('res-tbody'); rt.innerHTML = '';
    (r||[]).forEach(x=> rt.innerHTML += \`<tr><td class="py-2 px-3">\${x.name}</td><td class="py-2 px-3 text-right">\${x.cost}</td><td class="py-2 px-3">\${new Date(x.opened_at).toLocaleDateString()}</td><td class="py-2 px-3"><button onclick="exhaust('\${x.id}')" class="bg-gray-200 px-2 py-1 rounded">Exhaust</button></td></tr>\`);
    
    // Overheads
    const {data:o} = await supabase.from('overhead_entries').select('*').eq('period',ym).single();
    if(o) { document.getElementById('ov-rent').value = o.rent; document.getElementById('ov-elec').value = o.electricity; }
}

document.getElementById('btn-open-res').addEventListener('click', async () => {
    await supabase.from('resources').insert([{name: document.getElementById('res-name').value, cost: document.getElementById('res-cost').value, opened_by: currentUser.id}]);
    load();
});
document.getElementById('btn-save-ov').addEventListener('click', async () => {
    const d = new Date(), ym = \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}\`;
    await supabase.from('overhead_entries').upsert({period: ym, rent: document.getElementById('ov-rent').value, electricity: document.getElementById('ov-elec').value, entered_by: currentUser.id});
    alert('Saved'); load();
});
window.exhaust = async (id) => { await supabase.from('resources').update({status:'exhausted'}).eq('id',id); load(); };
load();`;
fs.writeFileSync(path.join(jsDir, 'admin.js'), adminJs);

// 5. INVENTORY.JS
const invJs = `import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
if(currentUser.role !== 'admin') window.location.href = '/pos.html';

async function load() {
    const {data} = await supabase.from('inventory').select('*').order('name');
    const tb = document.getElementById('inv-tbody'); tb.innerHTML = '';
    (data||[]).forEach(i => tb.innerHTML += \`<tr><td class="py-3 px-4">\${i.name}</td><td class="py-3 px-4">\${i.type}</td><td class="py-3 px-4 text-right">\${i.buying_price}</td><td class="py-3 px-4 text-right">\${i.selling_price}</td><td class="py-3 px-4 text-center">\${i.stock_quantity}</td><td class="py-3 px-4 text-center"><button class="bg-red-100 text-red-600 px-2 py-1 rounded" onclick="del('\${i.id}')">Delete</button></td></tr>\`);
}
window.del = async (id) => { if(confirm('Delete?')) { await supabase.from('inventory').delete().eq('id',id); load(); } };
load();`;
fs.writeFileSync(path.join(jsDir, 'inventory.js'), invJs);

// 6. ANALYTICS.JS
const anaJs = `import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
if(currentUser.role !== 'admin') window.location.href = '/pos.html';
async function load() {
    const {data:s} = await supabase.from('sales_log').select('*, inventory(name)').eq('is_voided', false);
    document.getElementById('kpi-tx').innerText = s.length;
    let rev=0, prof=0, items={};
    s.forEach(x => { rev+=x.total_charged; prof+=x.calculated_profit; const n=x.inventory?.name||'U'; if(!items[n])items[n]=0; items[n]+=x.calculated_qty; });
    document.getElementById('kpi-rev').innerText = \`Ksh \${rev}\`; document.getElementById('kpi-profit').innerText = \`Ksh \${prof}\`;
    const top = Object.entries(items).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const tb = document.getElementById('top-tbody'); tb.innerHTML='';
    top.forEach(x => tb.innerHTML += \`<tr><td class="py-2 px-3">\${x[0]}</td><td class="py-2 px-3 text-right">\${x[1]}</td></tr>\`);
}
load();`;
fs.writeFileSync(path.join(jsDir, 'analytics.js'), anaJs);

console.log("JS files generated");
