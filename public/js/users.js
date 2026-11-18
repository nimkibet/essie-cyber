import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';

requireAuth();
if (currentUser && currentUser.role !== 'admin') {
    window.location.href = '/pos.html';
}

// Global Module State
let usersList = [];
let allSalesData = [];
let allWagesData = [];
let activeUser = null;
let activeUserRange = 'today'; // 'today', 'yesterday', 'week', 'month', 'all', 'custom'
let activeUserCustomDates = { from: '', to: '' };
let activeUserTransactions = [];

let storeSettings = {
    company_name: 'Essie Cyber System',
    tagline: 'Printing, Photocopy, Stationery & Online Cyber Services',
    phone_contact: '+254 700 000 000',
    location_address: 'Commercial Cyber Centre',
    receipt_footer: 'Thank you for choosing Essie Cyber! Quality cyber services and supplies.'
};

async function loadStoreSettings() {
    try {
        const { data } = await supabase.from('settings').select('*');
        if (data && data.length > 0) {
            data.forEach(s => {
                if (s.key && s.value) storeSettings[s.key] = s.value;
            });
        }
    } catch (e) {
        console.warn('Could not load store settings:', e.message);
    }
}

// ====================================================================
// 1. DATA LOADING & KPI AGGREGATIONS
// ====================================================================
async function loadUsers() {
    const tbody = document.getElementById('user-tbody');
    try {
        const { data: users, error: userErr } = await supabase
            .from('users')
            .select('*')
            .order('username');

        if (userErr) throw userErr;
        usersList = users || [];

        // Fetch sales log to compute staff sales volumes
        const { data: sales, error: salesErr } = await supabase
            .from('sales_log')
            .select('id, total_charged, calculated_qty, calculated_profit, cashier_id, payment_method, is_voided, timestamp');

        if (!salesErr && sales) {
            allSalesData = sales;
        }

        renderKPICards();
        renderUsersTable();
        populateWageCashierFilter();
        await loadWages();

    } catch (err) {
        console.error('Error loading users:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500 font-bold">Failed to load staff accounts: ${err.message}</td></tr>`;
        }
    }
}

function computeUserSales(userId) {
    let totalSales = 0;
    let transactionsCount = 0;

    allSalesData.forEach(s => {
        if (s.cashier_id === userId && !s.is_voided) {
            totalSales += parseFloat(s.total_charged || 0);
            transactionsCount++;
        }
    });

    return { totalSales, transactionsCount };
}

