import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();
if (currentUser && currentUser.role !== 'admin') window.location.href = '/pos.html';

let currentSalesData = [];
let currentResources = [];
let currentOverheads = [];
let currentDailyExpenses = [];
let currentTotalExpenses = 0;
let periodStr = 'today';

let userChartInstance = null;
let methodChartInstance = null;
let itemsChartInstance = null;

async function load() {
    periodStr = document.getElementById('ana-period').value;
    const dateInput = document.getElementById('ana-date');
    
    if (periodStr === 'custom') {
        dateInput.classList.remove('hidden');
        if (!dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    } else {
        dateInput.classList.add('hidden');
    }

    const d = periodStr === 'custom' && dateInput.value ? new Date(dateInput.value) : new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let dateFilter = periodStr === 'month' ? ym : d.toISOString().split('T')[0];
    
    let nextDate = new Date(d);
    nextDate.setDate(nextDate.getDate() + 1);
    let nextDateStr = nextDate.toISOString().split('T')[0];

    // 1. Fetch Sales
    let q = supabase.from('sales_log').select('*, inventory(name), users!sales_log_cashier_id_fkey(username)').eq('is_voided', false);
    if (periodStr === 'month') {
        q = q.gte('timestamp', `${dateFilter}-01T00:00:00Z`).lt('timestamp', `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, '0')}-01T00:00:00Z`); // Very rough next month, ideally just do basic like original
    } else {
        q = q.gte('timestamp', `${dateFilter}T00:00:00Z`).lt('timestamp', `${nextDateStr}T00:00:00Z`);
    }

    // 2. Fetch Opened Resources
    let resQ = supabase.from('resources').select('name, cost, status');
    if (periodStr === 'month') resQ = resQ.gte('opened_at', `${dateFilter}-01T00:00:00Z`);
    else resQ = resQ.gte('opened_at', `${dateFilter}T00:00:00Z`).lt('opened_at', `${nextDateStr}T00:00:00Z`);

    // 3. Fetch Fixed Overheads
    let ovQ = supabase.from('overhead_entries').select('rent, electricity, wifi_internet');
    if (periodStr === 'month') ovQ = ovQ.eq('period', ym);
    else ovQ = ovQ.gte('created_at', `${dateFilter}T00:00:00Z`).lt('created_at', `${nextDateStr}T00:00:00Z`);

    // 4. Fetch Daily Expenses
    let expQ = supabase.from('expenses').select('description, amount');
    if (periodStr === 'month') expQ = expQ.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    else expQ = expQ.gte('timestamp', `${dateFilter}T00:00:00Z`).lt('timestamp', `${nextDateStr}T00:00:00Z`);

    const [ {data: s}, {data: resData}, {data: ovData}, {data: expData} ] = await Promise.all([q, resQ, ovQ, expQ]);
    
    currentSalesData = s || [];
    currentResources = resData || [];
    currentOverheads = ovData || [];
    currentDailyExpenses = expData || [];

    const includeBulk = document.getElementById('chk-include-bulk').checked;

    // Calculate Expenses
    currentTotalExpenses = 0;
    
    // Always include daily POS expenses
    currentDailyExpenses.forEach(e => currentTotalExpenses += (e.amount || 0));

    if (includeBulk) {
        currentResources.forEach(r => currentTotalExpenses += (r.cost || 0));
        currentOverheads.forEach(o => {
            currentTotalExpenses += (o.rent || 0) + (o.electricity || 0) + (o.wifi_internet || 0);
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

    const netProfit = grossProf - currentTotalExpenses;

    document.getElementById('kpi-rev').innerText = `Ksh ${rev.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    document.getElementById('kpi-exp').innerText = `Ksh ${currentTotalExpenses.toLocaleString(undefined, {maximumFractionDigits:0})}`;
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
document.getElementById('ana-date').addEventListener('change', load);
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
    const userTotals = {};
    const methodTotals = { cash: 0, mpesa: 0 };
    const itemAgg = {};

    currentSalesData.forEach(x => { 
        rev += x.total_charged; 
        grossProf += x.calculated_profit;
        
        const username = x.users?.username || 'System';
        userTotals[username] = (userTotals[username] || 0) + x.total_charged;
        
        if (x.payment_method === 'cash') methodTotals.cash += x.total_charged;
        else if (x.payment_method === 'mpesa') methodTotals.mpesa += x.total_charged;
        
        const itemName = x.inventory?.name || 'Unknown';
        if (!itemAgg[itemName]) itemAgg[itemName] = { qty: 0, revenue: 0, method: new Set(), users: new Set() };
        itemAgg[itemName].qty += x.calculated_qty;
        itemAgg[itemName].revenue += x.total_charged;
        itemAgg[itemName].method.add(x.payment_method);
        itemAgg[itemName].users.add(username);
    });
    
    let wTotal = 0;
    let dTotal = 0;
    let expAgg = {};
    currentDailyExpenses.forEach(e => {
        const desc = e.description || 'Other';
        expAgg[desc] = (expAgg[desc] || 0) + (e.amount || 0);
        if (desc.toLowerCase().includes('wage')) wTotal += (e.amount || 0);
        else dTotal += (e.amount || 0);
    });

    let rTotal = 0;
    let resAgg = {};
    if (document.getElementById('chk-include-bulk').checked) {
        currentResources.forEach(r => {
            const name = r.name || 'Resource';
            resAgg[name] = (resAgg[name] || 0) + (r.cost || 0);
            rTotal += (r.cost || 0);
        });
    }

    let fTotal = 0;
    let fixedList = [];
    if (document.getElementById('chk-include-bulk').checked) {
        currentOverheads.forEach(o => {
            if (o.rent) { fixedList.push(`Rent: Ksh ${o.rent.toLocaleString()}`); fTotal += o.rent; }
            if (o.electricity) { fixedList.push(`Elec: Ksh ${o.electricity.toLocaleString()}`); fTotal += o.electricity; }
            if (o.wifi_internet) { fixedList.push(`WiFi: Ksh ${o.wifi_internet.toLocaleString()}`); fTotal += o.wifi_internet; }
        });
    }

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Executive Summary", 14, 45);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    // Left column (Math Breakdown)
    doc.text(`Gross Revenue: Ksh ${rev.toLocaleString()}`, 14, 55);
    doc.text(`Gross Profit: Ksh ${grossProf.toLocaleString()}`, 14, 62);
    
    let yPos = 69;
    if (wTotal > 0) { doc.text(`- Wages: Ksh ${wTotal.toLocaleString()}`, 14, yPos); yPos += 6; }
    if (fTotal > 0) { doc.text(`- Fixed Bills: Ksh ${fTotal.toLocaleString()}`, 14, yPos); yPos += 6; }
    if (rTotal > 0) { doc.text(`- Opened Resources: Ksh ${rTotal.toLocaleString()}`, 14, yPos); yPos += 6; }
    if (dTotal > 0) { doc.text(`- Other Expenses: Ksh ${dTotal.toLocaleString()}`, 14, yPos); yPos += 6; }
    
    doc.setFont("helvetica", "bold");
    doc.text(`Net Profit: Ksh ${(grossProf - currentTotalExpenses).toLocaleString()}`, 14, yPos + 2);
    doc.setFont("helvetica", "normal");
    
    // Middle column
    const userSummary = Object.entries(userTotals).map(u => `${u[0]}: Ksh ${u[1].toLocaleString()}`).join('  |  ');
    doc.text(`Cashiers: ${userSummary}`, 85, 55);
    doc.text(`Cash: Ksh ${methodTotals.cash.toLocaleString()}`, 85, 62);
    doc.text(`M-Pesa: Ksh ${methodTotals.mpesa.toLocaleString()}`, 85, 69);
    
    const tableData = Object.entries(itemAgg).sort((a,b) => b[1].revenue - a[1].revenue).map(entry => [
        entry[0],
        entry[1].qty,
        `Ksh ${entry[1].revenue.toLocaleString()}`,
        Array.from(entry[1].method).join('/'),
        Array.from(entry[1].users).join(', ')
    ]);
    
    doc.autoTable({
        startY: Math.max(90, yPos + 10),
        head: [['Item / Service', 'Total Qty', 'Total Revenue', 'Payment Modes', 'Cashiers']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { font: 'helvetica', fontSize: 9 },
        margin: { top: 35 }
    });

    let currentY = doc.lastAutoTable.finalY + 15;
    
    // Expenses & Resources section
    if (Object.keys(expAgg).length > 0 || Object.keys(resAgg).length > 0 || fixedList.length > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Expense & Resource Breakdown", 14, currentY);
        currentY += 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        
        Object.entries(expAgg).forEach(([desc, amt]) => {
            doc.text(`- ${desc}: Ksh ${amt.toLocaleString()}`, 14, currentY);
            currentY += 6;
        });
        Object.entries(resAgg).forEach(([name, cost]) => {
            doc.text(`- [Opened] ${name}: Ksh ${cost.toLocaleString()}`, 14, currentY);
            currentY += 6;
        });
        fixedList.forEach(item => {
            doc.text(`- [Fixed] ${item}`, 14, currentY);
            currentY += 6;
        });
    }
    
    const finalY = currentY > (doc.lastAutoTable.finalY + 15) ? currentY : (doc.lastAutoTable.finalY || 80);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated by Essie Cyber System on ${new Date().toLocaleString()}`, 14, finalY + 15);
    
    const filename = periodStr === 'today' ? `Daily_Report_${new Date().toISOString().split('T')[0]}.pdf` : `Report_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
});

load();
