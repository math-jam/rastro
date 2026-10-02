import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtDate, fmtDateTime, fmtNum } from '../api'
import { useAuth } from '../auth.jsx'

export default function OrderList() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback((term) => {
    api(`/orders?q=${encodeURIComponent(term)}`).then(setRows).catch((e) => setErr(e.message))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q, load])

  const remove = async (o) => {
    if (!confirm(`Excluir a OS ${o.numero}? Isso apaga também as imagens.`)) return
    try {
      await api(`/orders/${o.id}`, { method: 'DELETE' })
      load(q)
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Ordens de serviço</h1>
          <p className="muted">{isAdmin ? 'Todas as OSs da empresa' : 'Suas OSs'}</p>
        </div>
        <Link to="/os/nova" className="btn primary">+ Nova OS</Link>
      </div>

      <input className="search" type="search" placeholder="Buscar por número, rua, bairro ou município…" value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <div className="alert error">{err}</div>}

      <div className="list">
        {rows === null && !err && <div className="spinner" />}
        {rows?.map((o) => (
          <div className="card item" key={o.id}>
            <Link to={`/os/${o.id}/imprimir`} className="item-main link">
              <div className="item-title">OS {o.numero} <span className={`badge st-${o.status === 'Concluído' ? 'ok' : o.status === 'Em andamento' ? 'warn' : ''}`}>{o.status}</span></div>
              <div className="muted">{o.logradouro || '—'}</div>
              <div className="muted">{[o.bairro, o.municipio].filter(Boolean).join(' · ')}</div>
              <div className="chips">
                <span className="chip">Abertura {fmtDate(o.abertura)}</span>
                {o.tamanho_m != null && <span className="chip">{fmtNum(o.tamanho_m)} m²</span>}
                <span className="chip">Criada por {o.autor}</span>
                {o.updated_by && <span className="chip">Alterada {fmtDateTime(o.updated_at)} por {o.atualizado_por}</span>}
              </div>
            </Link>
            <div className="item-actions">
              <Link to={`/os/${o.id}/imprimir`} className="btn sm primary">Imprimir / PDF</Link>
              {isAdmin && <Link to={`/os/${o.id}/editar`} className="btn sm">Editar</Link>}
              {isAdmin && <Link to={`/historico?os=${o.id}`} className="btn sm">Histórico</Link>}
              {isAdmin && <button className="btn sm danger" onClick={() => remove(o)}>Excluir</button>}
            </div>
          </div>
        ))}
        {rows?.length === 0 && <p className="empty">{q ? 'Nada encontrado.' : 'Nenhuma OS ainda. Toque em “Nova OS” para começar.'}</p>}
      </div>
    </>
  )
}
