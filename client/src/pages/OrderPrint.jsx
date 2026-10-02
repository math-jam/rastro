import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmtDate, fmtNum } from '../api'
import { useAuth } from '../auth.jsx'

const statusClass = (s) => (s === 'Concluído' ? 'ok' : s === 'Em andamento' ? 'warn' : 'idle')

function Panel({ title, src, alt, className = '' }) {
  return (
    <div className={`r-panel ${className}`}>
      <div className="r-bar">{title}</div>
      <div className="r-img">{src ? <img src={src} alt={alt} /> : <span>Sem imagem</span>}</div>
    </div>
  )
}

export default function OrderPrint() {
  const { id } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const [o, setO] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api(`/orders/${id}`).then(setO).catch((e) => setErr(e.message))
  }, [id])

  useEffect(() => {
    if (o) document.title = `OS ${o.numero}`
    return () => { document.title = 'RASTRO' }
  }, [o])

  if (err) return <div className="narrow"><div className="alert error">{err}</div><Link to="/" className="btn">Voltar</Link></div>
  if (!o) return <div className="center-screen"><div className="spinner" /></div>

  const ph = o.photos

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <button className="btn" onClick={() => nav('/')}>← Voltar</button>
        <div className="grow" />
        {user.role === 'admin' && <Link to={`/os/${o.id}/editar`} className="btn">Editar</Link>}
        <button className="btn primary" onClick={() => window.print()}>🖨 Imprimir / Salvar PDF</button>
      </div>

      <article className="sheet report">
        <header className="r-head">
          <h1>{o.empresa_nome}</h1>
          <div className="r-meta">
            <div><b>ID DO SERVIÇO:</b> {o.numero}</div>
            <div><b>ABERTURA:</b> {fmtDate(o.abertura)}</div>
          </div>
        </header>

        <div className="r-info">
          <div className="r-cell lbl">Logradouro</div>
          <div className="r-cell val span3"><b>{o.logradouro || '—'}</b></div>
          <div className="r-cell lbl">Bairro</div>
          <div className="r-cell val"><b>{o.bairro || '—'}</b></div>
          <div className="r-cell lbl">Município</div>
          <div className="r-cell val"><b>{[o.municipio, o.uf].filter(Boolean).join(' - ') || '—'}</b></div>
          <div className="r-cell lbl">Coordenadas</div>
          <div className="r-cell val span3 coord"><b>{o.coordenadas || '—'}</b></div>
        </div>

        <div className="r-photos">
          <Panel title="SITUAÇÃO: ANTES" src={ph.antes?.url} alt="Antes" />
          <Panel title="SITUAÇÃO: DEPOIS" src={ph.depois?.url} alt="Depois" />
        </div>

        <Panel title="MAPA DE GEORREFERENCIAMENTO DA ÁREA" src={ph.mapa?.url} alt="Mapa" className="r-map" />

        <div className="r-foot">
          <div className="r-stat"><small>Tamanho em m²</small><strong>{fmtNum(o.tamanho_m)}</strong></div>
          <div className="r-stat"><small>Finalização</small><strong>{o.finalizacao ? fmtDate(o.finalizacao) : '—'}</strong></div>
          <div className={`r-stat status ${statusClass(o.status)}`}><small>Status final</small><strong>{o.status.toUpperCase()}</strong></div>
        </div>

        <p className="r-legal">{o.empresa_razao} - documento gerado eletronicamente e validado via GPS.</p>
      </article>
    </div>
  )
}
