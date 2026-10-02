import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { api, compressImage, fmtDateTime } from '../api'

const today = () => new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso local

const empty = {
  abertura: today(), logradouro: '', bairro: '', municipio: '', uf: '', coordenadas: '',
  tamanho_m: '', finalizacao: '', status: 'Aberto',
}

const SLOTS = [
  ['antes', 'Situação: Antes'],
  ['depois', 'Situação: Depois'],
  ['mapa', 'Mapa de georreferenciamento'],
]

function Slot({ titulo, current, file, preview, onPick, onClear }) {
  const src = preview || current?.url
  return (
    <div className="slot">
      <div className="photo-head">
        <strong>{titulo}</strong>
        <div className="row-gap">
          {file && <button type="button" className="btn sm" onClick={onClear}>Desfazer</button>}
          <label className="btn sm">
            {src ? 'Trocar imagem' : '+ Escolher imagem'}
            <input type="file" accept="image/*" hidden onChange={(e) => { e.target.files[0] && onPick(e.target.files[0]); e.target.value = '' }} />
          </label>
        </div>
      </div>
      <div className="slot-img">{src ? <img src={src} alt={titulo} /> : <span className="muted">Nenhuma imagem</span>}</div>
    </div>
  )
}

export default function OrderForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const editing = !!id
  const [f, setF] = useState(empty)
  const [numero, setNumero] = useState('')
  const [meta, setMeta] = useState(null)
  const [current, setCurrent] = useState({})
  const [picked, setPicked] = useState({}) // tipo -> { file, preview }
  const [err, setErr] = useState('')
  const [gps, setGps] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(editing)

  useEffect(() => {
    if (!editing) return
    api(`/orders/${id}`)
      .then((o) => {
        setF(Object.fromEntries(Object.keys(empty).map((k) => [k, o[k] ?? ''])))
        setNumero(o.numero)
        setMeta(o)
        setCurrent(o.photos)
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [id, editing])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const pick = (tipo, file) => {
    if (picked[tipo]) URL.revokeObjectURL(picked[tipo].preview)
    setPicked((p) => ({ ...p, [tipo]: { file, preview: URL.createObjectURL(file) } }))
  }
  const clear = (tipo) => {
    URL.revokeObjectURL(picked[tipo].preview)
    setPicked(({ [tipo]: _, ...rest }) => rest)
  }

  const useLocation = () => {
    if (!navigator.geolocation) return setGps('Este aparelho não oferece localização.')
    setGps('Obtendo localização…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setF((x) => ({ ...x, coordenadas: `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}` }))
        setGps('')
      },
      () => setGps('Não foi possível obter a localização (verifique a permissão do navegador).'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const form = new FormData()
      Object.entries(f).forEach(([k, v]) => form.append(k, v))
      for (const [tipo, { file }] of Object.entries(picked)) {
        form.append('fotos', await compressImage(file, 2000))
        form.append('tipos', tipo)
      }
      const r = await api(editing ? `/orders/${id}` : '/orders', { method: editing ? 'PUT' : 'POST', form })
      nav(`/os/${r.id}/imprimir`, { replace: true })
    } catch (er) {
      setErr(er.message)
      setBusy(false)
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <form onSubmit={submit} className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">{editing ? `Editar OS ${numero}` : 'Nova OS'}</h1>
          <p className="muted">{editing ? 'O ID do serviço não pode ser alterado.' : 'O ID do serviço é gerado automaticamente ao salvar.'}</p>
        {meta && (
            <p className="audit-note">
              Criada por {meta.autor} em {fmtDateTime(meta.created_at)}
              {meta.atualizado_por ? ` · Última alteração em ${fmtDateTime(meta.updated_at)} por ${meta.atualizado_por}` : ''}
              {' · '}<Link to={`/historico?os=${id}`}>Ver histórico</Link>
            </p>
          )}</div>
      </div>

      <section className="card grid-form">
        <h2 className="section-title full">Local do serviço</h2>
        <label className="field full"><span>Logradouro</span><input required value={f.logradouro} onChange={set('logradouro')} placeholder="Avenida Vitor Alves Pereira" /></label>
        <label className="field"><span>Bairro</span><input required value={f.bairro} onChange={set('bairro')} /></label>
        <label className="field"><span>Município</span><input required value={f.municipio} onChange={set('municipio')} /></label>
        <label className="field"><span>UF</span><input required maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} /></label>
        <label className="field full"><span>Coordenadas</span>
          <div className="row-gap">
            <input value={f.coordenadas} onChange={set('coordenadas')} placeholder="-18.928347, -48.210176" inputMode="text" />
            <button type="button" className="btn" onClick={useLocation}>📍 Usar GPS</button>
          </div>
          {gps && <small className="muted">{gps}</small>}
        </label>
      </section>

      <section className="card grid-form">
        <h2 className="section-title full">Execução</h2>
        <label className="field"><span>Abertura</span><input type="date" required value={f.abertura} onChange={set('abertura')} /></label>
        <label className="field"><span>Finalização</span><input type="date" value={f.finalizacao} onChange={set('finalizacao')} /></label>
        <label className="field"><span>Status final</span>
          <select value={f.status} onChange={set('status')}>
            <option>Aberto</option><option>Em andamento</option><option>Concluído</option>
          </select></label>
        <label className="field"><span>Tamanho (m²)</span><input inputMode="decimal" value={f.tamanho_m} onChange={set('tamanho_m')} placeholder="1412,30" /></label>
      </section>

      <section className="card stack">
        <h2 className="section-title">Imagens</h2>
        {SLOTS.map(([tipo, titulo]) => (
          <Slot key={tipo} titulo={titulo} current={current[tipo]} file={picked[tipo]?.file} preview={picked[tipo]?.preview}
            onPick={(file) => pick(tipo, file)} onClear={() => clear(tipo)} />
        ))}
      </section>

      {err && <div className="alert error">{err}</div>}
      <div className="sticky-actions">
        <button type="button" className="btn" onClick={() => nav(-1)}>Cancelar</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar OS'}</button>
      </div>
    </form>
  )
}
