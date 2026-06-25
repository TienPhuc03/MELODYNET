import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getHistory, getStoredUser } from '../services/api.js'

function History() {
  const [historyItems, setHistoryItems] = useState([])
  const [message, setMessage] = useState('Đang tải lịch sử nghe.')
  const [sessionUser] = useState(() => getStoredUser())

  useEffect(() => {
    async function loadHistory() {
      try {
        const items = await getHistory()
        setHistoryItems(items ?? [])
        setMessage(items?.length ? 'Lịch sử đã sẵn sàng.' : 'Chưa có bài hát nào trong lịch sử.')
      } catch (error) {
        setMessage(error.message || 'Không thể tải lịch sử. Hãy đăng nhập trước.')
      }
    }

    loadHistory()
  }, [])

  return (
    <section className="panel history-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Listening History</p>
          <h1>Lịch sử nghe nhạc</h1>
        </div>
        <Link className="button button-secondary" to="/">
          Back home
        </Link>
      </div>

      <p className="status-line">{sessionUser ? message : 'Đăng nhập để xem lịch sử cá nhân.'}</p>

      <div className="history-list">
        {historyItems.map((item) => (
          <article className="history-card" key={item.id}>
            <div>
              <p className="song-title">{item.song.title}</p>
              <p className="song-meta">{item.song.artist ?? 'Unknown artist'}</p>
            </div>
            <time className="history-time">
              {item.played_at ? new Date(item.played_at).toLocaleString() : 'Unknown time'}
            </time>
          </article>
        ))}
      </div>
    </section>
  )
}

export default History

