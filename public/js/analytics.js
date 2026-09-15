import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
if (currentUser && currentUser.role !== 'admin') window.location.href = '/pos.html';

let currentSalesData = [];
let periodStr = 'today';

let userChartInstance = null;
let methodChartInstance = null;
let itemsChartInstance = null;

async function load() {
    periodStr = document.getElementById('ana-period').value;
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let dateFilter = periodStr === 'month' ? ym : d.toISOString().split('T')[0];

    // 1. Fetch Sales
    let q = supabase.from('sales_log').select('*, inventory(name), users!sales_log_cashier_id_fkey(username)').eq('is_voided', false);
    if (periodStr === 'month') q = q.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    else q = q.gte('timestamp', `${dateFilter}T00:00:00Z`);

    // 2. Fetch Opened Resources
    let resQ = supabase.from('resources').select('cost, status');
    if (periodStr === 'month') resQ = resQ.gte('opened_at', `${dateFilter}-01T00:00:00Z`);
    else resQ = resQ.gte('opened_at', `${dateFilter}T00:00:00Z`);

    // 3. Fetch Fixed Overheads
    let ovQ = supabase.from('overhead_entries').select('rent, electricity, wifi_internet');
    if (periodStr === 'month') ovQ = ovQ.eq('period', ym);
    else ovQ = ovQ.gte('created_at', `${dateFilter}T00:00:00Z`);

    // 4. Fetch Daily Expenses
    let expQ = supabase.from('expenses').select('amount');
    if (periodStr === 'month') expQ = expQ.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    else expQ = expQ.gte('timestamp', `${dateFilter}T00:00:00Z`);

    const [ {data: s}, {data: resData}, {data: ovData}, {data: expData} ] = await Promise.all([q, resQ, ovQ, expQ]);
    
    currentSalesData = s || [];
    const resources = resData || [];
    const overheads = ovData || [];
    const dailyExpenses = expData || [];

    const includeBulk = document.getElementById('chk-include-bulk').checked;

    // Calculate Expenses
    let totalExpenses = 0;
    
    // Always include daily POS expenses
    dailyExpenses.forEach(e => totalExpenses += (e.amount || 0));

    if (includeBulk) {
        resources.forEach(r => totalExpenses += (r.cost || 0));
        overheads.forEach(o => {
            totalExpenses += (o.rent || 0) + (o.electricity || 0) + (o.wifi_internet || 0);
        });
    }

    document.getElementById('kpi-tx').innerText = currentSalesData.length;
    let rev = 0, grossProf = 0;
    
    const items = {};
    const userRevenue = {};
    const methodRevenue = { cash: 0, mpesa: 0 };

    currentSalesData.forEach(x => {
        rev += x.total_charged;
        grossProf += x.calculated_profit;
        
        const n = x.inventory?.name || 'Unknown';
        if (!items[n]) items[n] = 0;
        items[n] += x.calculated_qty;

        const user = x.users?.username || 'Unknown';
        if (!userRevenue[user]) userRevenue[user] = 0;
        userRevenue[user] += x.total_charged;
        
        if (x.payment_method === 'cash') methodRevenue.cash += x.total_charged;
        else if (x.payment_method === 'mpesa') methodRevenue.mpesa += x.total_charged;
    });

    const netProfit = grossProf - totalExpenses;

    document.getElementById('kpi-rev').innerText = `Ksh ${rev.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    document.getElementById('kpi-exp').innerText = `Ksh ${totalExpenses.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    document.getElementById('kpi-profit').innerText = `Ksh ${netProfit.toLocaleString(undefined, {maximumFractionDigits:0})}`;

    // Update User Leaderboard Table
    const sortedUsers = Object.entries(userRevenue).sort((a, b) => b[1] - a[1]);
    const utb = document.getElementById('user-tbody');
    utb.innerHTML = '';
    sortedUsers.forEach(u => {
        utb.innerHTML += `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="py-2 px-3 font-medium text-slate-700 capitalize">${u[0]}</td><td class="py-2 px-3 text-right font-bold text-slate-600">Ksh ${u[1].toLocaleString(undefined, {maximumFractionDigits:0})}</td></tr>`;
    });

    // Update Charts
    updateCharts(userRevenue, methodRevenue, items);
}

function updateCharts(userRevenue, methodRevenue, items) {
    const sortedItems = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 10);
    
    const userCtx = document.getElementById('userChart');
    if (userChartInstance) userChartInstance.destroy();
    userChartInstance = new Chart(userCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(userRevenue).map(n => n.charAt(0).toUpperCase() + n.slice(1)),
            datasets: [{
                label: 'Revenue (Ksh)',
                data: Object.values(userRevenue),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const methodCtx = document.getElementById('methodChart');
    if (methodChartInstance) methodChartInstance.destroy();
    methodChartInstance = new Chart(methodCtx, {
        type: 'doughnut',
        data: {
            labels: ['M-Pesa', 'Cash'],
            datasets: [{
                data: [methodRevenue.mpesa, methodRevenue.cash],
                backgroundColor: ['#10b981', '#3b82f6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const itemsCtx = document.getElementById('itemsChart');
    if (itemsChartInstance) itemsChartInstance.destroy();
    itemsChartInstance = new Chart(itemsCtx, {
        type: 'bar',
        data: {
            labels: sortedItems.map(i => i[0].length > 15 ? i[0].substring(0, 15) + '...' : i[0]),
            datasets: [{
                label: 'Units Sold',
                data: sortedItems.map(i => i[1]),
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 4
            }]
        },
        options: { 
            indexAxis: 'y',
            responsive: true, 
            maintainAspectRatio: false 
        }
    });
}

document.getElementById('ana-period').addEventListener('change', load);
document.getElementById('chk-include-bulk').addEventListener('change', load);

document.getElementById('btn-dl-report').addEventListener('click', () => {
    if (currentSalesData.length === 0) return alert('No data to generate report.');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Essie Cyber POS", 14, 20);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    const reportTitle = periodStr === 'today' ? "Daily Sales Report" : "Monthly Sales Report";
    doc.text(`${reportTitle} - ${new Date().toLocaleDateString()}`, 130, 20);
    
    let rev = 0, grossProf = 0;
    currentSalesData.forEach(x => { rev += x.total_charged; grossProf += x.calculated_profit; });
    
    // We don't recalculate expenses here, we could re-query but for simplicity we rely on UI state for now, 
    // or we just show gross profit in the PDF to keep it simple. Let's just show Gross Profit in the PDF.
    
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Executive Summary", 14, 45);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Transactions: ${currentSalesData.length}`, 14, 55);
    doc.text(`Gross Revenue: Ksh ${rev.toLocaleString()}`, 14, 62);
    doc.text(`Gross Profit: Ksh ${grossProf.toLocaleString()}`, 14, 69);
    
    const tableData = currentSalesData.map(s => [
        new Date(s.timestamp).toLocaleTimeString(),
        s.inventory?.name || 'Unknown',
        s.calculated_qty,
        `Ksh ${s.total_charged.toLocaleString()}`,
        s.payment_method,
        s.users?.username || 'System'
    ]);
    
    doc.autoTable({
        startY: 80,
        head: [['Time', 'Item / Service', 'Qty', 'Revenue', 'Payment', 'Cashier']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { font: 'helvetica', fontSize: 9 },
        margin: { top: 35 }
    });
    
    const finalY = doc.lastAutoTable.finalY || 80;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated by Essie Cyber System on ${new Date().toLocaleString()}`, 14, finalY + 15);
    
    const filename = periodStr === 'today' ? `Daily_Report_${new Date().toISOString().split('T')[0]}.pdf` : `Monthly_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
});

load();
