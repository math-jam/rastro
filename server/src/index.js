const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, init: initDb, NOW } = require('./db');
const storage = require('./storage');
const { sign, signChallenge, verifyChallenge, auth, requireRole, publicUser } = require('./auth');
const mail = require('./mail');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

if (!storage.useSupabase) app.use('/uploads', express.static(storage.LOCAL, { maxAge: '7d', immutable: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (_, f, cb) => cb(null, /^image\//.test(f.mimetype)),
});

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error(e);
    if (e.code === '23505') return res.status(409).json({ error: 'Registro duplicado (e-mail ou CNPJ já cadastrado).' });
    res.status(500).json({ error: 'Erro interno.' });
  }
};
const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => {
  if (v === '' || v == null) return null;
  const s = String(v).trim();
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
};
const digits = (v) => str(v).replace(/\D/g, '');
function cnpjValido(v) {
  const c = digits(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => {
    let soma = 0, peso = n - 7;
    for (let i = 0; i < n; i++) { soma += +c[i] * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === +c[12] && dv(13) === +c[13];
}
const ADDR = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
const addrValues = (b) => ADDR.map((k) => (k === 'cep' ? digits(b[k]) : str(b[k])));

// Trilha de auditoria: quem fez o quê e quando (não aparece na impressão).
async function audit(conn, req, companyId, action, entity, entityId, label, details) {
  await conn.run(
    'INSERT INTO audit_log (company_id,user_id,user_nome,user_role,action,entity,entity_id,entity_label,details) VALUES (?,?,?,?,?,?,?,?,?)',
    [companyId ?? null, req.user.id, req.user.nome, req.user.role, action, entity, entityId ?? null, label, details ? JSON.stringify(details) : null]);
}

/* ---------- Auth ---------- */
// Verificação em 2 etapas: código de 6 dígitos por e-mail (ativa quando o envio de e-mail está configurado).
const TWOFA = mail.enabled && process.env.TWOFA_DISABLED !== '1';
if (!TWOFA) console.log('Aviso: verificação em 2 etapas DESATIVADA (defina MAIL_FROM e BREVO_API_KEY ou RESEND_API_KEY).');
const hashCode = (uid, code) => crypto.createHash('sha256').update(`${uid}:${code}:${process.env.JWT_SECRET || ''}`).digest('hex');
const maskEmail = (e) => e.replace(/^(.).*(@.*)$/, '$1***$2');
const USER_SQL = `SELECT u.*, c.ativo AS empresa_ativa, c.nome_fantasia AS empresa_nome, c.vencimento AS empresa_vencimento
  FROM users u LEFT JOIN companies c ON c.id = u.company_id`;
const blockedMsg = (u) =>
  !u.ativo || (u.role !== 'super' && !u.empresa_ativa) ? 'Conta bloqueada. Fale com o administrador do sistema.' : null;

async function sendCode(u) {
  const prev = await db.get('SELECT sent_at FROM login_codes WHERE user_id=?', [u.id]);
  if (prev && Date.now() - Number(prev.sent_at) < 30000)
    throw Object.assign(new Error('Aguarde 30 segundos para pedir outro código.'), { status: 429 });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.run(`INSERT INTO login_codes (user_id,code_hash,expires_at,sent_at,attempts) VALUES (?,?,?,?,0)
    ON CONFLICT (user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, sent_at=EXCLUDED.sent_at, attempts=0`,
    [u.id, hashCode(u.id, code), Date.now() + 10 * 60000, Date.now()]);
  await mail.sendMail({
    to: u.email, subject: `RASTRO: seu código de acesso é ${code}`,
    text: `Seu código de verificação do RASTRO: ${code}\n\nVálido por 10 minutos. Se não foi você, ignore este e-mail e troque sua senha.`,
  });
}
const sendErr = (res, e) => {
  console.error(e.message);
  return res.status(e.status || 502).json({ error: e.status ? e.message : 'Não foi possível enviar o código por e-mail. Tente novamente.' });
};
const challengeUser = (req) => { try { return verifyChallenge(req.body.challenge); } catch { return null; } };

app.post('/api/auth/login', wrap(async (req, res) => {
  const u = await db.get(`${USER_SQL} WHERE lower(u.email) = ?`, [str(req.body.email).toLowerCase()]);
  if (!u || !bcrypt.compareSync(str(req.body.senha), u.senha_hash))
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  const blocked = blockedMsg(u);
  if (blocked) return res.status(403).json({ error: blocked });
  if (!TWOFA) return res.json({ token: sign(u), user: publicUser(u) });
  try { await sendCode(u); } catch (e) { return sendErr(res, e); }
  res.json({ need_code: true, challenge: signChallenge(u), email: maskEmail(u.email) });
}));

app.post('/api/auth/verify-code', wrap(async (req, res) => {
  const uid = challengeUser(req);
  if (!uid) return res.status(401).json({ error: 'Login expirado. Entre novamente.' });
  const u = await db.get(`${USER_SQL} WHERE u.id = ?`, [uid]);
  const row = u && await db.get('SELECT * FROM login_codes WHERE user_id=?', [uid]);
  if (!row || Number(row.expires_at) < Date.now()) return res.status(401).json({ error: 'Código expirado. Entre novamente.' });
  const blocked = blockedMsg(u);
  if (blocked) return res.status(403).json({ error: blocked });
  if (row.attempts >= 5) return res.status(429).json({ error: 'Muitas tentativas. Entre novamente para receber outro código.' });
  const given = Buffer.from(hashCode(uid, str(req.body.code).replace(/\D/g, '')));
  const want = Buffer.from(row.code_hash);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    await db.run('UPDATE login_codes SET attempts = attempts + 1 WHERE user_id=?', [uid]);
    return res.status(401).json({ error: 'Código incorreto.' });
  }
  await db.run('DELETE FROM login_codes WHERE user_id=?', [uid]);
  res.json({ token: sign(u), user: publicUser(u) });
}));

app.post('/api/auth/resend-code', wrap(async (req, res) => {
  const uid = challengeUser(req);
  const u = uid && await db.get(`${USER_SQL} WHERE u.id = ?`, [uid]);
  if (!u || blockedMsg(u)) return res.status(401).json({ error: 'Login expirado. Entre novamente.' });
  try { await sendCode(u); } catch (e) { return sendErr(res, e); }
  res.json({ ok: true });
}));

app.get('/api/auth/me', auth, (req, res) => res.json(publicUser(req.user)));

app.post('/api/auth/change-password', auth, wrap(async (req, res) => {
  const { atual, nova } = req.body;
  if (!bcrypt.compareSync(str(atual), req.user.senha_hash))
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  if (str(nova).length < 6) return res.status(400).json({ error: 'A nova senha precisa de ao menos 6 caracteres.' });
  await db.run('UPDATE users SET senha_hash=?, must_change_password=0 WHERE id=?', [bcrypt.hashSync(str(nova), 10), req.user.id]);
  res.json({ ok: true });
}));

/* ---------- Empresas (somente dono do sistema) ---------- */
// '' -> null (sem vencimento); data válida AAAA-MM-DD -> ela mesma; inválida -> false.
// Mensalidade: "dia_vencimento" (1-31) repete todo mês; "vencimento" é a próxima data a pagar.
const pad2 = (n) => String(n).padStart(2, '0');
const dueOn = (y, m, day) => { // m pode passar de 12 (vira o ano); dia 31 cai no último dia do mês
  const d = new Date(y, m - 1, 1);
  const ny = d.getFullYear(), nm = d.getMonth() + 1;
  return `${ny}-${pad2(nm)}-${pad2(Math.min(day, new Date(ny, nm, 0).getDate()))}`;
};
const todayBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const nextDue = (day) => {
  const t = todayBR();
  const [y, m] = t.split('-').map(Number);
  const cand = dueOn(y, m, day);
  return cand >= t ? cand : dueOn(y, m + 1, day);
};
const parseDia = (v) => {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : false;
};
const parseVenc = (v) => {
  const s = str(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : false;
};
const superOnly = [auth, requireRole('super')];

app.get('/api/companies', superOnly, wrap(async (_, res) => {
  res.json(await db.all(`SELECT c.*,
    (SELECT COUNT(*)::int FROM users u WHERE u.company_id=c.id AND u.role='user' AND u.ativo=1) AS usuarios_ativos,
    (SELECT COUNT(*)::int FROM orders o WHERE o.company_id=c.id) AS total_os
    FROM companies c ORDER BY c.id DESC`));
}));

app.post('/api/companies', superOnly, wrap(async (req, res) => {
  const { nome_fantasia, razao_social, email, senha, max_usuarios } = req.body;
  const mail = str(email).toLowerCase();
  if (!str(nome_fantasia) || !str(razao_social) || !mail || str(senha).length < 6)
    return res.status(400).json({ error: 'Preencha todos os campos (senha com ao menos 6 caracteres).' });
  if (!cnpjValido(req.body.cnpj)) return res.status(400).json({ error: 'CNPJ inválido.' });
  if (digits(req.body.telefone).length < 10) return res.status(400).json({ error: 'Telefone inválido (com DDD).' });
  if (digits(req.body.cep).length !== 8 || !str(req.body.logradouro) || !str(req.body.numero) || !str(req.body.cidade) || !str(req.body.uf))
    return res.status(400).json({ error: 'Endereço incompleto (CEP, rua, número, cidade e UF).' });
  if (await db.get('SELECT 1 FROM companies WHERE cnpj=?', [digits(req.body.cnpj)]))
    return res.status(409).json({ error: 'Já existe uma empresa com este CNPJ.' });
  if (await db.get('SELECT 1 FROM users WHERE lower(email)=?', [mail]))
    return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
  const dia = parseDia(req.body.dia_vencimento);
  if (dia === false) return res.status(400).json({ error: 'Dia de vencimento inválido (1 a 31).' });
  const venc = dia ? nextDue(dia) : null;
  const id = await db.tx(async (t) => {
    const c = await t.get(`INSERT INTO companies (nome_fantasia,razao_social,email,max_usuarios,cnpj,telefone,vencimento,dia_vencimento,${ADDR.join(',')})
      VALUES (?,?,?,?,?,?,?,?,${ADDR.map(() => '?').join(',')}) RETURNING id`,
      [str(nome_fantasia), str(razao_social), mail, Math.max(1, parseInt(max_usuarios) || 1),
        digits(req.body.cnpj), digits(req.body.telefone), venc, dia, ...addrValues(req.body)]);
    await t.run("INSERT INTO users (company_id,nome,email,senha_hash,role,must_change_password) VALUES (?,?,?,?, 'admin',1)",
      [c.id, str(razao_social), mail, bcrypt.hashSync(str(senha), 10)]);
    await audit(t, req, c.id, 'criou', 'empresa', c.id, str(nome_fantasia), { cnpj: digits(req.body.cnpj), max_usuarios: Math.max(1, parseInt(max_usuarios) || 1) });
    return c.id;
  });
  res.status(201).json({ id });
}));

app.put('/api/companies/:id', superOnly, wrap(async (req, res) => {
  const { nome_fantasia, razao_social, max_usuarios, ativo, nova_senha } = req.body;
  const c = await db.get('SELECT * FROM companies WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Empresa não encontrada.' });
  await db.run('UPDATE companies SET nome_fantasia=?, razao_social=?, max_usuarios=?, ativo=? WHERE id=?', [
    str(nome_fantasia) || c.nome_fantasia, str(razao_social) || c.razao_social,
    Math.max(1, parseInt(max_usuarios) || c.max_usuarios), ativo === undefined ? c.ativo : ativo ? 1 : 0, c.id]);
  if (req.body.logradouro !== undefined) {
    if (digits(req.body.telefone).length < 10) return res.status(400).json({ error: 'Telefone inválido (com DDD).' });
    await db.run(`UPDATE companies SET telefone=?,${ADDR.map((k) => k + '=?').join(',')} WHERE id=?`,
      [digits(req.body.telefone), ...addrValues(req.body), c.id]);
  }
  if (req.body.dia_vencimento !== undefined) {
    const dia = parseDia(req.body.dia_vencimento);
    if (dia === false) return res.status(400).json({ error: 'Dia de vencimento inválido (1 a 31).' });
    if (dia !== (c.dia_vencimento || null)) {
      // Fatura já vencida e não paga continua cobrando a data antiga; senão recalcula a próxima.
      const venc = dia && (!c.vencimento || c.vencimento >= todayBR()) ? nextDue(dia) : c.vencimento;
      await db.run('UPDATE companies SET dia_vencimento=?, vencimento=? WHERE id=?', [dia, venc || null, c.id]);
      await audit(db, req, c.id, 'editou', 'empresa', c.id, c.nome_fantasia, { dia_vencimento: [c.dia_vencimento || null, dia], vencimento: [c.vencimento || null, venc || null] });
    }
  }
  if (req.body.registrar_pagamento && c.vencimento) {
    const [y, m, d] = c.vencimento.split('-').map(Number);
    const novo = dueOn(y, m + 1, c.dia_vencimento || d);
    await db.run('UPDATE companies SET vencimento=? WHERE id=?', [novo, c.id]);
    await audit(db, req, c.id, 'editou', 'empresa', c.id, c.nome_fantasia, { pagamento: 'registrado', vencimento: [c.vencimento, novo] });
  }
  if (str(nova_senha).length >= 6)
    await db.run("UPDATE users SET senha_hash=?, must_change_password=1 WHERE company_id=? AND lower(email)=lower(?) AND role='admin'",
      [bcrypt.hashSync(str(nova_senha), 10), c.id, c.email]);
  const mudou = {};
  if (ativo !== undefined && (ativo ? 1 : 0) !== c.ativo) mudou.ativo = [!!c.ativo, !!ativo];
  if (max_usuarios !== undefined && (parseInt(max_usuarios) || c.max_usuarios) !== c.max_usuarios) mudou.max_usuarios = [c.max_usuarios, parseInt(max_usuarios)];
  if (str(nova_senha).length >= 6) mudou.senha = 'redefinida';
  if (req.body.logradouro !== undefined) mudou.endereco_ou_telefone = 'atualizado';
  if (Object.keys(mudou).length) await audit(db, req, c.id, 'editou', 'empresa', c.id, c.nome_fantasia, mudou);
  res.json({ ok: true });
}));

/* ---------- Usuários da empresa (ADM) ---------- */
const adminOnly = [auth, requireRole('admin')];

app.get('/api/users', adminOnly, wrap(async (req, res) => {
  const company = await db.get('SELECT max_usuarios FROM companies WHERE id=?', [req.user.company_id]);
  const users = await db.all('SELECT id,nome,email,role,ativo,created_at FROM users WHERE company_id=? ORDER BY role, nome', [req.user.company_id]);
  res.json({ users, max_usuarios: company.max_usuarios });
}));

const countActiveUsers = async (companyId, exceptId = 0) =>
  (await db.get("SELECT COUNT(*)::int AS n FROM users WHERE company_id=? AND role='user' AND ativo=1 AND id<>?", [companyId, exceptId])).n;
const maxUsers = async (companyId) => (await db.get('SELECT max_usuarios FROM companies WHERE id=?', [companyId])).max_usuarios;

app.post('/api/users', adminOnly, wrap(async (req, res) => {
  const { nome, email, senha } = req.body;
  const mail = str(email).toLowerCase();
  if (!str(nome) || !mail || str(senha).length < 6)
    return res.status(400).json({ error: 'Informe nome, e-mail e senha provisória (mín. 6 caracteres).' });
  const max = await maxUsers(req.user.company_id);
  if ((await countActiveUsers(req.user.company_id)) >= max)
    return res.status(403).json({ error: `Limite de ${max} funcionário(s) atingido para a sua empresa.` });
  if (await db.get('SELECT 1 FROM users WHERE lower(email)=?', [mail]))
    return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
  const r = await db.get("INSERT INTO users (company_id,nome,email,senha_hash,role,must_change_password) VALUES (?,?,?,?, 'user',1) RETURNING id",
    [req.user.company_id, str(nome), mail, bcrypt.hashSync(str(senha), 10)]);
  await audit(db, req, req.user.company_id, 'criou', 'usuario', r.id, str(nome), { email: mail });
  res.status(201).json({ id: r.id });
}));

const ownUser = (req) => db.get("SELECT * FROM users WHERE id=? AND company_id=? AND role='user'", [req.params.id, req.user.company_id]);

app.put('/api/users/:id', adminOnly, wrap(async (req, res) => {
  const u = await ownUser(req);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const { nome, ativo, nova_senha } = req.body;
  const novoAtivo = ativo === undefined ? u.ativo : ativo ? 1 : 0;
  if (novoAtivo && !u.ativo) {
    const max = await maxUsers(req.user.company_id);
    if ((await countActiveUsers(req.user.company_id, u.id)) >= max)
      return res.status(403).json({ error: `Limite de ${max} funcionário(s) atingido.` });
  }
  await db.run('UPDATE users SET nome=?, ativo=? WHERE id=?', [str(nome) || u.nome, novoAtivo, u.id]);
  if (str(nova_senha).length >= 6)
    await db.run('UPDATE users SET senha_hash=?, must_change_password=1 WHERE id=?', [bcrypt.hashSync(str(nova_senha), 10), u.id]);
  const mudou = {};
  if (novoAtivo !== u.ativo) mudou.ativo = [!!u.ativo, !!novoAtivo];
  if (str(nome) && str(nome) !== u.nome) mudou.nome = [u.nome, str(nome)];
  if (str(nova_senha).length >= 6) mudou.senha = 'redefinida';
  if (Object.keys(mudou).length) await audit(db, req, req.user.company_id, 'editou', 'usuario', u.id, u.nome, mudou);
  res.json({ ok: true });
}));

app.delete('/api/users/:id', adminOnly, wrap(async (req, res) => {
  const u = await ownUser(req);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (await db.get('SELECT 1 FROM orders WHERE user_id=?', [u.id]))
    return res.status(409).json({ error: 'Este usuário possui OSs. Desative-o em vez de excluir.' });
  await db.run('DELETE FROM users WHERE id=?', [u.id]);
  await audit(db, req, req.user.company_id, 'excluiu', 'usuario', u.id, u.nome, { email: u.email });
  res.json({ ok: true });
}));

/* ---------- Ordens de Serviço ---------- */
const SLOTS = ['antes', 'depois', 'mapa']; // uma imagem por posição
const STATUS = ['Aberto', 'Em andamento', 'Concluído'];

async function withPhotos(o) {
  const photos = {};
  for (const p of await db.all('SELECT id,tipo,filename FROM order_photos WHERE order_id=? ORDER BY id', [o.id]))
    photos[p.tipo] = { id: p.id, url: storage.url(p.filename) };
  return { ...o, photos };
}

// Admin vê todas da empresa; usuário comum, só as próprias.
async function findOrder(req) {
  const o = await db.get(`SELECT o.*, u.nome AS autor, uu.nome AS atualizado_por, c.nome_fantasia AS empresa_nome, c.razao_social AS empresa_razao
    FROM orders o JOIN users u ON u.id=o.user_id JOIN companies c ON c.id=o.company_id
    LEFT JOIN users uu ON uu.id=o.updated_by
    WHERE o.id=? AND o.company_id=?`, [req.params.id, req.user.company_id]);
  if (!o) return null;
  if (req.user.role === 'user' && o.user_id !== req.user.id) return null;
  return o;
}

const notSuper = (req, res, next) =>
  req.user.role === 'super' ? res.status(403).json({ error: 'Sem permissão.' }) : next();

app.get('/api/orders', auth, notSuper, wrap(async (req, res) => {
  const q = `%${str(req.query.q)}%`;
  const own = req.user.role === 'user';
  const params = [req.user.company_id, ...(own ? [req.user.id] : []), q, q, q, q];
  res.json(await db.all(`SELECT o.id,o.numero,o.logradouro,o.bairro,o.municipio,o.status,o.abertura,o.finalizacao,o.tamanho_m,o.created_at,o.updated_at,o.updated_by,u.nome AS autor,uu.nome AS atualizado_por
    FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN users uu ON uu.id=o.updated_by
    WHERE o.company_id=? ${own ? 'AND o.user_id=?' : ''}
      AND (CAST(o.numero AS TEXT) ILIKE ? OR o.logradouro ILIKE ? OR o.bairro ILIKE ? OR o.municipio ILIKE ?)
    ORDER BY o.id DESC LIMIT 500`, params));
}));

app.get('/api/orders/:id', auth, notSuper, wrap(async (req, res) => {
  const o = await findOrder(req);
  o ? res.json(await withPhotos(o)) : res.status(404).json({ error: 'OS não encontrada.' });
}));

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));

