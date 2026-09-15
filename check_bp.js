const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pos_fresh_inventory.db', sqlite3.OPEN_READONLY);

db.all("SELECT name, buying_price, selling_price FROM inventory ORDER BY name LIMIT 20", (err, rows) => {
    if(err) return console.error(err);
    console.log('SQLite sample with buying prices:');
    rows.forEach(r => console.log(`  ${r.name} | BP: ${r.buying_price} | SP: ${r.selling_price}`));
    db.close();
});
