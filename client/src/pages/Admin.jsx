import { useEffect, useMemo, useState } from 'react'
import {
  deleteAdminSong,
  getAdminWebSocketUrl,
  getAdminStats,
  getAuthToken,
  getStoredUser,
  listAdminSongs,
  uploadAdminSong,
} from '../services/api.js'

function Admin() {
  const [sessionUser, setSessionUser] = useState(() => getStoredUser())
  const [songs, setSongs] = useState([])
  const [songQuery, setSongQuery] = useState('')
  const [stats, setStats] = useState({
    songs_total: 0,
    history_total: 0,
    active_tcp_connections: 0,
    active_bridge_clients: 0,
    online_users: 0,
    active_downloads: 0,
    updated_at: null,
  })
  const [chartPoints, setChartPoints] = useState([])
  const [message, setMessage] = useState('Admin dashboard ready.')
  const [isLoadingSongs, setIsLoadingSongs] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState({ title: '', artist: '', file: null })

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
    if (!sessionUser?.is_admin) {
      return undefined
    }

    void loadStats()
    void loadSongs(songQuery)

    const adminUrl = new URL(getAdminWebSocketUrl())
    const token = getAuthToken()
    if (token) {
      adminUrl.searchParams.set('token', token)
    }

    const socket = new WebSocket(adminUrl.toString())
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'stats_snapshot' || payload.type === 'stats_update') {
          setStats(payload)
          setChartPoints((current) => [...current, payload.online_users].slice(-12))
        }
        if (payload.type === 'error') {
          setMessage(payload.message ?? 'Admin socket error.')
        }
      } catch {
        setMessage('Received invalid admin socket payload.')
      }
    }

    socket.onerror = () => {
      setMessage('Realtime admin socket failed. Snapshot data is still available.')
    }

    return () => {
      socket.close()
    }
  }, [sessionUser?.is_admin])

  async function loadStats() {
    try {
      const payload = await getAdminStats()
      setStats(payload ?? stats)
      setChartPoints((current) => [...current, payload?.online_users ?? 0].slice(-12))
    } catch (error) {
      setMessage(error.message || 'Unable to load admin stats.')
    }
  }

  async function loadSongs(query = '') {
    setIsLoadingSongs(true)
    try {
      const items = await listAdminSongs(query)
      setSongs(items ?? [])
      setMessage(items?.length ? `Loaded ${items.length} songs.` : 'Song list is empty.')
    } catch (error) {
      setMessage(error.message || 'Unable to load admin songs.')
    } finally {
      setIsLoadingSongs(false)
    }
  }

  async function handleUpload(event) {
    event.preventDefault()
    if (!uploadForm.file) {
      setMessage('Choose a music file before uploading.')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('title', uploadForm.title)
      formData.append('artist', uploadForm.artist)
      formData.append('file', uploadForm.file)
      await uploadAdminSong(formData)
      setUploadForm({ title: '', artist: '', file: null })
      await loadSongs(songQuery)
      await loadStats()
      setMessage('Upload completed.')
    } catch (error) {
      setMessage(error.message || 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleDelete(songId) {
    try {
      await deleteAdminSong(songId)
      setSongs((current) => current.filter((song) => song.id !== songId))
      await loadStats()
      setMessage('Song removed.')
    } catch (error) {
      setMessage(error.message || 'Delete failed.')
    }
  }

  const chartBars = useMemo(() => {
    const points = chartPoints.length ? chartPoints : [0]
    const maxValue = Math.max(...points, 1)
    return points.map((value, index) => ({
      id: `${index}-${value}`,
      height: Math.max(12, Math.round((value / maxValue) * 100)),
      value,
    }))
  }, [chartPoints])

  if (!sessionUser) {
    return (
      <section className="admin-shell">
        <div className="panel page-hero">
          <div>
            <p className="eyebrow">Admin Dashboard</p>
            <h1>Login required</h1>
            <p className="status-line">Sign in with an admin account to manage songs and watch LAN activity.</p>
          </div>
        </div>
      </section>
    )
  }

  if (!sessionUser.is_admin) {
    return (
      <section className="admin-shell">
        <div className="panel page-hero">
          <div>
            <p className="eyebrow">Admin Dashboard</p>
            <h1>Access denied</h1>
            <p className="status-line">Your current account does not have admin permission.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="admin-shell">
      <div className="page-hero panel admin-hero">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Library CRUD and LAN Monitoring</h1>
          <p className="status-line">{message}</p>
        </div>
        <div className="admin-actions">
          <button className="button button-secondary" type="button" onClick={() => loadSongs(songQuery)}>
            Refresh songs
          </button>
          <button className="button button-primary" type="button" onClick={loadStats}>
            Refresh stats
          </button>
        </div>
      </div>

      <div className="admin-metrics">
        <article className="panel metric-card">
          <span className="metric-label">SONGS TOTAL</span>
          <strong>{stats.songs_total}</strong>
          <span className="metric-note">Current library size</span>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">TOTAL PLAYS</span>
          <strong>{stats.history_total}</strong>
          <span className="metric-note">History rows saved on play</span>
        </article>
        <article className="panel metric-card metric-card-highlight">
          <span className="metric-label">ONLINE USERS</span>
          <strong>{stats.online_users}</strong>
          <span className="metric-note">Distinct authenticated websocket users</span>
        </article>
      </div>

      <div className="admin-grid">
        <section className="panel admin-chart">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Realtime</p>
              <h2>Online Users Trend</h2>
            </div>
            <span className="chip chip-active">{stats.active_tcp_connections} TCP active</span>
          </div>

          <div className="chart-bars" aria-hidden="true">
            {chartBars.map((bar) => (
              <span key={bar.id} style={{ height: `${bar.height}%` }} title={`${bar.value} users`} />
            ))}
          </div>

          <div className="admin-stat-grid">
            <div className="metric-inline">
              <span>Bridge clients</span>
              <strong>{stats.active_bridge_clients}</strong>
            </div>
            <div className="metric-inline">
              <span>Downloads active</span>
              <strong>{stats.active_downloads}</strong>
            </div>
            <div className="metric-inline">
              <span>Updated</span>
              <strong>{stats.updated_at ? new Date(stats.updated_at).toLocaleTimeString() : 'n/a'}</strong>
            </div>
          </div>
        </section>

        <section className="panel admin-upload">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Upload</p>
              <h2>Add New Song</h2>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleUpload}>
            <label className="field">
              <span>Title</span>
              <input
                value={uploadForm.title}
                onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Track title"
              />
            </label>

            <label className="field">
              <span>Artist</span>
              <input
                value={uploadForm.artist}
                onChange={(event) => setUploadForm((current) => ({ ...current, artist: event.target.value }))}
                placeholder="Artist name"
              />
            </label>

            <label className="field">
              <span>Music File</span>
              <input
                type="file"
                accept=".wav,.mp3,.ogg"
                onChange={(event) =>
                  setUploadForm((current) => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
              />
            </label>

            <button className="button button-primary" type="submit" disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Upload song'}
            </button>
          </form>
        </section>

        <section className="panel admin-list admin-list-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Library</p>
              <h2>Manage Songs</h2>
            </div>
            <div className="panel-actions">
              <input
                className="input admin-inline-search"
                value={songQuery}
                onChange={(event) => setSongQuery(event.target.value)}
                placeholder="Filter songs"
              />
              <button className="button button-secondary" type="button" onClick={() => loadSongs(songQuery)}>
                Search
              </button>
            </div>
          </div>

          <div className="admin-song-table">
            {isLoadingSongs ? <p className="status-line">Loading songs...</p> : null}
            {songs.map((song) => (
              <article className="admin-song-row admin-song-row-extended" key={song.id}>
                <div>
                  <p className="song-title">{song.title}</p>
                  <p className="song-meta">
                    {song.artist ?? 'Unknown artist'} · {song.file_name}
                  </p>
                </div>
                <div className="admin-song-meta">
                  <strong>{song.mime_type}</strong>
                  <span className="song-meta">{song.file_size_bytes} bytes</span>
                </div>
                <button className="button button-secondary" type="button" onClick={() => handleDelete(song.id)}>
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

export default Admin
