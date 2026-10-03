const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
if (!url) { console.error('Defina DATABASE_URL'); process.exit(1); }
const u = new URL(url);
console.log(`Host: ${u.hostname}  Porta: ${u.port}  Usuario: ${decodeURIComponent(u.username)}  Banco: ${u.pathname.slice(1)}  Senha: ${u.password.length} caracteres`);
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
pool.query('select now() as agora, current_user as usuario')
  .then(r => { console.log('OK! Conectou:', r.rows[0]); return pool.end(); })
  .catch(e => { console.error('FALHOU:', e.code, e.message); process.exit(1); });
