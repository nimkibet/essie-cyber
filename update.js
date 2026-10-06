const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

const target = const mainPayDebt = document.getElementById('main-pay-debt');
if (mainPayDebt) {
    mainPayDebt.addEventListener('click', async () => {
        if (!navigator.onLine) {
            alert('Debt Sales require an active internet connection.');
            return;
        }
        
        const custId = document.getElementById('debt-sale-customer-select').value;
        if (!custId) {
            alert('Please select a customer for the debt sale.');
            return;
        }

        if (cart.length === 0) {
            alert('Cart is empty.');
            return;
        }

        const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
        const cust = customers.find(c => c.id == custId);
        if (!cust) return;

        if (!confirm(\Log Ksh \ as Debt for \?\)) return;

        mainPayDebt.disabled = true;
        mainPayDebt.textContent = 'Processing...';

        try {
            const inserts = cart.map(item => ({
                item_id: item.id,
                total_charged: item.total,
                calculated_qty: item.qty,
                calculated_profit: item.total - (item.buying_price * item.qty),
                cashier_id: currentUser.id,
                payment_method: 'cash',
                status: 'debt',
                customer_id: custId,
                kyocera_pages: item.kyocera_pages
            }));

            const { error: insertErr } = await supabase.from('sales_log').insert(inserts);
            if (insertErr) throw insertErr;

            // Update customer debt
            const newDebt = parseFloat(cust.outstanding_debt || 0) + totalAmount;
            const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', custId);
            if (custErr) throw custErr;
            
            cust.outstanding_debt = newDebt;
            localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
            populateCustomerDropdown();
            populateDebtDropdown();
            populateDebtSaleDropdown();

            // Deduct inventory
            for (let item of cart) {
                if (item.type === 'variable' && item.is_service && !item.is_kyocera) {
                    if (item.name.toLowerCase().includes('binding')) await deductBindingMaterials(item.qty);
                    continue;
                }
                const logItem = inventory.find(i => i.id === item.id);
                if (logItem && logItem.type === 'fixed') {
                    const newStock = (logItem.stock_quantity || 0) - item.qty;
                    try { await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); } catch (e) {}
                    logItem.stock_quantity = newStock;
                }
            }

            cart = [];
            renderCart();
            fetchTodaysSales();
            resetModes();
            document.getElementById('debt-sale-customer-select').value = '';
        } catch (err) {
            alert('Error processing debt sale: ' + err.message);
        } finally {
            mainPayDebt.disabled = false;
            mainPayDebt.textContent = 'Debt';
        }
    });
};

const replacement = const mainPayDebt = document.getElementById('main-pay-debt');
if (mainPayDebt) {
    mainPayDebt.addEventListener('click', async (e) => {
        if (!navigator.onLine) {
            alert('Debt Sales require an active internet connection.');
            return;
        }
        
        const custId = document.getElementById('debt-sale-customer-select').value;
        if (!custId) {
            alert('Please select a customer for the debt sale.');
            return;
        }

        const amt = parseFloat(document.getElementById('pos-total').value);
        const qty = parseInt(document.getElementById('pos-qty').value || 1);
        const itemId = document.getElementById('pos-item-id').value;
        const item = inventory.find(i => i.id === itemId);
        
        if(!item || !amt) return alert('Select an item and enter amount');

        const cust = customers.find(c => c.id == custId);
        if (!cust) return;

        if (!confirm(\Log Ksh \ as Debt for \?\)) return;

        mainPayDebt.disabled = true;
        mainPayDebt.textContent = 'Processing...';

        try {
            let bc = item.buying_price || 0, kyo = 0;
            if(!document.getElementById('kyocera-fields').classList.contains('hidden')) { 
                kyo = parseInt(document.getElementById('kyo-pages').value); 
                bc = kyo * parseFloat(document.getElementById('kyo-cost-pp').value); 
            }
            if(item.name.toLowerCase().includes('binding') && !item.is_kyocera) {
                // Approximate binding cost or ignore for debt
                bc = 0;
            }
            const prof = amt - bc;

            const { error: insertErr } = await supabase.from('sales_log').insert([{
                item_id: item.id,
                total_charged: amt,
                calculated_profit: prof,
                calculated_qty: qty,
                payment_method: 'cash',
                status: 'debt',
                cashier_id: currentUser.id,
                customer_id: custId
            }]);
            if (insertErr) throw insertErr;

            // Update customer debt
            const newDebt = parseFloat(cust.outstanding_debt || 0) + amt;
            const { error: custErr } = await supabase.from('customers').update({ outstanding_debt: newDebt }).eq('id', custId);
            if (custErr) throw custErr;
            
            cust.outstanding_debt = newDebt;
            localStorage.setItem('essie_customers_cache', JSON.stringify(customers));
            populateCustomerDropdown();
            populateDebtDropdown();
            populateDebtSaleDropdown();

            // Deduct inventory
            if (item.type === 'variable' && item.is_service && !item.is_kyocera) {
                if (item.name.toLowerCase().includes('binding')) await deductBindingMaterials(qty);
            } else if (item.type === 'fixed') {
                const newStock = (item.stock_quantity || 0) - qty;
                try { await supabase.from('inventory').update({ stock_quantity: newStock }).eq('id', item.id); } catch (e) {}
                item.stock_quantity = newStock;
            }

            document.getElementById('pos-item-id').value = '';
            document.getElementById('pos-item-search').value = '';
            document.getElementById('pos-qty').value = '';
            document.getElementById('pos-total').value = '';
            document.getElementById('kyocera-fields').classList.add('hidden');
            
            fetchTodaysSales();
            resetModes();
            document.getElementById('debt-sale-customer-select').value = '';
        } catch (err) {
            alert('Error processing debt sale: ' + err.message);
        } finally {
            mainPayDebt.disabled = false;
            mainPayDebt.textContent = 'Debt';
        }
    });
};

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('public/js/pos.js', code);
    console.log("Success");
} else {
    console.log("Could not find target!");
}