function renderKPICards() {
    const kpiTotalUsers = document.getElementById('kpi-total-users');
    const kpiCashiersCount = document.getElementById('kpi-cashiers-count');
    const kpiAdminsCount = document.getElementById('kpi-admins-count');
    const kpiTotalStaffSales = document.getElementById('kpi-total-staff-sales');

    let cashiers = 0;
    let admins = 0;
    let totalSalesVolume = 0;

    usersList.forEach(u => {
        if (u.role === 'admin') admins++;
        else cashiers++;
    });

    allSalesData.forEach(s => {
        if (!s.is_voided) {
            totalSalesVolume += parseFloat(s.total_charged || 0);
        }
    });

    if (kpiTotalUsers) kpiTotalUsers.textContent = usersList.length;
    if (kpiCashiersCount) kpiCashiersCount.textContent = cashiers;
    if (kpiAdminsCount) kpiAdminsCount.textContent = admins;
    if (kpiTotalStaffSales) kpiTotalStaffSales.textContent = `KSh ${totalSalesVolume.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// ====================================================================
// 2. SEARCH, FILTER & USER TABLE RENDERING
// ====================================================================
function renderUsersTable() {
    const tbody = document.getElementById('user-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
    const filterRole = document.getElementById('user-filter-role')?.value || 'all';

    let list = usersList.filter(u => {
        const matchSearch = !searchTerm || 
            (u.username && u.username.toLowerCase().includes(searchTerm));

        let matchRole = true;
        if (filterRole === 'admin') matchRole = u.role === 'admin';
        else if (filterRole === 'cashier') matchRole = u.role === 'cashier';

        return matchSearch && matchRole;
    });

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-16 text-center text-slate-400">
                    <div class="text-3xl mb-1">🔍</div>
                    <div class="font-bold text-slate-700">No staff accounts found</div>
                    <div class="text-xs text-slate-400 mt-1">${searchTerm ? `No matches for "${searchTerm}"` : 'Add your first staff account to get started'}</div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = list.map(u => {
        const { totalSales, transactionsCount } = computeUserSales(u.id);
        const isAdmin = u.role === 'admin';
        const roleBadge = isAdmin
            ? `<span class="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-100 text-purple-800">ADMINISTRATOR</span>`
            : `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">CASHIER</span>`;

        const isSelf = currentUser && currentUser.id === u.id;
        const usernameSafe = (u.username || '').replace(/'/g, "\\'");

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} font-black text-sm flex items-center justify-center flex-shrink-0">
                            ${(u.username || 'U').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-black text-slate-900 text-base leading-snug flex items-center gap-1.5">
                                <span>${u.username}</span>
                                ${isSelf ? '<span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">You</span>' : ''}
                            </div>
                            <div class="text-xs text-slate-400 font-mono">ID: #${u.id.slice(0, 8)}</div>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 px-4">
                    ${roleBadge}
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2 text-xs font-mono font-bold text-slate-600">
                        <span id="pin-mask-${u.id}">••••</span>
                        <span id="pin-text-${u.id}" class="hidden text-blue-700 font-bold">${u.pin || '----'}</span>
                        <button type="button" class="btn-toggle-pin text-slate-400 hover:text-slate-600 text-xs" data-id="${u.id}" title="Toggle PIN visibility">👁️</button>
                    </div>
                </td>
                <td class="py-3.5 px-4 text-right">
                    <div class="font-black text-slate-900 text-sm sm:text-base">KSh ${totalSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="text-[11px] text-slate-500 font-medium">${transactionsCount} sale${transactionsCount === 1 ? '' : 's'}</div>
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                        <button class="btn-user-activity px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-sm" data-id="${u.id}">
                            <span>📊</span> Performance Report
                        </button>
                        <button class="btn-set-pin px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition" data-id="${u.id}" data-name="${usernameSafe}">
                            🔑 PIN
                        </button>
                        <button class="btn-edit-role px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition" data-id="${u.id}" data-role="${u.role}" data-name="${usernameSafe}">
                            ✏️ Role
                        </button>
                        ${!isSelf ? `
                            <button class="btn-del-user px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs transition" data-id="${u.id}" data-name="${usernameSafe}" title="Delete user">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach Event Listeners
    tbody.querySelectorAll('.btn-toggle-pin').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const mask = document.getElementById(`pin-mask-${id}`);
            const text = document.getElementById(`pin-text-${id}`);
            if (mask && text) {
                const isHidden = text.classList.contains('hidden');
                mask.classList.toggle('hidden', isHidden);
                text.classList.toggle('hidden', !isHidden);
            }
        });
    });

    tbody.querySelectorAll('.btn-user-activity').forEach(btn => {
        btn.addEventListener('click', () => openUserActivity(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-set-pin').forEach(btn => {
        btn.addEventListener('click', () => setPinModal(btn.dataset.id, btn.dataset.name));
    });

    tbody.querySelectorAll('.btn-edit-role').forEach(btn => {
        btn.addEventListener('click', () => editRoleModal(btn.dataset.id, btn.dataset.name, btn.dataset.role));
    });

    tbody.querySelectorAll('.btn-del-user').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.id, btn.dataset.name));
    });
}

// Search inputs
const userSearchInput = document.getElementById('user-search');
const btnClearUserSearch = document.getElementById('btn-clear-user-search');

userSearchInput?.addEventListener('input', () => {
    if (btnClearUserSearch) {
        btnClearUserSearch.classList.toggle('hidden', !userSearchInput.value.trim());
    }
    renderUsersTable();
});

btnClearUserSearch?.addEventListener('click', () => {
    userSearchInput.value = '';
    btnClearUserSearch.classList.add('hidden');
    userSearchInput.focus();
    renderUsersTable();
});

document.getElementById('user-filter-role')?.addEventListener('change', renderUsersTable);

// ====================================================================
// 3. CASHIER WAGE PAYMENTS & PREVIOUS WAGE HISTORY
// ====================================================================
function populateWageCashierFilter() {
    const sel = document.getElementById('wage-filter-user');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="all">All Cashiers</option>';
    usersList.forEach(u => {
        sel.innerHTML += `<option value="${u.id}">${u.username} (${u.role.toUpperCase()})</option>`;
    });
    if (currentVal) sel.value = currentVal;
}

async function loadWages() {
    const tbody = document.getElementById('wage-tbody');
    const kpiTotal = document.getElementById('wage-kpi-total');
    if (!tbody) return;

    try {
        const { data, error } = await supabase
            .from('attendance_log')
            .select('id, user_id, work_date, wage_assigned, created_at, users:users(username)')
            .order('work_date', { ascending: false });

        if (error) throw error;
        allWagesData = data || [];

        renderWagesTable();
    } catch (err) {
        console.error('Error loading wages:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500 font-bold">Failed to load wage payments: ${err.message}</td></tr>`;
    }
}

function renderWagesTable() {
    const tbody = document.getElementById('wage-tbody');
    const kpiTotal = document.getElementById('wage-kpi-total');
    if (!tbody) return;

    const selectedUser = document.getElementById('wage-filter-user')?.value || 'all';
    const selectedMonth = document.getElementById('wage-filter-month')?.value; // 'YYYY-MM'

    let list = allWagesData.filter(w => {
        let matchUser = true;
        if (selectedUser !== 'all') matchUser = w.user_id === selectedUser;

        let matchMonth = true;
        if (selectedMonth && w.work_date) matchMonth = w.work_date.startsWith(selectedMonth);

        return matchUser && matchMonth;
    });

    let totalWages = 0;
    list.forEach(w => totalWages += parseFloat(w.wage_assigned || 0));
    if (kpiTotal) kpiTotal.textContent = `KSh ${totalWages.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-slate-400">
                    <div class="text-2xl mb-1">💵</div>
                    <div class="font-bold text-slate-700">No wage payments recorded for this selection</div>
                    <div class="text-xs text-slate-400 mt-1">Use the "Pay Cashier Wage" button above to record a shift wage payout</div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = list.map(w => {
        const cashierName = w.users?.username || 'Cashier';
        const wageAmt = parseFloat(w.wage_assigned || 0);
        const recordDate = w.created_at ? new Date(w.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-4 font-bold text-slate-900">${w.work_date}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${cashierName}</td>
                <td class="py-3 px-4 text-right font-black text-emerald-700">KSh ${wageAmt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="py-3 px-4 text-xs text-slate-400">${recordDate}</td>
                <td class="py-3 px-4 text-center">
                    <button class="btn-edit-wage px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg text-xs transition" data-id="${w.id}" data-user="${w.user_id}" data-date="${w.work_date}" data-amt="${wageAmt}" data-name="${cashierName}">
                        ✏️ Adjust Wage
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-edit-wage').forEach(btn => {
        btn.addEventListener('click', () => {
            editWageModal(btn.dataset.id, btn.dataset.user, btn.dataset.date, parseFloat(btn.dataset.amt || 0), btn.dataset.name);
        });
    });
}

document.getElementById('wage-filter-user')?.addEventListener('change', renderWagesTable);
document.getElementById('wage-filter-month')?.addEventListener('change', renderWagesTable);
document.getElementById('btn-refresh-wages')?.addEventListener('click', loadWages);

// Modal to record a new cashier wage
document.getElementById('btn-record-wage')?.addEventListener('click', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const userOptions = usersList.map(u => `<option value="${u.id}">${u.username} (${u.role.toUpperCase()})</option>`).join('');

    showModal('Record Cashier Wage Payout', `
        <div class="space-y-3.5">
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Cashier Staff Member</label>
                <select id="modal-wage-user" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-blue-500">
                    ${userOptions}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Shift / Work Date</label>
                <input type="date" id="modal-wage-date" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-slate-800 focus:outline-none focus:border-blue-500" value="${todayStr}">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Wage Amount (KSh)</label>
                <input type="number" id="modal-wage-amount" min="1" step="any" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-black text-lg text-slate-900 focus:outline-none focus:border-emerald-500" placeholder="e.g. 350">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Notes / Shift Remarks (Optional)</label>
                <input type="text" id="modal-wage-notes" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500" placeholder="e.g. Full day shift cashier payment">
            </div>
        </div>
    `, async (close) => {
        const userId = document.getElementById('modal-wage-user').value;
        const workDate = document.getElementById('modal-wage-date').value;
        const amt = parseFloat(document.getElementById('modal-wage-amount').value || 0);
        const notes = document.getElementById('modal-wage-notes').value.trim();

        if (!userId) throw new Error("Select a cashier");
        if (!workDate) throw new Error("Select a valid work date");
        if (amt <= 0) throw new Error("Enter a valid wage amount greater than zero");

        const targetUser = usersList.find(u => u.id === userId);
        const userName = targetUser ? targetUser.username : 'Cashier';

        // 1. Upsert into attendance_log
        const { error: attErr } = await supabase.from('attendance_log').upsert({
            user_id: userId,
            work_date: workDate,
            wage_assigned: amt
        }, { onConflict: 'user_id, work_date' });
        if (attErr) throw attErr;

        // 2. Also record in expenses table for financial analytics
        const desc = `Wage - ${userName}${notes ? ` (${notes})` : ''}`;
        const { error: expErr } = await supabase.from('expenses').insert([{
            description: desc,
            amount: amt,
            timestamp: new Date().toISOString()
        }]);
        if (expErr) console.warn('Could not mirror to expenses table:', expErr);

        alert(`Wage of KSh ${amt.toFixed(2)} recorded for ${userName} on ${workDate}!`);
        close();
        await loadWages();
    }, 'Save Wage Payment');
});

function editWageModal(id, userId, workDate, currentAmt, username) {
    showModal(`Adjust Wage for ${username}`, `
        <div class="space-y-3.5">
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Work Date</label>
                <input type="text" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 bg-slate-100 font-bold text-sm text-slate-700" value="${workDate}" readonly>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Updated Wage Amount (KSh)</label>
                <input type="number" id="edit-wage-amt" min="0" step="any" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-black text-lg text-slate-900 focus:outline-none focus:border-emerald-500" value="${currentAmt}">
            </div>
        </div>
    `, async (close) => {
        const newAmt = parseFloat(document.getElementById('edit-wage-amt').value || 0);
        if (newAmt < 0) throw new Error("Wage cannot be negative");

        const { error } = await supabase.from('attendance_log').update({
            wage_assigned: newAmt
        }).eq('id', id);

        if (error) throw error;
        close();
        await loadWages();
    }, 'Update Wage');
}

// Tab Switching
document.getElementById('tab-btn-staff')?.addEventListener('click', () => {
    document.getElementById('tab-btn-staff').className = "px-4 py-2 font-black text-xs sm:text-sm rounded-xl transition bg-blue-600 text-white shadow-sm";
    document.getElementById('tab-btn-wages').className = "px-4 py-2 font-bold text-xs sm:text-sm rounded-xl transition bg-white text-slate-600 hover:bg-slate-100 border border-slate-200";
    document.getElementById('tab-content-staff').classList.remove('hidden');
    document.getElementById('tab-content-wages').classList.add('hidden');
});

document.getElementById('tab-btn-wages')?.addEventListener('click', () => {
    document.getElementById('tab-btn-wages').className = "px-4 py-2 font-black text-xs sm:text-sm rounded-xl transition bg-blue-600 text-white shadow-sm";
    document.getElementById('tab-btn-staff').className = "px-4 py-2 font-bold text-xs sm:text-sm rounded-xl transition bg-white text-slate-600 hover:bg-slate-100 border border-slate-200";
    document.getElementById('tab-content-wages').classList.remove('hidden');
    document.getElementById('tab-content-staff').classList.add('hidden');
});

// ====================================================================
// 4. CASHIER PERFORMANCE & SALES AUDIT MODAL
// ====================================================================
async function openUserActivity(userId) {
    activeUser = usersList.find(u => u.id === userId);
    if (!activeUser) return;

    const modal = document.getElementById('modal-user-activity');
    const nameLabel = document.getElementById('report-user-name');
    const roleBadge = document.getElementById('report-user-role-badge');
    const metaLabel = document.getElementById('report-user-meta');

    if (nameLabel) nameLabel.textContent = `${activeUser.username}`;
    if (metaLabel) metaLabel.textContent = `Staff ID: #${activeUser.id.slice(0, 8)} • Role: ${activeUser.role.toUpperCase()}`;

    if (roleBadge) {
        roleBadge.textContent = activeUser.role.toUpperCase();
        roleBadge.className = activeUser.role === 'admin' 
            ? "px-2.5 py-0.5 rounded-md text-xs font-black bg-purple-100 text-purple-800" 
            : "px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800";
    }

    // Default to 'today' preset
    activeUserRange = 'today';
    document.querySelectorAll('.user-preset-btn').forEach(btn => {
        btn.className = btn.dataset.range === 'today'
            ? "user-preset-btn active px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-600 bg-blue-50 text-blue-700 transition"
            : "user-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
    });

    const container = document.getElementById('user-transactions-container');
    if (container) {
        container.innerHTML = '<div class="py-12 text-center text-slate-400 font-semibold text-sm">Loading cashier transaction ledger...</div>';
    }

    modal?.classList.remove('hidden');

    try {
        // Query sales handled by this cashier
        const { data, error } = await supabase
            .from('sales_log')
            .select('id, total_charged, calculated_qty, calculated_profit, payment_method, status, timestamp, is_voided, kyocera_pages, inventory(id, name, category, selling_price), customers(id, name, phone)')
            .eq('cashier_id', userId)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        activeUserTransactions = data || [];

        renderUserActivityDetails();

    } catch (err) {
        console.error('Failed to load user transactions:', err);
        if (container) {
            container.innerHTML = `<div class="p-6 text-center text-red-500 font-bold">Failed to load sales log: ${err.message}</div>`;
        }
    }
}

// Preset range buttons inside user modal
document.querySelectorAll('.user-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.user-preset-btn').forEach(b => {
            b.className = "user-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
        });
        btn.className = "user-preset-btn active px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-600 bg-blue-50 text-blue-700 transition";

        activeUserRange = btn.dataset.range;
        renderUserActivityDetails();
    });
});