function fields(b) {
  return [
    isDate(b.abertura) ? b.abertura : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }),
    str(b.logradouro), str(b.bairro), str(b.municipio), str(b.uf).toUpperCase().slice(0, 2), str(b.coordenadas),
    num(b.tamanho_m), isDate(b.finalizacao) ? b.finalizacao : null,
    STATUS.includes(b.status) ? b.status : 'Aberto',
  ];
}

// Envia as imagens recebidas ao storage e devolve [{tipo, filename}].
async function uploadFiles(files = [], tipos = []) {
  const list = [].concat(tipos);
  const done = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const tipo = list[i];
      if (!SLOTS.includes(tipo)) continue;
      const filename = crypto.randomUUID() + (path.extname(files[i].originalname).toLowerCase() || '.jpg');
      await storage.put(filename, files[i].buffer, files[i].mimetype);
      done.push({ tipo, filename });
    }
  } catch (e) {
    await storage.remove(done.map((d) => d.filename));
    throw e;
  }
  return done;
}

// Cada posição (antes/depois/mapa) guarda uma imagem; enviar outra substitui a anterior.
async function savePhotos(t, orderId, uploaded) {
  const gone = [];
  for (const { tipo, filename } of uploaded) {
    for (const old of await t.all('SELECT id,filename FROM order_photos WHERE order_id=? AND tipo=?', [orderId, tipo])) {
      gone.push(old.filename);
      await t.run('DELETE FROM order_photos WHERE id=?', [old.id]);
    }
    await t.run('INSERT INTO order_photos (order_id,tipo,filename) VALUES (?,?,?)', [orderId, tipo, filename]);
  }
  return gone;
}

