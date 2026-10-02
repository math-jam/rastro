const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(DATA_DIR, 'jwt.secret');
  try {
    if (!fs.existsSync(f)) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(f, crypto.randomBytes(48).toString('hex')); }
    return fs.readFileSync(f, 'utf8');
  } catch {
    console.error('Defina JWT_SECRET (sem disco persistente não dá para gerar um).');
    process.exit(1);
  }
}
const SECRET = getSecret();

const sign = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '12h' });

// Sempre relê o usuário no banco: desativação/troca de papel vale imediatamente.
async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    const { id } = jwt.verify(h.replace('Bearer ', ''), SECRET);
    const u = await db.get(`SELECT u.*, c.ativo AS empresa_ativa, c.nome_fantasia AS empresa_nome
      FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = ?`, [id]);
    if (!u || !u.ativo || (u.role !== 'super' && !u.empresa_ativa)) throw new Error();
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Sem permissão.' });

const publicUser = (u) => ({
  id: u.id, nome: u.nome, email: u.email, role: u.role, company_id: u.company_id,
  empresa_nome: u.empresa_nome || null, must_change_password: !!u.must_change_password,
});

module.exports = { sign, auth, requireRole, publicUser };
