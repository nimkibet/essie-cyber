import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';

requireAuth();
if (currentUser && currentUser.role !== 'admin') {
    window.location.href = '/pos.html';
}

// Global Module State
let customers = [];
let salesData = [];
let activeCustomer = null;
let activeStatementRange = 'all'; // 'all', 'today', 'week', 'month', 'custom'
let activeCustomDates = { from: '', to: '' };

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

// Ensure Debt Repayment service item ID is cached
let debtRepaymentItemId = null;
async function ensureDebtRepaymentItemId() {
    if (debtRepaymentItemId) return debtRepaymentItemId;
    try {
        const { data } = await supabase.from('inventory').select('id').eq('name', 'DEBT REPAYMENT').single();
        if (data) {
            debtRepaymentItemId = data.id;
            return data.id;
        }
        const { data: anyService } = await supabase.from('inventory').select('id').eq('is_service', true).limit(1);
        if (anyService && anyService.length > 0) {
            debtRepaymentItemId = anyService[0].id;
            return debtRepaymentItemId;
        }
    } catch (e) {
        console.warn('Could not fetch debt repayment item id:', e);
    }
    return null;
}

// ====================================================================
// 1. DATA LOADING & KPI AGGREGATION
// ====================================================================
async function loadCustomers() {
    const tbody = document.getElementById('cust-tbody');
    try {
        // Fetch all registered customers
        const { data: custList, error: custErr } = await supabase
            .from('customers')
            .select('*')
            .order('name');

        if (custErr) throw custErr;
        customers = custList || [];

        // Fetch customer-linked sales to compute purchase volumes & visit frequency
        const { data: sales, error: salesErr } = await supabase
            .from('sales_log')
            .select('id, total_charged, calculated_qty, payment_method, status, is_voided, customer_id, timestamp');

        if (!salesErr && sales) {
            salesData = sales;
        }

        renderKPICards();
        renderCustomersTable();

    } catch (err) {
        console.error('Error loading customers:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500 font-bold">Failed to load customers: ${err.message}</td></tr>`;
        }
    }
}

function computeCustomerPurchases(customerId) {
    let totalPurchases = 0;
    let visitCount = 0;

    salesData.forEach(s => {
        if (s.customer_id === customerId && !s.is_voided && s.status !== 'debt_collection') {
            totalPurchases += parseFloat(s.total_charged || 0);
            visitCount++;
        }
    });

    return { totalPurchases, visitCount };
}

