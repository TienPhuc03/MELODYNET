import { NavLink, Route, Routes } from 'react-router'
import Admin from './pages/Admin.jsx'
import History from './pages/History.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Player from './pages/Player.jsx'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/player', label: 'Player' },
  { to: '/history', label: 'History' },
  { to: '/admin', label: 'Admin' },
  { to: '/login', label: 'Login' },
]

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <NavLink to="/" className="text-2xl font-bold tracking-tight">
            MELODYNET
          </NavLink>
          <div className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
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
