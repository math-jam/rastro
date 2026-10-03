// Envio de e-mail por API HTTP (o plano grátis do Render bloqueia SMTP).
// Configure BREVO_API_KEY ou RESEND_API_KEY, e MAIL_FROM (remetente verificado no provedor).
const FROM = process.env.MAIL_FROM || '';
const enabled = !!(FROM && (process.env.BREVO_API_KEY || process.env.RESEND_API_KEY));

async function sendMail({ to, subject, text }) {
  if (!enabled) throw new Error('E-mail não configurado.');
  const m = FROM.match(/^(.*)<(.+)>$/);
  const sender = m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() } : { name: 'RASTRO', email: FROM.trim() };
  const r = process.env.BREVO_API_KEY
    ? await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
      })
    : await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: `${sender.name} <${sender.email}>`, to: [to], subject, text }),
      });
  if (!r.ok) throw new Error(`Falha no envio de e-mail (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

module.exports = { sendMail, enabled };