function renderKPICards() {
    const kpiTotalCust = document.getElementById('kpi-total-cust');
    const kpiTotalDebt = document.getElementById('kpi-total-debt');
    const kpiDebtorsCount = document.getElementById('kpi-debtors-count');
    const kpiTotalPurchased = document.getElementById('kpi-total-purchased');

    let totalDebt = 0;
    let debtorsCount = 0;
    let lifetimePurchases = 0;

    customers.forEach(c => {
        const debt = parseFloat(c.outstanding_debt || 0);
        if (debt > 0) {
            totalDebt += debt;
            debtorsCount++;
        }
    });

    salesData.forEach(s => {
        if (s.customer_id && !s.is_voided && s.status !== 'debt_collection') {
            lifetimePurchases += parseFloat(s.total_charged || 0);
        }
    });

    if (kpiTotalCust) kpiTotalCust.textContent = customers.length;
    if (kpiTotalDebt) kpiTotalDebt.textContent = `KSh ${totalDebt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (kpiDebtorsCount) kpiDebtorsCount.textContent = debtorsCount;
    if (kpiTotalPurchased) kpiTotalPurchased.textContent = `KSh ${lifetimePurchases.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// ====================================================================
// 2. SEARCH, FILTER & TABLE RENDERING
// ====================================================================
function renderCustomersTable() {
    const tbody = document.getElementById('cust-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('cust-search')?.value || '').trim().toLowerCase();
    const filterStatus = document.getElementById('cust-filter-status')?.value || 'all';
    const sortBy = document.getElementById('cust-sort')?.value || 'name-asc';

    let list = customers.filter(c => {
        const matchSearch = !searchTerm || 
            (c.name && c.name.toLowerCase().includes(searchTerm)) || 
            (c.phone && c.phone.includes(searchTerm));

        const debt = parseFloat(c.outstanding_debt || 0);
        let matchFilter = true;
        if (filterStatus === 'debt') matchFilter = debt > 0;
        else if (filterStatus === 'cleared') matchFilter = debt <= 0;

        return matchSearch && matchFilter;
    });

    // Sorting
    list.sort((a, b) => {
        const debtA = parseFloat(a.outstanding_debt || 0);
        const debtB = parseFloat(b.outstanding_debt || 0);
        const purchA = computeCustomerPurchases(a.id).totalPurchases;
        const purchB = computeCustomerPurchases(b.id).totalPurchases;

        if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'debt-high') return debtB - debtA;
        if (sortBy === 'debt-low') return debtA - debtB;
        if (sortBy === 'purchases-high') return purchB - purchA;
        return 0;
    });

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-16 text-center text-slate-400">
                    <div class="text-3xl mb-1">🔍</div>
                    <div class="font-bold text-slate-700">No customers found</div>
                    <div class="text-xs text-slate-400 mt-1">${searchTerm ? `No matches for "${searchTerm}"` : 'Register a customer to begin tracking credit'}</div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => {
        const debt = parseFloat(c.outstanding_debt || 0);
        const { totalPurchases, visitCount } = computeCustomerPurchases(c.id);

        let debtBadgeHtml = '';
        if (debt > 0) {
            debtBadgeHtml = `<span class="px-2.5 py-1 rounded-lg text-xs font-black bg-red-100 text-red-700">KSh ${debt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>`;
        } else {
            debtBadgeHtml = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">Cleared (0.00)</span>`;
        }

        const nameSafe = (c.name || '').replace(/'/g, "\\'");
        const phoneSafe = (c.phone || '').replace(/'/g, "\\'");

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3.5 px-4">
                    <div class="font-black text-slate-900 text-base leading-snug">${c.name}</div>
                    <div class="text-[11px] text-slate-400 font-mono mt-0.5">ID: #${c.id.slice(0, 8)}</div>
                </td>
                <td class="py-3.5 px-4 font-mono font-bold text-xs sm:text-sm text-slate-700">
                    ${c.phone || '<span class="text-slate-300 font-normal">None</span>'}
                </td>
                <td class="py-3.5 px-4 text-right">
                    <div class="font-black text-slate-900 text-sm sm:text-base">KSh ${totalPurchases.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="text-[11px] text-slate-500 font-medium">${visitCount} transaction${visitCount === 1 ? '' : 's'}</div>
                </td>
                <td class="py-3.5 px-4 text-right">
                    ${debtBadgeHtml}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                        <button class="btn-cust-stmt px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-sm" data-id="${c.id}">
                            <span>📋</span> Statement
                        </button>
                        ${debt > 0 ? `
                            <button class="btn-quick-repay px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-sm" data-id="${c.id}" data-name="${nameSafe}" data-bal="${debt}">
                                <span>💰</span> Pay Debt
                            </button>
                        ` : ''}
                        <button class="btn-edit-cust px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition" data-id="${c.id}" data-name="${nameSafe}" data-phone="${phoneSafe}" data-debt="${debt}" title="Edit customer">
                            ✏️
                        </button>
                        <button class="btn-del-cust px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs transition" data-id="${c.id}" data-name="${nameSafe}" data-debt="${debt}" title="Delete account">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach Event Listeners
    tbody.querySelectorAll('.btn-cust-stmt').forEach(btn => {
        btn.addEventListener('click', () => openCustomerStatement(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-quick-repay').forEach(btn => {
        btn.addEventListener('click', () => openRepaymentModal(btn.dataset.id, btn.dataset.name, parseFloat(btn.dataset.bal || 0)));
    });

    tbody.querySelectorAll('.btn-edit-cust').forEach(btn => {
        btn.addEventListener('click', () => {
            editCustomer(btn.dataset.id, btn.dataset.name, btn.dataset.phone, parseFloat(btn.dataset.debt || 0));
        });
    });

    tbody.querySelectorAll('.btn-del-cust').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteCustomer(btn.dataset.id, btn.dataset.name, parseFloat(btn.dataset.debt || 0));
        });
    });
}

// Search input handling
const custSearchInput = document.getElementById('cust-search');
const btnClearSearch = document.getElementById('btn-clear-search');

custSearchInput?.addEventListener('input', () => {
    if (btnClearSearch) {
        btnClearSearch.classList.toggle('hidden', !custSearchInput.value.trim());
    }
    renderCustomersTable();
});

btnClearSearch?.addEventListener('click', () => {
    custSearchInput.value = '';
    btnClearSearch.classList.add('hidden');
    custSearchInput.focus();
    renderCustomersTable();
});

document.getElementById('cust-filter-status')?.addEventListener('change', renderCustomersTable);
document.getElementById('cust-sort')?.addEventListener('change', renderCustomersTable);

// ====================================================================
// 3. CUSTOMER ACTIVITY & STATEMENT MODAL (Itemized Debt Breakdown)
// ====================================================================
let customerTransactions = [];

async function openCustomerStatement(customerId) {
    activeCustomer = customers.find(c => c.id === customerId);
    if (!activeCustomer) return;

    const modal = document.getElementById('modal-cust-activity');
    const nameLabel = document.getElementById('stmt-cust-name');
    const phoneLabel = document.getElementById('stmt-cust-phone');
    const debtBadge = document.getElementById('stmt-debt-badge');

    if (nameLabel) nameLabel.textContent = activeCustomer.name;
    if (phoneLabel) phoneLabel.textContent = `Tel: ${activeCustomer.phone || 'No phone recorded'}`;

    const debt = parseFloat(activeCustomer.outstanding_debt || 0);
    if (debtBadge) {
        debtBadge.textContent = debt > 0 ? `Outstanding Debt: KSh ${debt.toFixed(2)}` : 'Debt Free';
        debtBadge.className = debt > 0 ? "px-2.5 py-0.5 rounded-md text-xs font-black bg-red-100 text-red-700" : "px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800";
    }

    // Reset date range presets to "All Time"
    activeStatementRange = 'all';
    document.querySelectorAll('.stmt-preset-btn').forEach(btn => {
        btn.className = btn.dataset.range === 'all' 
            ? "stmt-preset-btn active px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-600 bg-blue-50 text-blue-700 transition"
            : "stmt-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
    });

    const container = document.getElementById('stmt-transactions-container');
    if (container) {
        container.innerHTML = '<div class="py-12 text-center text-slate-400 font-semibold text-sm">Loading activity ledger & itemized debt history...</div>';
    }

    modal?.classList.remove('hidden');

    try {
        // Query all sales, debt purchases, and debt repayments for this customer
        const { data, error } = await supabase
            .from('sales_log')
            .select('id, total_charged, calculated_qty, payment_method, status, timestamp, is_voided, kyocera_pages, inventory(id, name, category, selling_price), users:users!sales_log_cashier_id_fkey(username)')
            .eq('customer_id', customerId)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        customerTransactions = data || [];

        renderStatementDetails();

    } catch (err) {
        console.error('Failed to load customer transactions:', err);
        if (container) {
            container.innerHTML = `<div class="p-6 text-center text-red-500 font-bold">Failed to load transactions: ${err.message}</div>`;
        }
    }
}

// Preset range buttons inside statement modal
document.querySelectorAll('.stmt-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.stmt-preset-btn').forEach(b => {
            b.className = "stmt-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
        });
        btn.className = "stmt-preset-btn active px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-600 bg-blue-50 text-blue-700 transition";

        activeStatementRange = btn.dataset.range;
        renderStatementDetails();
    });
});

