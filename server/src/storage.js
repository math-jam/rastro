// Armazenamento de imagens: Supabase Storage (produção) ou pasta local (desenvolvimento).
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'os-fotos';
const useSupabase = !!(SB_URL && SB_KEY);

const LOCAL = path.join(DATA_DIR, 'uploads');
if (!useSupabase) fs.mkdirSync(LOCAL, { recursive: true });

const headers = (extra = {}) => ({
  apikey: SB_KEY,
  ...(SB_KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${SB_KEY}` }),
  ...extra,
});

async function init() {
  if (!useSupabase) return console.log('Imagens: pasta local (defina SUPABASE_URL e SUPABASE_SERVICE_KEY em produção).');
  const r = await fetch(`${SB_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!r.ok && r.status !== 409 && !/already exists/i.test(await r.text()))
    console.error('Aviso: não foi possível criar/verificar o bucket de imagens:', r.status);
}

async function put(filename, buffer, contentType) {
  if (!useSupabase) return fs.promises.writeFile(path.join(LOCAL, filename), buffer);
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType || 'application/octet-stream' }),
    body: buffer,
  });
  if (!r.ok) throw new Error('Falha ao enviar imagem: ' + (await r.text()));
}

async function remove(filenames) {
  const list = filenames.filter(Boolean);
  if (!list.length) return;
  try {
    if (!useSupabase) return await Promise.all(list.map((f) => fs.promises.unlink(path.join(LOCAL, f)).catch(() => {})));
    await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: list }),
    });
  } catch (e) {
    console.error('Falha ao remover imagens:', e.message);
  }
}

const url = (filename) => (useSupabase ? `${SB_URL}/storage/v1/object/public/${BUCKET}/${filename}` : `/uploads/${filename}`);

module.exports = { init, put, remove, url, LOCAL, useSupabase };
