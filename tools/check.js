const fs = require('fs');
const t = fs.readFileSync('web/app.js', 'utf8');
new Function(t);
console.log('sintaxis OK', t.length);
