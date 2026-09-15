const fs = require('fs');
let code = fs.readFileSync('public/js/pos.js', 'utf8');

code = code.replace(/payment_method: quickPay\}/g, "payment_method: quickPay.toLowerCase().replace('-', '')}");
code = code.replace(/s\.payment_method === 'M-Pesa'/g, "s.payment_method === 'mpesa'");
code = code.replace(/payment_method: e\.target\.id\.includes\('mpesa'\) \? 'M-Pesa' : 'Cash'/g, "payment_method: e.target.id.includes('mpesa') ? 'mpesa' : 'cash'");

fs.writeFileSync('public/js/pos.js', code);
