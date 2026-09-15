const xlsx = require('xlsx');
const workbook = xlsx.readFile('Combined_Cafe_Inventory.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);
console.log('First 5 rows of Excel:', data.slice(0, 5));
console.log('Total rows:', data.length);
