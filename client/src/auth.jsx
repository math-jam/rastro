import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (getToken()) {
      api('/auth/me')
        .then(setUser)
        .catch(logout)
        .finally(() => setLoading(false))
    }
  }, [logout])

  const finish = (r) => {
    setToken(r.token)
    setUser(r.user)
  }

  // Devolve { challenge, email } quando o servidor pede o código enviado por e-mail.
  const login = async (email, senha) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, senha } })
    if (r.need_code) return { challenge: r.challenge, email: r.email }
    finish(r)
    return null
  }
  const verifyCode = async (challenge, code) => finish(await api('/auth/verify-code', { method: 'POST', body: { challenge, code } }))
  const resendCode = (challenge) => api('/auth/resend-code', { method: 'POST', body: { challenge } })

  const refresh = () => api('/auth/me').then(setUser)

  return <Ctx.Provider value={{ user, loading, login, verifyCode, resendCode, logout, refresh }}>{children}</Ctx.Provider>
}
