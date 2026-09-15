require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

const supabaseUrl = 'https://cztwpohqhbjdrjqiavec.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dHdwb2hxaGJqZHJqcWlhdmVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTM1MjA1OSwiZXhwIjoyMTA0OTI4MDU5fQ.Q7fBrx0AAKzK-hlG0S62-wVtruAibxdRkPwdcyfJPLs';
const supabase = createClient(supabaseUrl, supabaseKey);

const db = new sqlite3.Database('pos_fresh_inventory.db', sqlite3.OPEN_READONLY);

async function run() {
    console.log('Reading Excel file...');
    const workbook = xlsx.readFile('Combined_Cafe_Inventory.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    
    // Read SQLite db to memory
    console.log('Loading SQLite stock counts...');
    const dbItems = await new Promise((resolve, reject) => {
        db.all("SELECT name, stock_quantity FROM inventory", (err, rows) => {
            if(err) reject(err);
            else resolve(rows || []);
        });
    });
    
    const stockMap = {};
    dbItems.forEach(i => stockMap[i.name.toLowerCase()] = i.stock_quantity);
    
    console.log('Preparing new items...');
    const newItems = data.map(row => {
        const name = row['Item Description'] || 'Unknown Item';
        let stock = stockMap[name.toLowerCase()];
        if (stock === undefined || stock === null) {
            stock = Math.floor(Math.random() * 10) + 1; // 1 to 10
        }
        
        let bp = parseFloat(row['Buying Price (KSH)'] || 0);
        let sp = parseFloat(row['Selling Price (KSH)'] || 0);
        
        return {
            name: name.toString().toUpperCase(),
            type: 'fixed',
            selling_price: sp,
            buying_price: bp,
            profit_margin: sp - bp,
            stock_quantity: stock,
            min_threshold: 5,
            is_service: false
        };
    });
    
    console.log(`Prepared ${newItems.length} products to insert.`);
    
    console.log('Deleting existing products (is_service = false) from Supabase...');
    const { error: delErr } = await supabase.from('inventory').delete().eq('is_service', false);
    if(delErr) {
        console.error('Delete Error:', delErr);
        return;
    }
    
    console.log('Inserting new products...');
    const { data: insData, error: insErr } = await supabase.from('inventory').insert(newItems);
    if(insErr) {
        console.error('Insert Error:', insErr);
        return;
    }
    
    console.log('Successfully seeded Supabase!');
}

run().catch(console.error).finally(() => db.close());
