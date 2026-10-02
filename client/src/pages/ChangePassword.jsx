import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.jsx'

export default function ChangePassword() {
  const { user, refresh } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ atual: '', nova: '', conf: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (f.nova !== f.conf) return setMsg({ t: 'error', m: 'A confirmação não confere.' })
    setBusy(true)
    try {
      await api('/auth/change-password', { method: 'POST', body: { atual: f.atual, nova: f.nova } })
      await refresh()
      setMsg({ t: 'ok', m: 'Senha alterada com sucesso.' })
      setF({ atual: '', nova: '', conf: '' })
      if (user.must_change_password) nav('/', { replace: true })
    } catch (err) {
      setMsg({ t: 'error', m: err.message })
    }
    setBusy(false)
  }

  return (
    <div className="narrow">
      <h1 className="page-title">Alterar senha</h1>
      {user.must_change_password && <div className="alert info">Por segurança, defina uma nova senha antes de continuar.</div>}
      <form className="card stack" onSubmit={submit}>
        <label className="field"><span>Senha atual</span><input type="password" required autoComplete="current-password" value={f.atual} onChange={set('atual')} /></label>
        <label className="field"><span>Nova senha</span><input type="password" required minLength={6} autoComplete="new-password" value={f.nova} onChange={set('nova')} /></label>
        <label className="field"><span>Confirmar nova senha</span><input type="password" required minLength={6} autoComplete="new-password" value={f.conf} onChange={set('conf')} /></label>
        {msg && <div className={`alert ${msg.t}`}>{msg.m}</div>}
        <button className="btn primary" disabled={busy}>Salvar senha</button>
      </form>
    </div>
  )
}
