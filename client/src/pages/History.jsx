import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getHistory, getStoredUser } from '../services/api.js'

function History() {
  const [historyItems, setHistoryItems] = useState([])
  const [message, setMessage] = useState('Loading listening history...')
  const [sessionUser, setSessionUser] = useState(() => getStoredUser())

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
    if (!sessionUser) {
      setHistoryItems([])
      setMessage('Login to see your listening history.')
      return
    }

    async function loadHistory() {
      try {
        const items = await getHistory()
        setHistoryItems(items ?? [])
        setMessage(items?.length ? 'History loaded.' : 'No songs played yet.')
      } catch (error) {
        setMessage(error.message || 'Unable to load history.')
      }
    }

    void loadHistory()
  }, [sessionUser])

  return (
    <section className="history-shell">
      <div className="page-hero panel">
        <div>
          <p className="eyebrow">Listening History</p>
          <h1>{sessionUser ? `${sessionUser.username}'s playback log` : 'History is locked'}</h1>
          <p className="status-line">{message}</p>
        </div>
        <Link className="button button-secondary" to="/">
          Back home
        </Link>
      </div>

      <div className="history-metrics">
        <article className="panel metric-card">
          <span className="metric-label">TOTAL PLAYS</span>
          <strong>{historyItems.length}</strong>
          <span className="metric-note">Saved automatically when a stream starts.</span>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">LATEST PLAY</span>
          <strong>{historyItems[0]?.song.title ?? 'None'}</strong>
          <span className="metric-note">{historyItems[0]?.song.artist ?? 'Waiting for first listen'}</span>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">ACCOUNT</span>
          <strong>{sessionUser?.username ?? 'Guest'}</strong>
          <span className="metric-note">{sessionUser ? 'Authenticated session' : 'No active session'}</span>
        </article>
      </div>

      <div className="panel table-panel">
        <div className="history-grid history-grid-head">
          <span>#</span>
          <span>Song</span>
          <span>Artist</span>
          <span>Played at</span>
          <span>Format</span>
        </div>

        <div className="history-list">
          {historyItems.map((item, index) => (
            <article className="history-grid history-row" key={item.id}>
              <span className="history-index">{index + 1}</span>
              <div>
                <p className="song-title">{item.song.title}</p>
                <p className="song-meta">Saved by automatic history logging</p>
              </div>
              <span className="song-meta">{item.song.artist ?? 'Unknown artist'}</span>
              <time className="history-time">
                {item.played_at ? new Date(item.played_at).toLocaleString() : 'Unknown'}
              </time>
              <span className="song-meta">{item.song.mime_type ?? 'audio/wav'}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default History
