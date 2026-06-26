import { useEffect, useState } from 'react'
import { getHistory, getStoredUser, searchSongs } from '../services/api.js'

function Admin() {
  const [songCount, setSongCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)
  const [previewSongs, setPreviewSongs] = useState([])
  const [sessionUser] = useState(() => getStoredUser())

  useEffect(() => {
    async function loadStats() {
      try {
        const songs = await searchSongs('')
        setSongCount(songs?.length ?? 0)
        setPreviewSongs((songs ?? []).slice(0, 3))
      } catch {
        setSongCount(0)
      }

      try {
        const history = await getHistory()
        setHistoryCount(history?.length ?? 0)
      } catch {
        setHistoryCount(0)
      }
    }

    loadStats()
  }, [])

  const bars = [42, 58, 35, 62, 71, 52, 87, 79, 66, 91, 74, 48]

  return (
    <section className="admin-shell">
      <div className="page-hero panel admin-hero">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Giao diện quản trị</h1>
          <p className="status-line">
            {sessionUser ? `Xin chào ${sessionUser.username}.` : 'Tổng quan nhanh về thư viện nhạc và lượt nghe.'}
          </p>
        </div>

        <div className="admin-actions">
          <button className="button button-secondary" type="button">
            Xuất báo cáo
          </button>
          <button className="button button-primary" type="button">
            Nhập dữ liệu
          </button>
        </div>
      </div>

      <div className="admin-metrics">
        <article className="panel metric-card">
          <span className="metric-label">TOTAL SONGS</span>
          <strong>{songCount}</strong>
          <span className="metric-note">Trong seed data hiện tại</span>
        </article>

        <article className="panel metric-card">
          <span className="metric-label">TOTAL PLAYS</span>
          <strong>{historyCount}</strong>
          <span className="metric-note">Số lượt nghe đã lưu</span>
        </article>

        <article className="panel metric-card metric-card-highlight">
          <span className="metric-label">ACTIVE NOW</span>
          <strong>{sessionUser ? sessionUser.username : 'Guest'}</strong>
          <span className="metric-note">Phiên đăng nhập hiện tại</span>
        </article>
      </div>

      <div className="admin-grid">
        <section className="panel admin-chart">
          <div className="panel-header">
            <div>
              <p className="eyebrow">User Growth</p>
              <h2>Tăng trưởng người dùng</h2>
            </div>
            <div className="chip chip-active">Daily</div>
          </div>

          <div className="chart-bars" aria-hidden="true">
            {bars.map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
        </section>

        <section className="panel admin-trends">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Stream Trends</p>
              <h2>Xu hướng thịnh hành</h2>
            </div>
          </div>

          <div className="trend-list">
            <div className="trend-row">
              <span>V-Pop</span>
              <strong>42%</strong>
            </div>
            <div className="trend-row">
              <span>K-Pop</span>
              <strong>28%</strong>
            </div>
            <div className="trend-row">
              <span>Indie / Chill</span>
              <strong>18%</strong>
            </div>
            <div className="trend-row">
              <span>US-UK</span>
              <strong>12%</strong>
            </div>
          </div>

          <blockquote className="trend-quote">
            “Bản nhạc nhẹ và nhịp chậm đang có xu hướng tăng cao trong khung giờ tối.”
          </blockquote>
        </section>

        <section className="panel admin-list">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Catalogue</p>
              <h2>Bài hát sẵn có</h2>
            </div>
            <span className="chip chip-active">{songCount} items</span>
          </div>

          <div className="admin-song-list">
            {previewSongs.map((song, index) => (
              <article className="admin-song-row" key={song.id}>
                <span className="admin-song-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p className="song-title">{song.title}</p>
                  <p className="song-meta">{song.artist ?? 'Unknown artist'}</p>
                </div>
                <strong className="song-meta">{song.mime_type ?? 'audio/wav'}</strong>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

export default Admin

