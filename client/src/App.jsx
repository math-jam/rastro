import { useState } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { diasPara, fmtDate } from './api'
import { useAuth } from './auth.jsx'
import Login from './pages/Login.jsx'
import OrderList from './pages/OrderList.jsx'
import OrderForm from './pages/OrderForm.jsx'
import OrderPrint from './pages/OrderPrint.jsx'
import Users from './pages/Users.jsx'
import Companies from './pages/Companies.jsx'
import History from './pages/History.jsx'
import ChangePassword from './pages/ChangePassword.jsx'

const Icon = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)
const icons = {
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  plus: 'M12 5v14M5 12h14',
  users: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  building: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3',
  clock: 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
}

function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch {}
    setTheme(next)
  }
  return [theme, toggle]
}

// Aviso de fatura: aparece 1x por sessão quando faltam até 5 dias (ou já venceu).
function DueModal() {
  const { user } = useAuth()
  const dias = user.role === 'super' ? null : diasPara(user.empresa_vencimento)
  const key = 'due_seen_' + user.empresa_vencimento
  const [open, setOpen] = useState(() => {
    try { return dias != null && dias <= 5 && !sessionStorage.getItem(key) } catch { return dias != null && dias <= 5 }
  })
  if (!open) return null
  const close = () => {
    try { sessionStorage.setItem(key, '1') } catch {}
    setOpen(false)
  }
  const late = dias < 0
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="due-title" onClick={close}>
      <div className={'card modal' + (late ? ' late' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="due-icon" aria-hidden>{late ? '⚠️' : '🔔'}</div>
        <h2 id="due-title">{late ? 'Fatura vencida' : dias === 0 ? 'Sua fatura vence hoje' : 'Sua fatura está chegando'}</h2>
        <p>
          {late
            ? `O vencimento foi em ${fmtDate(user.empresa_vencimento)} (há ${-dias} ${-dias === 1 ? 'dia' : 'dias'}). Regularize para não ter o acesso bloqueado.`
            : dias === 0
              ? 'O vencimento é hoje. Regularize para não ter o acesso bloqueado.'
              : `Vence em ${fmtDate(user.empresa_vencimento)} (faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}).`}
        </p>
        <button className="btn primary block" autoFocus onClick={close}>Entendi</button>
      </div>
    </div>
  )
}

function Layout() {
  const { user, logout } = useAuth()
  const [theme, toggleTheme] = useTheme()
  const themeLabel = theme === 'dark' ? 'Tema claro' : 'Tema escuro'
  const items = []
  if (user.role === 'super') items.push(['/empresas', 'Empresas', 'building'], ['/historico', 'Histórico', 'clock'])
  else {
    items.push(['/', 'Ordens', 'list'], ['/os/nova', 'Nova OS', 'plus'])
    if (user.role === 'admin') items.push(['/usuarios', 'Usuários', 'users'], ['/historico', 'Histórico', 'clock'])
  }
  items.push(['/senha', 'Senha', 'key'])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/rastro-logo.png" alt="RASTRO" />
          <small className="brand-sub">{user.empresa_nome || 'Administração'}</small>
        </div>
        <nav>
          {items.map(([to, label, ic]) => (
            <NavLink key={to} to={to} end={to === '/'} className="navlink">
              <Icon d={icons[ic]} /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <strong>{user.nome}</strong>
            <small>{{ super: 'Dono do sistema', admin: 'Administrador', user: 'Funcionário' }[user.role]}</small>
          </div>
          <button className="btn ghost sm theme-btn" onClick={toggleTheme}>
            <Icon d={theme === 'dark' ? icons.sun : icons.moon} /> {themeLabel}
          </button>
          <button className="btn ghost sm" onClick={logout}>
            <Icon d={icons.out} /> Sair
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <img className="brand-icon" src="/rastro-icon-64.png" alt="RASTRO" />
          <strong>{user.empresa_nome || 'RASTRO'}</strong>
        </div>
        <div>
          <button className="icon-btn" onClick={toggleTheme} aria-label={themeLabel}>
            <Icon d={theme === 'dark' ? icons.sun : icons.moon} />
          </button>
          <button className="icon-btn" onClick={logout} aria-label="Sair">
            <Icon d={icons.out} />
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
      <DueModal />

      <nav className="tabbar" style={{ '--n': items.length }}>
        {items.map(([to, label, ic]) => (
          <NavLink key={to} to={to} end={to === '/'} className="tab">
            <Icon d={icons[ic]} /> <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Protected({ roles }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="center-screen"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (user.must_change_password && loc.pathname !== '/senha') return <Navigate to="/senha" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <Outlet />
}

function Home() {
  const { user } = useAuth()
  return user.role === 'super' ? <Navigate to="/empresas" replace /> : <OrderList />
}

export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Protected />}>
        {/* Impressão fica fora do Layout para sair limpa no PDF */}
        <Route element={<Protected roles={['admin', 'user']} />}>
          <Route path="/os/:id/imprimir" element={<OrderPrint />} />
        </Route>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/senha" element={<ChangePassword />} />
          <Route element={<Protected roles={['admin', 'user']} />}>
            <Route path="/os/nova" element={<OrderForm />} />
          </Route>
          <Route element={<Protected roles={['admin']} />}>
            <Route path="/os/:id/editar" element={<OrderForm />} />
            <Route path="/usuarios" element={<Users />} />
          </Route>
          <Route element={<Protected roles={['admin', 'super']} />}>
            <Route path="/historico" element={<History />} />
          </Route>
          <Route element={<Protected roles={['super']} />}>
            <Route path="/empresas" element={<Companies />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
