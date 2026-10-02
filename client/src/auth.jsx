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

  const login = async (email, senha) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, senha } })
    setToken(r.token)
    setUser(r.user)
  }

  const refresh = () => api('/auth/me').then(setUser)

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>
}
