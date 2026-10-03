import { useCallback, useEffect, useState } from 'react'
import { addDias, api, diasPara, fmtDate } from '../api'
import { cnpjValido, maskCep, maskCnpj, maskTel, onlyDigits } from '../cnpj'

const empty = {
  nome_fantasia: '', razao_social: '', cnpj: '', telefone: '', email: '', senha: '', max_usuarios: 5, vencimento: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
}

export default function Companies() {
  const [list, setList] = useState([])
  const [f, setF] = useState(empty)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cepMsg, setCepMsg] = useState('')
  const set = (k, mask) => (e) => setF({ ...f, [k]: mask ? mask(e.target.value) : e.target.value })
  const cnpjErro = onlyDigits(f.cnpj).length === 14 && !cnpjValido(f.cnpj)

  const buscaCep = async (value) => {
    const cep = onlyDigits(value)
    setF((p) => ({ ...p, cep: maskCep(value) }))
    setCepMsg('')
    if (cep.length !== 8) return
    setCepMsg('Buscando…')
    try {
      const d = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((r) => r.json())
      if (d.erro) return setCepMsg('CEP não encontrado. Preencha manualmente.')
      setF((p) => ({ ...p, logradouro: d.logradouro || p.logradouro, bairro: d.bairro || p.bairro, cidade: d.localidade, uf: d.uf }))
      setCepMsg('')
    } catch {
      setCepMsg('Não foi possível buscar o CEP. Preencha manualmente.')
    }
  }

  const load = useCallback(() => api('/companies').then(setList).catch((e) => setMsg({ t: 'error', m: e.message })), [])
  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!cnpjValido(f.cnpj)) return setMsg({ t: 'error', m: 'CNPJ inválido.' })
    setBusy(true)
    setMsg(null)
    try {
      await api('/companies', { method: 'POST', body: f })
      setMsg({ t: 'ok', m: `Empresa cadastrada. Login: ${f.email} — senha provisória informada (será trocada no 1º acesso).` })
      setF(empty)
      setOpen(false)
      load()
    } catch (err) {
      setMsg({ t: 'error', m: err.message })
    }
    setBusy(false)
  }

  const update = async (c, patch) => {
    try {
      await api(`/companies/${c.id}`, { method: 'PUT', body: { ...c, ...patch } })
      load()
    } catch (err) {
      setMsg({ t: 'error', m: err.message })
    }
  }

  const resetPwd = (c) => {
    const nova_senha = prompt(`Nova senha provisória para ${c.nome_fantasia} (mín. 6 caracteres):`)
    if (nova_senha) update(c, { nova_senha })
  }
  const bloquear = (c) => {
    if (c.ativo && !confirm(`Bloquear a conta de ${c.nome_fantasia}? Ninguém da empresa conseguirá entrar até você desbloquear.`)) return
    update(c, { ativo: !c.ativo })
  }
  const setVenc = (c, vencimento) => update(c, { vencimento })
  const changeMax = (c) => {
    const v = prompt('Quantidade máxima de funcionários:', c.max_usuarios)
    if (v && +v > 0) update(c, { max_usuarios: +v })
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Empresas</h1>
        <button className="btn primary" onClick={() => setOpen(!open)}>{open ? 'Fechar' : '+ Nova empresa'}</button>
      </div>
      {msg && <div className={`alert ${msg.t}`}>{msg.m}</div>}

      {open && (
        <form className="card grid-form" onSubmit={submit}>
          <label className="field"><span>Nome fantasia</span><input required value={f.nome_fantasia} onChange={set('nome_fantasia')} /></label>
          <label className="field"><span>Nome da empresa (razão social)</span><input required value={f.razao_social} onChange={set('razao_social')} /></label>
          <label className="field"><span>CNPJ</span><input required inputMode="numeric" placeholder="00.000.000/0000-00" value={f.cnpj} onChange={set('cnpj', maskCnpj)} aria-invalid={cnpjErro} />
            {cnpjErro && <small style={{ color: 'var(--danger)' }}>CNPJ inválido</small>}</label>
          <label className="field"><span>Telefone</span><input required type="tel" inputMode="tel" placeholder="(34) 99999-9999" value={f.telefone} onChange={set('telefone', maskTel)} /></label>
          <label className="field"><span>CEP</span><input required inputMode="numeric" placeholder="00000-000" value={f.cep} onChange={(e) => buscaCep(e.target.value)} />
            {cepMsg && <small className="muted">{cepMsg}</small>}</label>
          <label className="field full"><span>Rua / logradouro</span><input required value={f.logradouro} onChange={set('logradouro')} /></label>
          <label className="field"><span>Número</span><input required value={f.numero} onChange={set('numero')} /></label>
          <label className="field"><span>Complemento</span><input value={f.complemento} onChange={set('complemento')} /></label>
          <label className="field"><span>Bairro</span><input required value={f.bairro} onChange={set('bairro')} /></label>
          <label className="field"><span>Cidade</span><input required value={f.cidade} onChange={set('cidade')} /></label>
          <label className="field"><span>UF</span><input required maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} /></label>
          <label className="field"><span>E-mail (será o login)</span><input type="email" required value={f.email} onChange={set('email')} /></label>
          <label className="field"><span>Senha provisória</span><input required minLength={6} value={f.senha} onChange={set('senha')} /></label>
          <label className="field"><span>Máx. de funcionários</span><input type="number" min="1" required value={f.max_usuarios} onChange={set('max_usuarios')} /></label>
          <label className="field"><span>Vencimento da fatura</span><input type="date" value={f.vencimento} onChange={set('vencimento')} /></label>
          <div className="form-actions"><button className="btn primary" disabled={busy}>Cadastrar empresa</button></div>
        </form>
      )}

      <div className="list">
        {list.map((c) => {
          const dias = diasPara(c.vencimento)
          const vcls = dias == null ? '' : dias < 0 ? 'off' : dias <= 5 ? 'st-warn' : 'st-ok'
          return (
          <div className="card item" key={c.id}>
            <div className="item-main">
              <div className="item-title">
                {c.nome_fantasia} {!c.ativo && <span className="badge off">Bloqueada</span>}
              </div>
              <div className="muted">{c.razao_social}</div>
              <div className="muted">{c.email} · desde {fmtDate(c.created_at)}</div>
              {c.cnpj && <div className="muted">CNPJ {maskCnpj(c.cnpj)} · {maskTel(c.telefone)}</div>}
              {c.logradouro && <div className="muted">{c.logradouro}, {c.numero} - {c.bairro}, {c.cidade}/{c.uf} · {maskCep(c.cep)}</div>}
              <div className="chips">
                <span className="chip">Funcionários: {c.usuarios_ativos}/{c.max_usuarios}</span>
                <span className="chip">OSs: {c.total_os}</span>
                <span className={`chip due ${vcls}`}>
                  {dias == null ? 'Sem vencimento' : `Vence ${fmtDate(c.vencimento)}${dias < 0 ? ` (vencida há ${-dias}d)` : dias === 0 ? ' (hoje)' : ` (em ${dias}d)`}`}
                </span>
              </div>
              <div className="row-gap due-edit">
                <input type="date" aria-label="Vencimento da fatura" value={c.vencimento || ''} onChange={(e) => setVenc(c, e.target.value)} />
                <button className="btn sm" title="Soma 30 dias ao vencimento (ou a partir de hoje, se já venceu)"
                  onClick={() => setVenc(c, addDias(dias != null && dias >= 0 ? c.vencimento : '', 30))}>+30 dias</button>
              </div>
            </div>
            <div className="item-actions">
              <button className="btn sm" onClick={() => changeMax(c)}>Limite</button>
              <button className="btn sm" onClick={() => resetPwd(c)}>Nova senha</button>
              <button className={`btn sm ${c.ativo ? 'danger' : ''}`} onClick={() => bloquear(c)}>
                {c.ativo ? 'Bloquear conta' : 'Desbloquear'}
              </button>
            </div>
          </div>
          )
        })}
        {!list.length && <p className="empty">Nenhuma empresa cadastrada ainda.</p>}
      </div>
    </>
  )
}