document.getElementById('btn-stmt-apply-dates')?.addEventListener('click', () => {
    const fromVal = document.getElementById('stmt-from-date')?.value;
    const toVal = document.getElementById('stmt-to-date')?.value;

    if (!fromVal || !toVal) return alert('Please specify both From and To dates.');
    if (fromVal > toVal) return alert('From date cannot be after To date.');

    activeStatementRange = 'custom';
    activeCustomDates = { from: fromVal, to: toVal };

    document.querySelectorAll('.stmt-preset-btn').forEach(b => {
        b.className = "stmt-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition";
    });

    renderStatementDetails();
});

function filterTransactionsByRange(transactions) {
    if (activeStatementRange === 'all') return transactions;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return transactions.filter(t => {
        const itemDateStr = new Date(t.timestamp).toISOString().split('T')[0];

        if (activeStatementRange === 'today') {
            return itemDateStr === todayStr;
        } else if (activeStatementRange === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return new Date(t.timestamp) >= weekAgo;
        } else if (activeStatementRange === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            return itemDateStr >= startOfMonth;
        } else if (activeStatementRange === 'custom') {
            return itemDateStr >= activeCustomDates.from && itemDateStr <= activeCustomDates.to;
        }
        return true;
    });
}

function renderStatementDetails() {
    const container = document.getElementById('stmt-transactions-container');
    const filtered = filterTransactionsByRange(customerTransactions);

    let periodPurchases = 0;
    let periodDebts = 0;
    let periodRepayments = 0;

    filtered.forEach(r => {
        const total = parseFloat(r.total_charged || 0);
        if (!r.is_voided) {
            if (r.status === 'debt_collection') {
                periodRepayments += total;
            } else if (r.status === 'debt' || (r.payment_method || '').toLowerCase() === 'debt') {
                periodDebts += total;
            } else {
                periodPurchases += total;
            }
        }
    });

    const currentBal = parseFloat(activeCustomer.outstanding_debt || 0);

    document.getElementById('stmt-kpi-purchases').textContent = `KSh ${periodPurchases.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('stmt-kpi-debts').textContent = `KSh ${periodDebts.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('stmt-kpi-repaid').textContent = `KSh ${periodRepayments.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('stmt-kpi-current-balance').textContent = `KSh ${currentBal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('stmt-trans-count').textContent = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`;

    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <div class="text-3xl mb-1">📋</div>
                <div class="font-bold text-slate-700">No transactions found for this period</div>
                <div class="text-xs text-slate-400 mt-1">Select a wider date range or click "All Time"</div>
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
        const cashier = r.users?.username || 'Staff';

        let badgeHtml = '';
        if (r.is_voided) {
            badgeHtml = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">VOIDED</span>';
        } else if (isRepayment) {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">DEBT REPAID (${r.payment_method})</span>`;
        } else if (isDebt) {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700">TAKEN ON CREDIT / DEBT</span>`;
        } else {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${(r.payment_method || 'Cash').toUpperCase()} SALE</span>`;
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
                        <span class="text-xs text-slate-400 font-medium mr-1">Amount:</span>
                        <span class="text-base font-black ${isDebt ? 'text-red-600' : isRepayment ? 'text-emerald-600' : 'text-slate-900'}">
                            ${isRepayment ? '-' : ''}KSh ${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </span>
                    </div>
                </div>

                <!-- Exact Item Details -->
                <div class="flex items-center justify-between text-xs py-1">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">${qty}x</span>
                        <span class="font-bold text-slate-800 text-sm">${itemName}</span>
                        ${r.kyocera_pages > 0 ? `<span class="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">${r.kyocera_pages} prints</span>` : ''}
                    </div>
                    <div class="text-[11px] text-slate-400">
                        Cashier: <strong class="text-slate-700">${cashier}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Modal Close Handlers
document.getElementById('btn-close-stmt-modal')?.addEventListener('click', () => {
    document.getElementById('modal-cust-activity')?.classList.add('hidden');
});
document.getElementById('btn-close-stmt-bottom')?.addEventListener('click', () => {
    document.getElementById('modal-cust-activity')?.classList.add('hidden');
});

// ====================================================================
// 4. GENERATE BRANDED CUSTOMER STATEMENT (PDF)
// ====================================================================
document.getElementById('btn-download-cust-pdf')?.addEventListener('click', generateCustomerStatementPDF);

function generateCustomerStatementPDF() {
    if (!activeCustomer || !window.jspdf) {
        return alert('PDF generator library not loaded or no active customer.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const filtered = filterTransactionsByRange(customerTransactions);

    // Store Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235); // Blue-600
    doc.text(storeSettings.company_name || "ESSIE CYBER SYSTEM", 14, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(storeSettings.tagline || "Printing, Photocopy, Stationery & Cyber Services", 14, 20);
    doc.text(`Tel: ${storeSettings.phone_contact || '+254 700 000 000'} | Location: ${storeSettings.location_address || 'Main Branch'}`, 14, 24);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 28, 196, 28);

    // Statement Title & Customer Details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text("CUSTOMER ACCOUNT STATEMENT & DEBT LEDGER", 14, 35);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("CUSTOMER DETAILS:", 14, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${activeCustomer.name}`, 14, 47);
    doc.text(`Phone: ${activeCustomer.phone || 'N/A'}`, 14, 52);
    doc.text(`Customer ID: #${activeCustomer.id.slice(0, 8)}`, 14, 57);

    // Period Details
    let rangeLabel = "All Recorded Activity";
    if (activeStatementRange === 'today') rangeLabel = "Today Only";
    else if (activeStatementRange === 'week') rangeLabel = "Last 7 Days";
    else if (activeStatementRange === 'month') rangeLabel = "Current Month";
    else if (activeStatementRange === 'custom') rangeLabel = `${activeCustomDates.from} to ${activeCustomDates.to}`;

    doc.setFont("helvetica", "bold");
    doc.text("STATEMENT PERIOD:", 120, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${rangeLabel}`, 120, 47);
    doc.text(`Date Generated: ${new Date().toLocaleString()}`, 120, 52);

    // Financial KPI Summary Box
    let periodPurchases = 0;
    let periodDebts = 0;
    let periodRepayments = 0;

    filtered.forEach(r => {
        const total = parseFloat(r.total_charged || 0);
        if (!r.is_voided) {
            if (r.status === 'debt_collection') periodRepayments += total;
            else if (r.status === 'debt' || (r.payment_method || '').toLowerCase() === 'debt') periodDebts += total;
            else periodPurchases += total;
        }
    });

    const currentBal = parseFloat(activeCustomer.outstanding_debt || 0);

    doc.autoTable({
        startY: 62,
        head: [['Direct Purchases', 'Debts Taken (Credit)', 'Repayments Made', 'Closing Balance Due']],
        body: [[
            `KSh ${periodPurchases.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${periodDebts.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${periodRepayments.toLocaleString(undefined, {minimumFractionDigits: 2})}`,
            `KSh ${currentBal.toLocaleString(undefined, {minimumFractionDigits: 2})}`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 9, fontStyle: 'bold', halign: 'center', cellPadding: 3 },
        margin: { left: 14, right: 14 }
    });

    // Itemized Transactions Table
    const tableData = filtered.map(r => {
        const isDebt = r.status === 'debt' || (r.payment_method || '').toLowerCase() === 'debt';
        const isRepayment = r.status === 'debt_collection';
        const total = parseFloat(r.total_charged || 0);
        const itemName = isRepayment 
            ? 'Debt Repayment Received' 
            : `${r.inventory?.name || 'Cyber Service'} (x${r.calculated_qty || 1})`;

        const dateStr = new Date(r.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
        const typeStr = r.is_voided ? 'VOIDED' : isRepayment ? 'Repayment' : isDebt ? 'DEBT TAKEN' : 'Cash/M-Pesa';
        const debitStr = (isDebt && !r.is_voided) ? total.toFixed(2) : (!isRepayment && !r.is_voided) ? total.toFixed(2) : '-';
        const creditStr = (isRepayment && !r.is_voided) ? total.toFixed(2) : '-';

        return [
            dateStr,
            `#${r.id.slice(0, 8)}`,
            itemName,
            typeStr,
            r.payment_method || 'Cash',
            debitStr,
            creditStr
        ];
    });

    doc.autoTable({
        startY: (doc.lastAutoTable?.finalY || 80) + 6,
        head: [['Date', 'Ref #', 'Cyber Services & Products Taken / Repaid', 'Type', 'Method', 'Debit (KSh)', 'Credit (KSh)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 22, fontStyle: 'bold' },
            2: { cellWidth: 70 },
            3: { cellWidth: 20 },
            4: { cellWidth: 18 },
            5: { cellWidth: 22, halign: 'right' },
            6: { cellWidth: 22, halign: 'right' }
        },
        margin: { left: 14, right: 14 }
    });

    const finalY = (doc.lastAutoTable?.finalY || 200) + 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Official electronic statement generated by Essie Cyber POS.", 14, finalY);

    const safeCustName = (activeCustomer.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Essie_Statement_${safeCustName}_${Date.now()}.pdf`);
}

// ====================================================================
// 5. DEBT REPAYMENT WORKFLOW
// ====================================================================
let repayCustomerId = null;

function openRepaymentModal(id, name, currentBalance) {
    if (currentBalance <= 0) {
        return alert(`Customer "${name}" has no outstanding balance (Debt is KSh 0.00).`);
    }

    repayCustomerId = id;
    const modal = document.getElementById('modal-repay-debt');
    const nameLabel = document.getElementById('repay-cust-name-label');
    const balLabel = document.getElementById('repay-cust-bal-label');
    const amtInput = document.getElementById('repay-amount-input');
    const notesInput = document.getElementById('repay-notes-input');

    if (nameLabel) nameLabel.textContent = name;
    if (balLabel) balLabel.textContent = `KSh ${currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (amtInput) {
        amtInput.value = currentBalance > 0 ? currentBalance : '';
        amtInput.max = currentBalance;
        amtInput.placeholder = `Max KSh ${currentBalance.toFixed(2)}`;
    }
    if (notesInput) notesInput.value = '';

    modal?.classList.remove('hidden');
    setTimeout(() => amtInput?.focus(), 150);
}

document.getElementById('btn-modal-repay-debt')?.addEventListener('click', () => {
    if (!activeCustomer) return;
    openRepaymentModal(activeCustomer.id, activeCustomer.name, parseFloat(activeCustomer.outstanding_debt || 0));
});

document.getElementById('btn-repay-full')?.addEventListener('click', () => {
    const cust = customers.find(c => c.id === repayCustomerId);
    if (cust) document.getElementById('repay-amount-input').value = parseFloat(cust.outstanding_debt || 0);
});

document.getElementById('btn-repay-half')?.addEventListener('click', () => {
    const cust = customers.find(c => c.id === repayCustomerId);
    if (cust) document.getElementById('repay-amount-input').value = (parseFloat(cust.outstanding_debt || 0) / 2).toFixed(2);
});

document.getElementById('btn-close-repay-modal')?.addEventListener('click', () => {
    document.getElementById('modal-repay-debt')?.classList.add('hidden');
});
document.getElementById('btn-cancel-repay')?.addEventListener('click', () => {
    document.getElementById('modal-repay-debt')?.classList.add('hidden');
});

document.getElementById('btn-submit-repayment')?.addEventListener('click', async () => {
    const cust = customers.find(c => c.id === repayCustomerId);
    if (!cust) return alert('Customer not found');

    const amt = parseFloat(document.getElementById('repay-amount-input').value || 0);
    const method = document.getElementById('repay-method-select').value;
    const notes = document.getElementById('repay-notes-input').value.trim();

    if (amt <= 0) return alert('Enter a valid payment amount greater than zero');

    const currentDebt = parseFloat(cust.outstanding_debt || 0);
    if (currentDebt <= 0) {
        return alert(`Customer "${cust.name}" has no outstanding balance to repay.`);
    }

    if (amt > currentDebt) {
        return alert(`Payment amount (KSh ${amt.toFixed(2)}) cannot exceed the outstanding debt of KSh ${currentDebt.toFixed(2)}.`);
    }

    const newDebt = Math.max(0, currentDebt - amt);
    const btn = document.getElementById('btn-submit-repayment');
    btn.disabled = true;
    btn.innerHTML = 'Processing Payment...';

    try {
        const repaymentItemId = await ensureDebtRepaymentItemId();

        const logRow = {
            item_id: repaymentItemId,
            total_charged: amt,
            calculated_qty: 1,
            quantity: 1,
            calculated_profit: 0,
            cashier_id: currentUser ? currentUser.id : null,
            customer_id: cust.id,
            payment_method: method.toLowerCase(),
            status: 'debt_collection',
            timestamp: new Date().toISOString()
        };

        const { error: logErr } = await supabase.from('sales_log').insert([logRow]);
        if (logErr) throw logErr;

        const { error: updErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', cust.id);
        if (updErr) throw updErr;

        cust.outstanding_debt = newDebt;
        document.getElementById('modal-repay-debt')?.classList.add('hidden');

        alert(`Payment of KSh ${amt.toFixed(2)} recorded! New Balance: KSh ${newDebt.toFixed(2)}`);

        await loadCustomers();
        if (activeCustomer && activeCustomer.id === cust.id) {
            openCustomerStatement(cust.id);
        }

    } catch (err) {
        alert('Failed to record repayment: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '✓ Confirm Payment';
    }
});

// ====================================================================
// 6. ADD, EDIT & DELETE CUSTOMER
// ====================================================================
document.getElementById('btn-add-cust')?.addEventListener('click', () => {
    showModal('Register New Cyber Customer', `
        <div class="space-y-3.5">
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Customer Full Name</label>
                <input type="text" id="add-c-name" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-blue-500" placeholder="e.g. Mary Wanjiku">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Phone Number</label>
                <input type="tel" id="add-c-phone" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-slate-800 focus:outline-none focus:border-blue-500" placeholder="e.g. 0712 345 678">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Initial Opening Debt (KSh)</label>
                <input type="number" id="add-c-debt" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-blue-500" value="0" min="0">
            </div>
        </div>
    `, async (close) => {
        const name = document.getElementById('add-c-name').value.trim();
        const phone = document.getElementById('add-c-phone').value.trim();
        const initialDebt = parseFloat(document.getElementById('add-c-debt').value || 0);

        if (!name) throw new Error("Customer name is required");

        const { error } = await supabase.from('customers').insert([{
            name,
            phone,
            outstanding_debt: initialDebt
        }]);

        if (error) throw error;
        close();
        await loadCustomers();
    }, 'Register Customer');
});

function editCustomer(id, name, phone, debt) {
    const safeName = (name || '').replace(/"/g, '&quot;');
    const safePhone = (phone || '').replace(/"/g, '&quot;');

    showModal('Edit Customer Profile', `
        <div class="space-y-3.5">
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Full Name</label>
                <input type="text" id="edit-c-name" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-blue-500" value="${safeName}">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Phone Number</label>
                <input type="tel" id="edit-c-phone" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-semibold text-sm text-slate-800 focus:outline-none focus:border-blue-500" value="${safePhone}">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Outstanding Balance (KSh)</label>
                <input type="number" id="edit-c-debt" class="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-blue-500" value="${debt}" step="any">
            </div>
        </div>
    `, async (close) => {
        const newName = document.getElementById('edit-c-name').value.trim();
        if (!newName) throw new Error("Name is required");

        const { error } = await supabase.from('customers').update({
            name: newName,
            phone: document.getElementById('edit-c-phone').value.trim(),
            outstanding_debt: parseFloat(document.getElementById('edit-c-debt').value || 0)
        }).eq('id', id);

        if (error) throw error;
        close();
        await loadCustomers();
    }, 'Save Changes');
}

function deleteCustomer(id, name, debt) {
    if (debt > 0) {
        return alert(`Cannot delete customer "${name}" because they have an active outstanding debt of KSh ${debt.toFixed(2)}. Please clear the debt balance first.`);
    }

    showModal('Delete Customer Account', `
        <p class="text-sm text-slate-600">Are you sure you want to permanently delete customer <strong>${name}</strong>?</p>
        <p class="text-xs text-red-500 mt-1">This action cannot be undone.</p>
    `, async (close) => {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        close();
        await loadCustomers();
    }, 'Delete Customer');
}

// Initial boot
loadStoreSettings();
loadCustomers();