document.getElementById('btn-user-apply-dates')?.addEventListener('click', () => {
    const fromVal = document.getElementById('user-from-date')?.value;
    const toVal = document.getElementById('user-to-date')?.value;

    if (!fromVal || !toVal) return alert('Please specify both From and To dates.');
    if (fromVal > toVal) return alert('From date cannot be after To date.');

    activeUserRange = 'custom';
    activeUserCustomDates = { from: fromVal, to: toVal };

    document.querySelectorAll('.user-preset-btn').forEach(b => {
        b.className = "user-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
    });

    renderUserActivityDetails();
});

function filterUserSalesByRange(sales) {
    if (activeUserRange === 'all') return sales;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return sales.filter(s => {
        const saleDateStr = new Date(s.timestamp).toISOString().split('T')[0];

        if (activeUserRange === 'today') {
            return saleDateStr === todayStr;
        } else if (activeUserRange === 'yesterday') {
            const yest = new Date();
            yest.setDate(now.getDate() - 1);
            return saleDateStr === yest.toISOString().split('T')[0];
        } else if (activeUserRange === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return new Date(s.timestamp) >= weekAgo;
        } else if (activeUserRange === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            return saleDateStr >= startOfMonth;
        } else if (activeUserRange === 'custom') {
            return saleDateStr >= activeUserCustomDates.from && saleDateStr <= activeUserCustomDates.to;
        }
        return true;
    });
}

