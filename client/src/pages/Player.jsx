import { Link } from 'react-router'

function Player() {
  return (
    <section className="panel player-landing">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Audio Player</p>
          <h1>Trình phát nhạc</h1>
        </div>
        <Link className="button button-secondary" to="/">
          Search songs
        </Link>
      </div>

      <p className="status-line">
        Trang này giữ vai trò làm khu vực phát nhạc. Khi bấm Play ở Home, browser sẽ nhận stream từ
        WebSocket bridge và tạo `Blob` audio để phát trong trình duyệt.
      </p>

      <div className="player-canvas">
        <div className="player-ring" />
        <div className="player-ring player-ring-secondary" />
        <div className="player-card">
          <span>Live stream ready</span>
          <strong>MELODYNET</strong>
        </div>
      </div>
    </section>
  )
}

export default Player

