const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

if (!process.env.DATABASE_URL) {
  console.error('Defina a variável DATABASE_URL (string de conexão do Postgres). Veja o README.');
  process.exit(1);
}

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: false },
  max: 5,
});
pool.on('error', (e) => console.error('Postgres:', e.message));

// Aceita "?" nos SQLs (convertido para $1, $2…).
const conv = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

const wrapClient = (c) => ({
  all: async (sql, p = []) => (await c.query(conv(sql), p)).rows,
  get: async (sql, p = []) => (await c.query(conv(sql), p)).rows[0],
  run: async (sql, p = []) => c.query(conv(sql), p),
});

const db = {
  ...wrapClient(pool),
  async tx(fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(wrapClient(c));
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  },
};

// Data/hora local (Brasília) em texto "AAAA-MM-DD HH:MM:SS".
const NOW = "to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS')";

async function init() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  nome_fantasia TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  max_usuarios INTEGER NOT NULL DEFAULT 5,
  ativo INTEGER NOT NULL DEFAULT 1,
  cnpj TEXT UNIQUE, telefone TEXT, cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super','admin','user')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  numero INTEGER NOT NULL,
  abertura TEXT NOT NULL,
  logradouro TEXT, bairro TEXT, municipio TEXT, uf TEXT, coordenadas TEXT,
  tamanho_m DOUBLE PRECISION,
  finalizacao TEXT,
  status TEXT NOT NULL DEFAULT 'Aberto',
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (company_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_orders_company ON orders (company_id, user_id);
CREATE TABLE IF NOT EXISTS order_photos (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('antes','depois','mapa')),
  filename TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  company_id INTEGER,
  user_id INTEGER,
  user_nome TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  entity_label TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log (company_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_by INTEGER;
CREATE TABLE IF NOT EXISTS order_counters (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last INTEGER NOT NULL DEFAULT 0
);`);

  // Usuário "dono" do sistema (quem cadastra empresas), criado na primeira execução.
  if (!(await db.get("SELECT 1 FROM users WHERE role='super'"))) {
    const email = (process.env.SUPER_EMAIL || 'dono@sistema.local').toLowerCase();
    const senha = process.env.SUPER_PASSWORD || 'trocar123';
    await db.run("INSERT INTO users (nome,email,senha_hash,role,must_change_password) VALUES (?,?,?, 'super',1)",
      ['Administrador do Sistema', email, bcrypt.hashSync(senha, 10)]);
    console.log(`>>> Usuário dono criado: ${email} (troque a senha no 1º acesso)`);
  }
}

module.exports = { db, init, DATA_DIR, NOW };