function renderUserActivityDetails() {
    const container = document.getElementById('user-transactions-container');
    const filtered = filterUserSalesByRange(activeUserTransactions);

    let grossSales = 0;
    let cashCollected = 0;
    let mpesaCollected = 0;
    let debtIssued = 0;
    let transactionsCount = 0;

    filtered.forEach(r => {
        if (!r.is_voided) {
            const amt = parseFloat(r.total_charged || 0);
            grossSales += amt;
            transactionsCount++;

            const m = (r.payment_method || '').toLowerCase();
            const s = (r.status || '').toLowerCase();

            if (s === 'debt' || m === 'debt') {
                debtIssued += amt;
            } else if (m.includes('cash')) {
                cashCollected += amt;
            } else if (m.includes('mpesa') || m.includes('m-pesa')) {
                mpesaCollected += amt;
            }
        }
    });

    // Compute wages received by this cashier in this period
    let wagesInPeriod = 0;
    if (activeUser) {
        allWagesData.forEach(w => {
            if (w.user_id === activeUser.id) {
                const wDateStr = w.work_date;
                let includeWage = false;
                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];

                if (activeUserRange === 'all') includeWage = true;
                else if (activeUserRange === 'today') includeWage = (wDateStr === todayStr);
                else if (activeUserRange === 'yesterday') {
                    const yest = new Date(); yest.setDate(now.getDate() - 1);
                    includeWage = (wDateStr === yest.toISOString().split('T')[0]);
                } else if (activeUserRange === 'week') {
                    const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
                    includeWage = (new Date(wDateStr) >= weekAgo);
                } else if (activeUserRange === 'month') {
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                    includeWage = (wDateStr >= startOfMonth);
                } else if (activeUserRange === 'custom') {
                    includeWage = (wDateStr >= activeUserCustomDates.from && wDateStr <= activeUserCustomDates.to);
                }

                if (includeWage) wagesInPeriod += parseFloat(w.wage_assigned || 0);
            }
        });
    }

    document.getElementById('user-kpi-sales').textContent = `KSh ${grossSales.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-cash').textContent = `KSh ${cashCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-mpesa').textContent = `KSh ${mpesaCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-debt').textContent = `KSh ${debtIssued.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-kpi-count').textContent = transactionsCount;
    document.getElementById('user-kpi-wages').textContent = `KSh ${wagesInPeriod.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('user-trans-count').textContent = `${filtered.length} records in selected period`;

    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <div class="text-3xl mb-1">📋</div>
                <div class="font-bold text-slate-700">No transactions recorded by this cashier in this period</div>
                <div class="text-xs text-slate-400 mt-1">Select a wider range or "All Time"</div>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(r => {
        const dateObj = new Date(r.timestamp);
        const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const isRepayment = r.status === 'debt_collection';
        const isDebt = r.status === 'debt' || (r.payment_method || '').toLowerCase() === 'debt';
        const itemName = isRepayment 
            ? '💳 DEBT REPAYMENT' 
            : (r.inventory?.name || 'Cyber Service');
        const qty = r.calculated_qty || 1;
        const total = parseFloat(r.total_charged || 0);
        const customerName = r.customers?.name || 'Walk-in Client';

        let badgeHtml = '';
        if (r.is_voided) {
            badgeHtml = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">VOIDED</span>';
        } else if (isRepayment) {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">DEBT REPAID</span>`;
        } else if (isDebt) {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700">DEBT SALE</span>`;
        } else {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${(r.payment_method || 'Cash').toUpperCase()}</span>`;
        }

        return `
            <div class="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col gap-2 transition ${r.is_voided ? 'opacity-60 bg-slate-50' : ''}">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-mono text-xs text-slate-500 font-bold">#${r.id.slice(0, 8)}</span>
                        ${badgeHtml}
                        <span class="text-xs text-slate-400 font-medium">${dateStr} at ${timeStr}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-base font-black ${isDebt ? 'text-red-600' : isRepayment ? 'text-emerald-600' : 'text-slate-900'}">
                            KSh ${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </span>
                    </div>
                </div>

                <div class="flex items-center justify-between text-xs py-1">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">${qty}x</span>
                        <span class="font-bold text-slate-800">${itemName}</span>
                        ${r.kyocera_pages > 0 ? `<span class="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">${r.kyocera_pages} prints</span>` : ''}
                    </div>
                    <div class="text-[11px] text-slate-500 font-medium">
                        Client: <strong class="text-slate-700">${customerName}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Close Modal
document.getElementById('btn-close-user-modal')?.addEventListener('click', () => {
    document.getElementById('modal-user-activity')?.classList.add('hidden');
});
document.getElementById('btn-close-user-bottom')?.addEventListener('click', () => {
    document.getElementById('modal-user-activity')?.classList.add('hidden');
});

// ====================================================================
// 5. GENERATE BRANDED CASHIER SALES REPORT (PDF)
// ====================================================================
document.getElementById('btn-download-user-pdf')?.addEventListener('click', generateCashierReportPDF);

function generateCashierReportPDF() {
    if (!activeUser || !window.jspdf) {
        return alert('PDF generator library not loaded or no active staff member selected.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const filtered = filterUserSalesByRange(activeUserTransactions);

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235); // Blue-600
    doc.text(storeSettings.company_name || "ESSIE CYBER SYSTEM", 14, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(storeSettings.tagline || "Printing, Photocopy, Stationery & Cyber Services", 14, 20);
    doc.text(`Staff Shift Reconciliation Report | Generated: ${new Date().toLocaleString()}`, 14, 24);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 28, 196, 28);

    // Cashier Details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text("CASHIER SHIFT SALES & PERFORMANCE AUDIT", 14, 35);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("CASHIER INFORMATION:", 14, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Staff Member: ${activeUser.username}`, 14, 47);
    doc.text(`Role: ${activeUser.role.toUpperCase()}`, 14, 52);
    doc.text(`Staff ID: #${activeUser.id.slice(0, 8)}`, 14, 57);

    // Period Details
    let rangeLabel = "All Recorded Activity";
    if (activeUserRange === 'today') rangeLabel = "Today Only";
    else if (activeUserRange === 'yesterday') rangeLabel = "Yesterday Only";
    else if (activeUserRange === 'week') rangeLabel = "Last 7 Days";
    else if (activeUserRange === 'month') rangeLabel = "Current Month";
    else if (activeUserRange === 'custom') rangeLabel = `${activeUserCustomDates.from} to ${activeUserCustomDates.to}`;

    doc.setFont("helvetica", "bold");
    doc.text("AUDIT PERIOD:", 120, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${rangeLabel}`, 120, 47);

    // Performance KPIs
    let grossSales = 0;
    let cashCollected = 0;
    let mpesaCollected = 0;
    let debtIssued = 0;
    let validCount = 0;

    filtered.forEach(r => {
        if (!r.is_voided) {
            const amt = parseFloat(r.total_charged || 0);
            grossSales += amt;
            validCount++;

            const m = (r.payment_method || '').toLowerCase();
            const s = (r.status || '').toLowerCase();

            if (s === 'debt' || m === 'debt') debtIssued += amt;
            else if (m.includes('cash')) cashCollected += amt;
            else if (m.includes('mpesa') || m.includes('m-pesa')) mpesaCollected += amt;
        }
    });

    doc.autoTable({
        startY: 62,
        head: [['Gross Sales Handled', 'Cash Drawer In', 'M-Pesa Till / Paybill', 'Credit (Debt) Issued', 'Transactions']],
        body: [[
            `KSh ${grossSales.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${cashCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${mpesaCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${debtIssued.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            validCount.toString()
        ]],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8.5, fontStyle: 'bold', halign: 'center', cellPadding: 3 },
        margin: { left: 14, right: 14 }
    });

    // Transactions Table
    const tableData = filtered.map(r => {
        const dateStr = new Date(r.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
        const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isRepayment = r.status === 'debt_collection';
        const isDebt = r.status === 'debt' || (r.payment_method || '').toLowerCase() === 'debt';
        const itemName = isRepayment ? 'Debt Repayment' : `${r.inventory?.name || 'Cyber Item'} (x${r.calculated_qty || 1})`;
        const client = r.customers?.name || 'Walk-in';
        const total = parseFloat(r.total_charged || 0);

        return [
            `${dateStr} ${timeStr}`,
            `#${r.id.slice(0, 8)}`,
            itemName,
            client,
            r.payment_method || 'Cash',
            r.is_voided ? 'VOIDED' : isDebt ? 'DEBT' : 'ACTIVE',
            `KSh ${total.toFixed(2)}`
        ];
    });

    doc.autoTable({
        startY: (doc.lastAutoTable?.finalY || 80) + 6,
        head: [['Time', 'Ref #', 'Cyber Service / Product', 'Customer', 'Method', 'Status', 'Total (KSh)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 20, fontStyle: 'bold' },
            2: { cellWidth: 55 },
            3: { cellWidth: 30 },
            4: { cellWidth: 18 },
            5: { cellWidth: 18 },
            6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    const finalY = (doc.lastAutoTable?.finalY || 200) + 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Official electronic staff sales reconciliation statement • Essie Cyber POS.", 14, finalY);

    const safeName = (activeUser.username || 'staff').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Shift_Sales_Report_${safeName}_${Date.now()}.pdf`);
}

// ====================================================================
// 6. STAFF PROFILE & ACCESS MODALS (PIN, Role, Add, Delete)
// ====================================================================
document.getElementById('btn-add-user')?.addEventListener('click', () => {
    showModal('Add New Staff Account', `
        <div class="space-y-3.5">
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Username</label>
                <input type="text" id="add-u-name" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-blue-500" placeholder="e.g. mercy">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">4-Digit Security PIN</label>
                <input type="password" maxlength="4" id="add-u-pin" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-center tracking-[0.5em] font-black text-xl text-slate-800 focus:outline-none focus:border-blue-500" placeholder="••••">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Role & Permissions</label>
                <select id="add-u-role" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500">
                    <option value="cashier">Cashier (POS & Sales only)</option>
                    <option value="admin">Administrator (Full Access)</option>
                </select>
            </div>
        </div>
    `, async (close) => {
        const username = document.getElementById('add-u-name').value.trim();
        const pin = document.getElementById('add-u-pin').value.trim();
        const role = document.getElementById('add-u-role').value;

        if (!username) throw new Error("Username is required");
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 numeric digits");

        const { error } = await supabase.from('users').insert([{
            username,
            pin,
            role
        }]);

        if (error) throw error;
        close();
        await loadUsers();
    }, 'Create Account');
});

function setPinModal(id, username) {
    showModal(`Reset PIN for ${username}`, `
        <p class="mb-3 text-sm text-slate-600">Enter a new 4-digit security PIN for <strong>${username}</strong>:</p>
        <input type="password" id="new-pin" maxlength="4" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-3 text-center tracking-[0.7em] font-black text-2xl text-slate-800 focus:outline-none focus:border-blue-500" placeholder="••••">
    `, async (close) => {
        const pin = document.getElementById('new-pin').value.trim();
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 numeric digits");

        const { error } = await supabase.from('users').update({ pin }).eq('id', id);
        if (error) throw error;

        alert(`Security PIN updated for ${username}!`);
        close();
        await loadUsers();
    }, 'Update PIN');
}

function editRoleModal(id, username, currentRole) {
    showModal(`Edit Role for ${username}`, `
        <div class="space-y-3">
            <p class="text-sm text-slate-600">Select system access role for <strong>${username}</strong>:</p>
            <select id="edit-role-select" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-blue-500">
                <option value="cashier" ${currentRole === 'cashier' ? 'selected' : ''}>Cashier</option>
                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Administrator</option>
            </select>
        </div>
    `, async (close) => {
        const role = document.getElementById('edit-role-select').value;
        const { error } = await supabase.from('users').update({ role }).eq('id', id);
        if (error) throw error;

        close();
        await loadUsers();
    }, 'Update Role');
}

function deleteUser(id, username) {
    showModal('Delete Staff Account', `
        <p class="text-sm text-slate-600">Are you sure you want to permanently delete staff member <strong>${username}</strong>?</p>
        <p class="text-xs text-red-500 mt-1">This will prevent them from logging into the POS terminal.</p>
    `, async (close) => {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw error;

        close();
        await loadUsers();
    }, 'Delete User');
}

// Initial Boot
loadStoreSettings();
loadUsers();
