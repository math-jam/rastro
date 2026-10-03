// Uso: DATABASE_URL=... SUPER_EMAIL=... SUPER_PASSWORD=... node resetsuper.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { DATABASE_URL: url, SUPER_EMAIL, SUPER_PASSWORD } = process.env;
if (!url || !SUPER_EMAIL || !SUPER_PASSWORD) { console.error('Defina DATABASE_URL, SUPER_EMAIL e SUPER_PASSWORD'); process.exit(1); }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
(async () => {
  const sup = await pool.query("SELECT id,email FROM users WHERE role='super'");
  console.log('Donos existentes:', sup.rows.map(r => r.email));
  const r = await pool.query("UPDATE users SET email=$1, senha_hash=$2, ativo=1, must_change_password=1 WHERE role='super'",
    [SUPER_EMAIL.toLowerCase(), bcrypt.hashSync(SUPER_PASSWORD, 10)]);
  console.log('Atualizados:', r.rowCount);
  await pool.end();
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
