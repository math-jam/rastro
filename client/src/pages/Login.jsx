import { useState } from 'react'
import { useAuth } from '../auth.jsx'

export default function Login() {
  const { login, verifyCode, resendCode } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [step, setStep] = useState(null) // { challenge, email } quando aguardando o código
  const [code, setCode] = useState('')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErro('')
    setInfo('')
    try {
      if (step) await verifyCode(step.challenge, code)
      else {
        const s = await login(email, senha)
        if (s) setStep(s)
      }
    } catch (err) {
      setErro(err.message)
    }
    setBusy(false)
  }

  const resend = async () => {
    setErro('')
    setInfo('')
    try {
      await resendCode(step.challenge)
      setInfo('Novo código enviado.')
    } catch (err) {
      setErro(err.message)
    }
  }

  const back = () => {
    setStep(null)
    setCode('')
    setErro('')
    setInfo('')
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-head">
          <img className="login-logo" src="/rastro-logo.png" alt="RASTRO" />
          <p className="muted">{step ? `Enviamos um código de 6 dígitos para ${step.email}` : 'Entre com seu e-mail e senha'}</p>
        </div>
        {step ? (
          <label className="field">
            <span>Código de verificação</span>
            <input autoFocus required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
        ) : (
          <>
            <label className="field">
              <span>E-mail</span>
              <input type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Senha</span>
              <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            </label>
          </>
        )}
        {erro && <div className="alert error">{erro}</div>}
        {info && <div className="alert ok">{info}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : step ? 'Confirmar' : 'Entrar'}</button>
        {step && (
          <div className="row-gap">
            <button type="button" className="btn ghost sm" onClick={resend}>Reenviar código</button>
            <button type="button" className="btn ghost sm" onClick={back}>Voltar</button>
          </div>
        )}
      </form>
    </div>
  )
}
