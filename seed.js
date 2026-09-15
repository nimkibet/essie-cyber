const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data/pos.db');
const db = new sqlite3.Database(dbPath);

const stockList = [
    { name: "A4 200 PGS EXE BOOKS", price: 150 }, { name: "A4 120 PGS", price: 100 },
    { name: "A4 96 PGS", price: 80 }, { name: "A4 80 PGS", price: 70 },
    { name: "A5 200 PGS", price: 70 }, { name: "A5 120 PGS", price: 50 },
    { name: "A5 80 PGS", price: 40 }, { name: "A5 48 PGS", price: 30 },
    { name: "A5 HANDCOVER", price: 100 }, { name: "A6 NOTEBOOK", price: 50 },
    { name: "LOOSE LEAF", price: 100 }, { name: "A 5 SHORT HAND BOOK", price: 60 },
    { name: "4 QUIRE COUNTER BOOK", price: 400 }, { name: "3 QUIRE COUNTER BOOK", price: 300 },
    { name: "2 QUIRE COUNTER BOOK", price: 250 }, { name: "1 QUIRE COUNTER BOOK", price: 150 },
    { name: "A3 DRAWING BOOKS", price: 150 }, { name: "RECEIPT BOOK", price: 120 },
    { name: "A4 Plain book", price: 70 }, { name: "Medical Envelopes", price: 60 },
    { name: "BIC FINE POINT", price: 30 }, { name: "BIC CRYSTAL", price: 20 },
    { name: "TEEPEE PENS", price: 15 }, { name: "OBAMA", price: 10 },
    { name: "AMBASSADOR", price: 10 }, { name: "KASUKU PEN", price: 20 },
    { name: "GEL PEN", price: 30 }, { name: "THICKLINE PENS (CHEQUE BIRO)", price: 100 },
    { name: "PRITT (GLUE STICK)", price: 120 }, { name: "OTHERS", price: 20 },
    { name: "PENCILS (NATARAJ)", price: 20 }, { name: "PELIKAN PENCILS", price: 30 },
    { name: "HIGHLIGHT PENS", price: 50 }, { name: "OFFICE GLUE (SMALL)", price: 50 },
    { name: "CARBON PAPER (PELIKAN)", price: 30 }, { name: "CARBON PAPER (OTHER)", price: 20 },
    { name: "BINDING TAPES", price: 250 }, { name: "AFRI CELLOTAPE (CLEAR)", price: 100 },
    { name: "BIG CLEAR TAPE", price: 250 }, { name: "MASKING TAPE", price: 30 },
    { name: "PVC (BLUE) Piece", price: 20 }, { name: "EMBOSSED Piece", price: 15 },
    { name: "SPRING FILES", price: 70 }, { name: "PERMANENT MARK PENS", price: 30 },
    { name: "WHITE OUT", price: 100 }, { name: "GRAPH PAPER A4", price: 5 },
    { name: "GRAPH BOOK", price: 100 }, { name: "SCRAP BOOK", price: 100 },
    { name: "ID HOLDER (COMPLETE)", price: 50 }, { name: "FULLSCAPS Piece", price: 5 },
    { name: "C4 ENVELOPES Piece", price: 10 }, { name: "C3 ENVELOPES", price: 30 },
    { name: "C5 ENVELOPES Piece", price: 5 }, { name: "DL ENVELOPES Piece", price: 5 },
    { name: "C7/6 ENVELOPES", price: 5 }, { name: "B4 ENVELOPES", price: 20 },
    { name: "MANILLA PAPERS", price: 30 }, { name: "HACO RULER", price: 50 },
    { name: "Other ruller", price: 30 }, { name: "RUBBER (Blue)", price: 10 },
    { name: "RUBBER (SMALL)", price: 10 }, { name: "SHARPENER", price: 20 },
    { name: "A4 LAMINATION POUCH", price: 20 }, { name: "A3 LAMINATION FILMS", price: 50 },
    { name: "STICKERS/LABELS", price: 50 }, { name: "VEDA CRAYONS", price: 100 },
    { name: "CASH SALES (8UPs)", price: 60 }, { name: "A4 PLAIN PHOTOPAPER", price: 250 },
    { name: "4X6 PHOTOPAPER", price: 200 }, { name: "STICKER PAPER (gloss) Piece", price: 20 },
    { name: "MATTE PAPER Piece", price: 10 }, { name: "OXFORD SET", price: 350 },
    { name: "NORMAL SET", price: 150 }, { name: "STAPLES 24/6", price: 50 },
    { name: "PRINTING INK (CLARITY)", price: 200 }, { name: "CELL TAPE 3/4 Small", price: 20 },
    { name: "STAPLER", price: 400 }, { name: "Stapler small", price: 200 },
    { name: "CLEAR FOLDER", price: 50 }, { name: "DISPLAY BOOK 20 pockets", price: 220 },
    { name: "DISPLAY BOOK 30 pockets", price: 250 }, { name: "JK REAM PAPERS", price: 780 },
    { name: "OTHER REAM PAPERS", price: 700 }, 
    { name: "SPIRAL 6mm", price: 7 }, { name: "SPIRAL 8mm", price: 10 },
    { name: "SPIRAL 10mm", price: 13 }, { name: "SPIRAL 12mm", price: 15 },
    { name: "SPIRAL 14mm", price: 20 }, { name: "SPIRAL 18mm", price: 30 },
    { name: "SPIRAL 25mm", price: 40 }, { name: "SPIRAL 45mm", price: 60 },
    { name: "SPIRAL 52mm", price: 80 }
];

db.serialize(() => {
    db.run(`DELETE FROM inventory`);
    
    db.run(`INSERT INTO inventory (id, name, type, selling_price, buying_price, profit_margin, stock_quantity, min_threshold, category) VALUES (3, 'Print / Copy', 'variable', 50, NULL, 0.5, 0, 0, 'Services')`);
    db.run(`INSERT INTO inventory (id, name, type, selling_price, buying_price, profit_margin, stock_quantity, min_threshold, category) VALUES (4, 'Typesetting', 'variable', 100, NULL, 0.5, 0, 0, 'Services')`);
    db.run(`INSERT INTO inventory (id, name, type, selling_price, buying_price, profit_margin, stock_quantity, min_threshold, category) VALUES (5, 'Binding Service', 'variable', 50, NULL, 0.5, 0, 0, 'Services')`);
    
    const stmt = db.prepare(`INSERT INTO inventory (name, type, selling_price, buying_price, profit_margin, stock_quantity, min_threshold, category) VALUES (?, 'fixed', ?, NULL, NULL, 50, 5, 'Stationery')`);
    
    stockList.forEach(item => {
        stmt.run(item.name, item.price);
    });
    
    stmt.finalize(() => {
        console.log("✅ All stock items successfully added to the database!");
        db.close();
    });
});