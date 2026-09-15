const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pos_fresh_inventory.db', sqlite3.OPEN_READONLY, (err) => {
    if (err) console.error(err);
});

db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) return console.error(err);
        console.log('Tables:', tables.map(t => t.name));
        
        tables.forEach(t => {
            if (t.name.toLowerCase().includes('inventor') || t.name.toLowerCase().includes('product') || t.name.toLowerCase().includes('item')) {
                db.all(`SELECT * FROM ${t.name} LIMIT 5`, (err, rows) => {
                    console.log(`Samples from ${t.name}:`, rows);
                });
            }
        });
    });
});
