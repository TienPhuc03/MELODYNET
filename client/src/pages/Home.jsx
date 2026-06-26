import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { clearSession, getStoredUser, searchSongs } from '../services/api.js'
import { usePlayer } from '../player/PlayerContext.jsx'

function Home() {
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Search songs by title or artist.')
  const [sessionUser, setSessionUser] = useState(() => getStoredUser())
  const { bridgeReady, tcpStatus, statusMessage, currentSong, streamState, downloadState, playSong } = usePlayer()

  useEffect(() => {
    function syncSession() {
      setSessionUser(getStoredUser())
    }

    window.addEventListener('melodynet-session-changed', syncSession)
    return () => {
      window.removeEventListener('melodynet-session-changed', syncSession)
    }
  }, [])

  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get('q') ?? ''
    setQuery(nextQuery)
    if (nextQuery) {
      void handleSearch(nextQuery)
    }
  }, [location.search])

  async function handleSearch(submittedQuery = query, event = null) {
    if (event) {
      event.preventDefault()
    }

    setLoading(true)
    setMessage('Loading songs...')
    try {
      const response = await searchSongs(submittedQuery)
      const items = response.items ?? []
      setResults(items)
      setMessage(items.length ? `Found ${items.length} songs.` : 'No songs matched your query.')
    } catch (error) {
      setMessage(error.message || 'Unable to load songs.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePlay(song) {
    try {
      await playSong(song)
      navigate('/player')
    } catch (error) {
      setMessage(error.message || 'Unable to start playback.')
    }
  }

  function handleLogout() {
    clearSession()
    setSessionUser(null)
    setMessage('You are signed out. Sign back in to save listening history.')
  }

  const tcpLabel = tcpStatus === 'checking' ? 'Checking' : tcpStatus === 'ok' ? 'Live' : 'Offline'

  return (
    <section className="home-layout">
      <div className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">MelodyNet LAN Audio</p>
          <h1>Search over HTTP, play in the browser, and download files with live TCP progress.</h1>
          <p>{statusMessage}</p>
        </div>

        <div className="hero-stack">
          <div className="mini-card">
            <span>Session</span>
            <strong>{sessionUser ? sessionUser.username : 'Guest'}</strong>
          </div>
          <div className="mini-card">
            <span>Bridge</span>
            <strong>{bridgeReady ? 'Connected' : 'Connecting'}</strong>
          </div>
          <div className="mini-card">
            <span>TCP Core</span>
            <strong>{tcpLabel}</strong>
          </div>
          <div className="mini-card">
            <span>History</span>
            <strong>{sessionUser ? 'Auto save on play' : 'Login to save'}</strong>
          </div>
        </div>
      </div>

      <div className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Catalog</p>
              <h2>Song Search</h2>
            </div>
            <div className="panel-actions">
              {/* {sessionUser ? (
                <button className="button button-secondary" type="button" onClick={handleLogout}>
                  Logout
                </button>
              ) : (
                <Link className="button button-secondary" to="/login">
                  Login
                </Link>
              )} */}
            </div>
          </div>

          <form className="search-form" onSubmit={(event) => handleSearch(query, event)}>
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Moonlight, City, Ensemble..."
            />
            <button className="button button-primary" type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          <p className="status-line">{message}</p>

          <div className="results-grid">
            {results.map((song) => (
              <article className="song-card song-card-extended" key={song.id}>
                <div>
                  <p className="song-title">{song.title}</p>
                  <p className="song-meta">{song.artist ?? 'Unknown artist'}</p>
                </div>
                <div className="song-actions">
                  <button className="button button-primary" type="button" onClick={() => handlePlay(song)}>
                    Play
                  </button>
                  <Link className="button button-secondary" to="/player">
                    Open Player
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel player-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Now Playing</p>
              <h2>{currentSong ? currentSong.title : 'No active song yet'}</h2>
            </div>
            <Link className="button button-secondary" to="/history">
              History
            </Link>
          </div>

          <div className="player-summary-grid">
            <div className="metric-inline">
              <span>Stream chunks</span>
              <strong>{streamState.total ? `${streamState.received}/${streamState.total}` : 'Idle'}</strong>
            </div>
            <div className="metric-inline">
              <span>Download</span>
              <strong>{downloadState.status === 'idle' ? 'Ready' : `${downloadState.progressPercent}%`}</strong>
            </div>
            <div className="metric-inline">
              <span>MIME</span>
              <strong>{currentSong?.mime_type ?? streamState.mimeType}</strong>
            </div>
          </div>

          <p className="status-line">
            {currentSong
              ? `Selected: ${currentSong.title} by ${currentSong.artist ?? 'Unknown artist'}`
              : 'Pick a song from the catalog, then jump to the player for full controls and download.'}
          </p>

          <div className="player-cta-stack">
            <Link className="button button-primary" to="/player">
              Open Full Player
            </Link>
            <Link className="button button-secondary" to="/admin">
              Admin Dashboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Home
