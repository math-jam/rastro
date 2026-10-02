import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, fmtDateTime, fmtNum } from '../api'
import { useAuth } from '../auth.jsx'

const ACAO = { criou: 'Criou', editou: 'Editou', excluiu: 'Excluiu' }
const ENTIDADE = { os: 'OS', usuario: 'Usuário', empresa: 'Empresa' }
const CAMPOS = {
  abertura: 'Abertura', logradouro: 'Logradouro', bairro: 'Bairro', municipio: 'Município', uf: 'UF',
  coordenadas: 'Coordenadas', tamanho_m: 'Tamanho (m²)', finalizacao: 'Finalização', status: 'Status',
  ativo: 'Ativo', max_usuarios: 'Máx. de funcionários', nome: 'Nome', senha: 'Senha', email: 'E-mail', cnpj: 'CNPJ',
  endereco_ou_telefone: 'Endereço/telefone', criada_por: 'Criada por', criada_em: 'Criada em',
}
const IMG = { antes: 'Antes', depois: 'Depois', mapa: 'Mapa' }

const show = (k, v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (k === 'tamanho_m') return fmtNum(v)
  return String(v)
}

function Details({ a }) {
  const d = a.details
  if (!d) return null
  const lines = []
  if (Array.isArray(d.campos)) {
    d.campos.forEach((c) => lines.push(<li key={c.campo}><b>{CAMPOS[c.campo] || c.campo}:</b> {show(c.campo, c.de)} → {show(c.campo, c.para)}</li>))
    if (d.imagens_enviadas?.length) lines.push(<li key="ie"><b>Imagens enviadas:</b> {d.imagens_enviadas.map((t) => IMG[t] || t).join(', ')}</li>)
    if (d.imagens_removidas?.length) lines.push(<li key="ir"><b>Imagens removidas:</b> {d.imagens_removidas.map((t) => IMG[t] || t).join(', ')}</li>)
  } else {
    Object.entries(d).forEach(([k, v]) => {
      if (Array.isArray(v) && v.length === 2 && !k.startsWith('imagens'))
        lines.push(<li key={k}><b>{CAMPOS[k] || k}:</b> {show(k, v[0])} → {show(k, v[1])}</li>)
      else if (Array.isArray(v)) lines.push(<li key={k}><b>Imagens:</b> {v.map((t) => IMG[t] || t).join(', ') || 'nenhuma'}</li>)
      else lines.push(<li key={k}><b>{CAMPOS[k] || k}:</b> {k === 'criada_em' ? fmtDateTime(v) : show(k, v)}</li>)
    })
  }
  return lines.length ? <ul className="diff">{lines}</ul> : null
}

export default function History() {
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const os = sp.get('os') || ''
  const [acao, setAcao] = useState('')
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')

  const query = useCallback((before) => {
    const p = new URLSearchParams()
    if (os) p.set('os', os)
    if (acao) p.set('acao', acao)
    if (before) p.set('before', before)
    return api(`/audit?${p}`)
  }, [os, acao])

  useEffect(() => {
    setRows(null)
    query().then((r) => { setRows(r); setMore(r.length === 100) }).catch((e) => setErr(e.message))
  }, [query])

  const loadMore = () => query(rows[rows.length - 1].id).then((r) => { setRows([...rows, ...r]); setMore(r.length === 100) })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Histórico</h1>
          <p className="muted">Registro de tudo que foi criado, editado e excluído{os ? ' nesta OS' : ''}.</p>
        </div>
        {os && <button className="btn" onClick={() => setSp({})}>Ver tudo</button>}
      </div>

      <div className="filters">
        {['', 'criou', 'editou', 'excluiu'].map((a) => (
          <button key={a} className={`btn sm ${acao === a ? 'primary' : ''}`} onClick={() => setAcao(a)}>{a ? ACAO[a] : 'Todos'}</button>
        ))}
      </div>
      {err && <div className="alert error">{err}</div>}

      <div className="list">
        {rows === null && !err && <div className="spinner" />}
        {rows?.map((a) => (
          <div className="card item-col" key={a.id}>
            <div className="hist-top">
              <span className={`badge act-${a.action}`}>{ACAO[a.action]}</span>
              <strong>{ENTIDADE[a.entity]} {a.entity === 'os' ? '' : '·'} {a.entity === 'os' ? a.entity_label.replace('OS ', '#') : a.entity_label}</strong>
              <span className="muted hist-when">{fmtDateTime(a.created_at)}</span>
            </div>
            <div className="muted">por <b>{a.user_nome}</b>{user.role === 'super' && a.empresa ? ` · ${a.empresa}` : ''}</div>
            <Details a={a} />
            {a.entity === 'os' && a.action !== 'excluiu' && !os && (
              <div><Link className="btn sm" to={`/historico?os=${a.entity_id}`}>Histórico desta OS</Link></div>
            )}
          </div>
        ))}
        {rows?.length === 0 && <p className="empty">Nenhum registro.</p>}
      </div>
      {more && <button className="btn block" onClick={loadMore}>Carregar mais</button>}
    </>
  )
}