app.post('/api/orders', auth, notSuper, upload.array('fotos'), wrap(async (req, res) => {
  const uploaded = await uploadFiles(req.files, req.body.tipos);
  let gone = [];
  try {
    const id = await db.tx(async (t) => {
      // Contador atômico por empresa: o "ID do serviço" nunca repete.
      const { last } = await t.get(`INSERT INTO order_counters (company_id,last) VALUES (?,1)
        ON CONFLICT (company_id) DO UPDATE SET last = order_counters.last + 1 RETURNING last`, [req.user.company_id]);
      const r = await t.get(`INSERT INTO orders (company_id,user_id,numero,abertura,logradouro,bairro,municipio,uf,coordenadas,
        tamanho_m,finalizacao,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        [req.user.company_id, req.user.id, last, ...fields(req.body)]);
      gone = await savePhotos(t, r.id, uploaded);
      await audit(t, req, req.user.company_id, 'criou', 'os', r.id, `OS ${last}`, { logradouro: str(req.body.logradouro), imagens: uploaded.map((u) => u.tipo) });
      return r.id;
    });
    await storage.remove(gone);
    res.status(201).json({ id });
  } catch (e) {
    await storage.remove(uploaded.map((u) => u.filename));
    throw e;
  }
}));

app.put('/api/orders/:id', adminOnly, upload.array('fotos'), wrap(async (req, res) => {
  const o = await findOrder(req);
  if (!o) return res.status(404).json({ error: 'OS não encontrada.' });
  const novos = fields(req.body);
  const KEYS = ['abertura', 'logradouro', 'bairro', 'municipio', 'uf', 'coordenadas', 'tamanho_m', 'finalizacao', 'status'];
  const mudou = KEYS.map((k, i) => ({ campo: k, de: o[k] ?? null, para: novos[i] ?? null }))
    .filter((m) => String(m.de ?? '') !== String(m.para ?? ''));
  const uploaded = await uploadFiles(req.files, req.body.tipos);
  const toRemove = [].concat(req.body.remover || []).map(Number).filter(Boolean);
  let gone = [];
  try {
    await db.tx(async (t) => {
      const removidas = [];
      for (const pid of toRemove) {
        const p = await t.get('SELECT * FROM order_photos WHERE id=? AND order_id=?', [pid, o.id]);
        if (p) { gone.push(p.filename); removidas.push(p.tipo); await t.run('DELETE FROM order_photos WHERE id=?', [pid]); }
      }
      gone = gone.concat(await savePhotos(t, o.id, uploaded));
      if (!mudou.length && !uploaded.length && !removidas.length) return; // nada mudou: não altera nem registra
      await t.run(`UPDATE orders SET abertura=?,logradouro=?,bairro=?,municipio=?,uf=?,coordenadas=?,tamanho_m=?,finalizacao=?,status=?,
        updated_at=${NOW}, updated_by=? WHERE id=?`, [...novos, req.user.id, o.id]);
      await audit(t, req, o.company_id, 'editou', 'os', o.id, `OS ${o.numero}`, {
        campos: mudou,
        imagens_enviadas: uploaded.map((u) => u.tipo),
        imagens_removidas: removidas,
      });
    });
  } catch (e) {
    await storage.remove(uploaded.map((u) => u.filename));
    throw e;
  }
  await storage.remove(gone);
  res.json({ id: o.id });
}));

app.delete('/api/orders/:id', adminOnly, wrap(async (req, res) => {
  const o = await findOrder(req);
  if (!o) return res.status(404).json({ error: 'OS não encontrada.' });
  const photos = await db.all('SELECT filename FROM order_photos WHERE order_id=?', [o.id]);
  await db.tx(async (t) => {
    await audit(t, req, o.company_id, 'excluiu', 'os', o.id, `OS ${o.numero}`, {
      logradouro: o.logradouro, bairro: o.bairro, municipio: o.municipio, status: o.status, abertura: o.abertura,
      tamanho_m: o.tamanho_m, criada_por: o.autor, criada_em: o.created_at,
    });
    await t.run('DELETE FROM orders WHERE id=?', [o.id]);
  });
  await storage.remove(photos.map((p) => p.filename));
  res.json({ ok: true });
}));

app.get('/api/audit', auth, requireRole('admin', 'super'), wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role === 'admin') { where.push('a.company_id=?'); params.push(req.user.company_id); }
  if (req.query.os) { where.push("a.entity='os' AND a.entity_id=?"); params.push(Number(req.query.os) || 0); }
  if (['criou', 'editou', 'excluiu'].includes(req.query.acao)) { where.push('a.action=?'); params.push(req.query.acao); }
  if (Number(req.query.before)) { where.push('a.id<?'); params.push(Number(req.query.before)); }
  const rows = await db.all(`SELECT a.*, c.nome_fantasia AS empresa FROM audit_log a LEFT JOIN companies c ON c.id=a.company_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 100`, params);
  res.json(rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })));
}));

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api', (_, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

/* ---------- Front-end (build do React) ---------- */
const DIST = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('/{*splat}', (_, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Imagem muito grande (máx. 10 MB).' : 'Requisição inválida.' });
});

const PORT = process.env.PORT || 3001;
(async () => {
  await initDb();
  await storage.init();
  app.listen(PORT, () => console.log(`Servidor em http://localhost:${PORT}`));
})().catch((e) => {
  console.error('Falha ao iniciar:', e.message);
  process.exit(1);
});
