const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://cztwpohqhbjdrjqiavec.supabase.co', 'sb_publishable_hw959Pqfc9jDGhifXOuLjQ_fSv5l6Xr');

async function fixOrphans() {
    console.log("Checking for orphaned services...");
    const { data: inv, error: fetchErr } = await supabase.from('inventory').select('name');
    if (fetchErr) {
        console.error("Fetch error:", fetchErr);
        return;
    }
    
    const names = inv.map(i => i.name);
    const orphans = ['Print / Copy', 'Typesetting', 'Binding Service'];
    
    for (const name of orphans) {
        if (!names.includes(name)) {
            console.log(`Inserting orphaned service: ${name}`);
            const { error: insErr } = await supabase.from('inventory').insert([{
                name: name,
                type: 'fixed',
                selling_price: 0,
                buying_price: 0,
                stock_quantity: 0,
                is_service: true,
                is_quick_add: true
            }]);
            if (insErr) console.error("Insert error:", insErr);
            else console.log(`Successfully added ${name}`);
        } else {
            console.log(`Setting is_quick_add=true for existing service: ${name}`);
            await supabase.from('inventory').update({ is_quick_add: true }).eq('name', name);
        }
    }
    console.log("Done.");
}
fixOrphans();
