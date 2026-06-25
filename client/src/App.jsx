import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import Admin from './pages/Admin.jsx'
import History from './pages/History.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Player from './pages/Player.jsx'
import { clearSession, getStoredUser } from './services/api.js'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/player', label: 'Player' },
  { to: '/history', label: 'History' },
  { to: '/admin', label: 'Admin' },
  { to: '/login', label: 'Login' },
]

function App() {
  const [sessionUser, setSessionUser] = useState(() => getStoredUser())

  useEffect(() => {
    function syncSession() {
      setSessionUser(getStoredUser())
    }

    window.addEventListener('melodynet-session-changed', syncSession)
    window.addEventListener('focus', syncSession)
    return () => {
      window.removeEventListener('melodynet-session-changed', syncSession)
      window.removeEventListener('focus', syncSession)
    }
  }, [])

  function handleLogout() {
    clearSession()
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <NavLink to="/" className="brand">
            MELODYNET
          </NavLink>
          <p className="brand-subtitle">Auth + search + audio stream bridge</p>
        </div>

        <div className="header-actions">
          {sessionUser ? <span className="session-badge">Hello, {sessionUser.username}</span> : null}
          {sessionUser ? (
            <button className="button button-secondary" type="button" onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <NavLink className="button button-secondary" to="/login">
              Login
            </NavLink>
          )}
        </div>
      </header>

      <nav className="app-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/history" element={<History />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/player" element={<Player />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

