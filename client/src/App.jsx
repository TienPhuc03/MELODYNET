import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import Admin from './pages/Admin.jsx'
import History from './pages/History.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Player from './pages/Player.jsx'
import { clearSession, getStoredUser } from './services/api.js'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/', label: 'Search' },
  { to: '/player', label: 'Your Library' },
  { to: '/history', label: 'History' },
  { to: '/admin', label: 'Dashboard' },
]

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sessionUser, setSessionUser] = useState(() => getStoredUser())
  const [quickQuery, setQuickQuery] = useState(() => new URLSearchParams(location.search).get('q') ?? '')

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

  function handleTopSearch(event) {
    event.preventDefault()
    navigate(`/?q=${encodeURIComponent(quickQuery.trim())}`)
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block sidebar-brand">
          <NavLink to="/" className="brand">
            MelodyNet
          </NavLink>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={`${item.to}-${item.label}`}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'sidebar-link sidebar-link-active' : 'sidebar-link')}
            >
              {/* <span className="sidebar-link-icon" aria-hidden="true" /> */}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button className="button button-primary sidebar-cta" type="button" onClick={() => navigate('/player')}>
          Create Playlist 
         
        </button>

        <div className="sidebar-footer">
          {/* <button className="sidebar-mini-link" type="button" onClick={() => navigate('/player')}>
            Install App
          </button>
          <button className="sidebar-mini-link" type="button" onClick={() => navigate('/admin')}>
            Settings
          </button> */}
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar panel">
          <div className="topbar-nav">
            <button className="topbar-circle" type="button" onClick={() => navigate(-1)}>
              ‹
            </button>
            <button className="topbar-circle" type="button" onClick={() => navigate(1)}>
              ›
            </button>
          </div>

          <form className="topbar-search" onSubmit={handleTopSearch}>
            <span className="topbar-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              className="topbar-search-input"
              value={quickQuery}
              onChange={(event) => setQuickQuery(event.target.value)}
              placeholder="Search systems, logs..."
            />
          </form>

          <div className="topbar-actions">
            <button className="topbar-icon-button" type="button" title="Notifications">
              ⌁
            </button>
            <button className="topbar-icon-button" type="button" title="Settings">
              ⚙
            </button>
            {sessionUser ? (
              <div className="profile-pill">
                <div className="profile-avatar" aria-hidden="true" />
                <span>{sessionUser.username}</span>
              </div>
            ) : (
              <button className="button button-secondary" type="button" onClick={() => navigate('/login')}>
                Login
              </button>
            )}
            {sessionUser ? (
              <button className="button button-secondary" type="button" onClick={handleLogout}>
                Logout
              </button>
            ) : null}
          </div>
        </header>

        <main className="workspace-main">
          <Routes>
            <Route path="/" element={<Home key={location.search} />} />
            <Route path="/login" element={<Login />} />
            <Route path="/history" element={<History />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/player" element={<Player />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
