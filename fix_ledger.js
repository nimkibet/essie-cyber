const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

const searchLedger = /tbody\.innerHTML \+= `<tr><td class="py-2 px-4">\$\{new Date\(s\.timestamp\)\.toLocaleTimeString\(\)\}<\/td><td class="py-2 px-4">\$\{s\.inventory\?\.name\}<\/td><td class="py-2 px-4 text-center">\$\{s\.calculated_qty\}<\/td><td class="py-2 px-4 text-right">\$\{s\.total_charged\.toFixed\(2\)\}<\/td><td class="py-2 px-4 text-right">\$\{s\.payment_method\}<\/td><\/tr>`;/g;

const replaceLedger = "tbody.innerHTML += `<tr><td class=\"py-2 px-4\">${new Date(s.timestamp).toLocaleTimeString()}</td><td class=\"py-2 px-4\">${s.inventory?.name}</td><td class=\"py-2 px-4 text-center\">${s.calculated_qty}</td><td class=\"py-2 px-4 text-right\">${s.total_charged.toFixed(2)}</td><td class=\"py-2 px-4 text-right\">${s.payment_method}</td><td class=\"py-2 px-4 text-center\"><button onclick=\"voidSale('${s.id}')\" class=\"text-red-500 hover:text-red-700 font-bold\" title=\"Void Sale\">&times;</button></td></tr>`;";

code = code.replace(searchLedger, replaceLedger);

const voidLogic = `
window.voidSale = async (id) => {
    if(!confirm('Are you sure you want to void this sale?')) return;
    try {
        const { error } = await supabase.from('sales_log').update({ is_voided: true, voided_by: currentUser.id, voided_at: new Date().toISOString() }).eq('id', id);
        if(error) throw error;
        fetchTodaysSales();
    } catch(err) {
        alert('Error voiding sale: ' + err.message);
    }
};
`;

if (!code.includes('window.voidSale =')) {
    code += '\n' + voidLogic;
}

fs.writeFileSync('public/js/pos.js', code);
