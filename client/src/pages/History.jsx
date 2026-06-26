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
    <section className="history-shell">
      <div className="page-hero panel">
        <div>
          <p className="eyebrow">Listening History</p>
          <h1>Lịch sử nghe nhạc</h1>
          <p className="status-line">
            {sessionUser
              ? 'Xem lại những bài hát đã phát gần đây từ tài khoản hiện tại.'
              : 'Đăng nhập để xem lịch sử nghe riêng của bạn.'}
          </p>
        </div>
        <Link className="button button-secondary" to="/">
          Back home
        </Link>
      </div>

      <div className="panel table-panel">
        <div className="history-grid history-grid-head">
          <span>#</span>
          <span>Bài hát</span>
          <span>Nghệ sĩ</span>
          <span>Ngày nghe</span>
          <span>Tệp</span>
        </div>

        <p className="status-line history-message">{sessionUser ? message : 'Không có dữ liệu để hiển thị.'}</p>

        <div className="history-list">
          {historyItems.map((item, index) => (
            <article className="history-grid history-row" key={item.id}>
              <span className="history-index">{index + 1}</span>
              <div>
                <p className="song-title">{item.song.title}</p>
                <p className="song-meta">Streamed from MelodyNet</p>
              </div>
              <span className="song-meta">{item.song.artist ?? 'Unknown artist'}</span>
              <time className="history-time">
                {item.played_at ? new Date(item.played_at).toLocaleString() : 'Unknown time'}
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

