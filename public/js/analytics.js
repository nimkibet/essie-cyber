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

    let q = supabase.from('sales_log').select('*, inventory(name), users!sales_log_cashier_id_fkey(username)').eq('is_voided', false);
    if (periodStr === 'month') q = q.gte('timestamp', `${dateFilter}-01T00:00:00Z`);
    else q = q.gte('timestamp', `${dateFilter}T00:00:00Z`);

    const { data: s } = await q;
    currentSalesData = s || [];

    document.getElementById('kpi-tx').innerText = currentSalesData.length;
    let rev = 0, prof = 0;
    
    // Aggregations
    const items = {};
    const userRevenue = {};
    const methodRevenue = { cash: 0, mpesa: 0 };

    currentSalesData.forEach(x => {
        rev += x.total_charged;
        prof += x.calculated_profit;
        
        // Item aggregations
        const n = x.inventory?.name || 'Unknown';
        if (!items[n]) items[n] = 0;
        items[n] += x.calculated_qty;

        // User aggregations
        const user = x.users?.username || 'Unknown';
        if (!userRevenue[user]) userRevenue[user] = 0;
        userRevenue[user] += x.total_charged;
        
        // Method aggregations
        if (x.payment_method === 'cash') methodRevenue.cash += x.total_charged;
        else if (x.payment_method === 'mpesa') methodRevenue.mpesa += x.total_charged;
    });

    document.getElementById('kpi-rev').innerText = `Ksh ${rev.toLocaleString()}`;
    document.getElementById('kpi-profit').innerText = `Ksh ${prof.toLocaleString()}`;

    // Update User Leaderboard Table
    const sortedUsers = Object.entries(userRevenue).sort((a, b) => b[1] - a[1]);
    const utb = document.getElementById('user-tbody');
    utb.innerHTML = '';
    sortedUsers.forEach(u => {
        utb.innerHTML += `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="py-2 px-3 font-medium text-slate-700 capitalize">${u[0]}</td><td class="py-2 px-3 text-right font-bold text-slate-600">Ksh ${u[1].toLocaleString()}</td></tr>`;
    });

    // Update Charts
    updateCharts(userRevenue, methodRevenue, items);
}

function updateCharts(userRevenue, methodRevenue, items) {
    const sortedItems = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 10);
    
    // User Chart (Bar)
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

    // Method Chart (Doughnut)
    const methodCtx = document.getElementById('methodChart');
    if (methodChartInstance) methodChartInstance.destroy();
    methodChartInstance = new Chart(methodCtx, {
        type: 'doughnut',
        data: {
            labels: ['M-Pesa', 'Cash'],
            datasets: [{
                data: [methodRevenue.mpesa, methodRevenue.cash],
                backgroundColor: ['#10b981', '#3b82f6'] // Emerald for mpesa, Blue for cash
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Items Chart (Bar)
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
            indexAxis: 'y', // horizontal bar chart is better for item names
            responsive: true, 
            maintainAspectRatio: false 
        }
    });
}

document.getElementById('ana-period').addEventListener('change', load);

// PDF Generation
document.getElementById('btn-dl-report').addEventListener('click', () => {
    if (currentSalesData.length === 0) return alert('No data to generate report.');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
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
    
    // Summary Metrics
    let rev = 0, prof = 0;
    currentSalesData.forEach(x => { rev += x.total_charged; prof += x.calculated_profit; });
    
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Executive Summary", 14, 45);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Transactions: ${currentSalesData.length}`, 14, 55);
    doc.text(`Gross Revenue: Ksh ${rev.toLocaleString()}`, 14, 62);
    doc.text(`Estimated Profit: Ksh ${prof.toLocaleString()}`, 14, 69);
    
    // Table of transactions
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