const fs = require('fs');
const files = [
    'public/js/modules/pos.js',
    'public/js/modules/admin.js',
    'public/js/modules/analytics.js'
];
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');
    content = content.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
    fs.writeFileSync(file, content);
});
console.log('Fixed syntax errors');
