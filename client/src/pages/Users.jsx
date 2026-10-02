import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

const empty = { nome: '', email: '', senha: '' }

export default function Users() {
  const [data, setData] = useState({ users: [], max_usuarios: 0 })
  const [f, setF] = useState(empty)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const load = useCallback(() => api('/users').then(setData).catch((e) => setMsg({ t: 'error', m: e.message })), [])
  useEffect(() => { load() }, [load])

  const funcionarios = data.users.filter((u) => u.role === 'user')
  const ativos = funcionarios.filter((u) => u.ativo).length
  const cheio = ativos >= data.max_usuarios

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api('/users', { method: 'POST', body: f })
      setMsg({ t: 'ok', m: 'Funcionário cadastrado. Ele trocará a senha no 1º acesso.' })
      setF(empty)
      setOpen(false)
      load()
    } catch (err) {
      setMsg({ t: 'error', m: err.message })
    }
    setBusy(false)
  }

  const act = async (fn) => {
    setMsg(null)
    try { await fn(); load() } catch (err) { setMsg({ t: 'error', m: err.message }) }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="muted">Funcionários ativos: {ativos} de {data.max_usuarios}</p>
        </div>
        <button className="btn primary" disabled={cheio && !open} onClick={() => setOpen(!open)}>{open ? 'Fechar' : '+ Novo usuário'}</button>
      </div>
      {cheio && <div className="alert info">Limite de funcionários atingido. Para adicionar mais, fale com o suporte.</div>}
      {msg && <div className={`alert ${msg.t}`}>{msg.m}</div>}

      {open && (
        <form className="card grid-form" onSubmit={submit}>
          <label className="field"><span>Nome</span><input required value={f.nome} onChange={set('nome')} /></label>
          <label className="field"><span>E-mail (login)</span><input type="email" required value={f.email} onChange={set('email')} /></label>
          <label className="field"><span>Senha provisória</span><input required minLength={6} value={f.senha} onChange={set('senha')} /></label>
          <div className="form-actions"><button className="btn primary" disabled={busy}>Cadastrar</button></div>
        </form>
      )}

      <div className="list">
        {data.users.map((u) => (
          <div className="card item" key={u.id}>
            <div className="item-main">
              <div className="item-title">
                {u.nome} <span className={`badge ${u.role === 'admin' ? 'adm' : ''}`}>{u.role === 'admin' ? 'ADM' : 'Funcionário'}</span>
                {!u.ativo && <span className="badge off">Inativo</span>}
              </div>
              <div className="muted">{u.email}</div>
            </div>
            {u.role === 'user' && (
              <div className="item-actions">
                <button className="btn sm" onClick={() => {
                  const nova_senha = prompt(`Nova senha provisória para ${u.nome} (mín. 6 caracteres):`)
                  if (nova_senha) act(() => api(`/users/${u.id}`, { method: 'PUT', body: { nova_senha } }))
                }}>Nova senha</button>
                <button className="btn sm" onClick={() => act(() => api(`/users/${u.id}`, { method: 'PUT', body: { ativo: !u.ativo } }))}>
                  {u.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button className="btn sm danger" onClick={() => {
                  if (confirm(`Excluir ${u.nome}?`)) act(() => api(`/users/${u.id}`, { method: 'DELETE' }))
                }}>Excluir</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
