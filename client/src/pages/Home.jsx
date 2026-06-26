import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { clearSession, getAuthToken, getStoredUser, searchSongs } from '../services/api.js'
import { createAudioStream } from '../services/stream.js'
import { createTcpClient } from '../services/tcpClient.js'

function Home() {
  const location = useLocation()
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Nhập từ khóa để tìm bài hát.')
  const [sessionUser, setSessionUser] = useState(() => getStoredUser())
  const [selectedSong, setSelectedSong] = useState(null)
  const [streamState, setStreamState] = useState({ received: 0, total: 0, mimeType: 'audio/wav' })
  const [bridgeReady, setBridgeReady] = useState(false)
  const [tcpStatus, setTcpStatus] = useState('checking')
  const audioRef = useRef(null)
  const bridgeRef = useRef(null)
  const streamMimeRef = useRef('audio/wav')
  const streamRef = useRef(createAudioStream())

  useEffect(() => {
    const bridge = createTcpClient({
      token: getAuthToken(),
      onEvent: (message) => {
        if (message.type === 'stream_begin') {
          setSelectedSong(message.song)
          streamMimeRef.current = message.mime_type ?? 'audio/wav'
          setStreamState({
            received: 0,
            total: message.total_chunks ?? 0,
            mimeType: streamMimeRef.current,
          })
          setStatus(`Đang nhận audio cho "${message.song.title}".`)
          return
        }

        if (message.type === 'stream_chunk') {
          streamRef.current.appendChunk({
            seqNo: message.seq_no ?? 0,
            data: message.data,
          })
          setStreamState((current) => ({
            ...current,
            received: current.received + 1,
          }))
          return
        }

        if (message.type === 'stream_end') {
          const audioUrl = streamRef.current.finalize({
            mimeType: message.mime_type ?? streamMimeRef.current,
          })
          if (audioUrl && audioRef.current) {
            audioRef.current.src = audioUrl
            audioRef.current.load()
            audioRef.current.play().catch(() => {})
          }
          setStatus(`Stream đã hoàn tất cho song #${message.song_id}.`)
        }
      },
    })

    bridgeRef.current = bridge
    bridge
      .connect()
      .then(() => {
        setBridgeReady(true)
        return bridge.pingTcpServer()
      })
      .then(() => {
        setTcpStatus('ok')
      })
      .catch(() => {
        setBridgeReady(false)
        setTcpStatus('error')
        setStatus('WebSocket bridge đã mở nhưng TCP core chưa phản hồi.')
      })

    return () => {
      bridge.close()
    }
  }, [])

  async function handleSearch(event) {
    event.preventDefault()
    setLoading(true)
    setStatus('Đang tìm bài hát...')

    try {
      if (bridgeReady && bridgeRef.current) {
        const items = await bridgeRef.current.searchSongs(query)
        setResults(items ?? [])
        setStatus(items?.length ? `Tìm thấy ${items.length} bài hát.` : 'Không có kết quả phù hợp.')
      } else {
        const response = await searchSongs(query)
        setResults(response.items ?? [])
        setStatus(response.items?.length ? `Tìm thấy ${response.items.length} bài hát.` : 'Không có kết quả phù hợp.')
      }
    } catch (error) {
      setStatus(error.message || 'Không thể tìm kiếm.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePlay(song) {
    const bridge = bridgeRef.current
    if (!bridge) {
      setStatus('WebSocket bridge chưa sẵn sàng.')
      return
    }

    streamRef.current.reset()
    setSelectedSong(song)
    setStreamState({ received: 0, total: 0, mimeType: song.mime_type ?? 'audio/wav' })
    setStatus(`Bắt đầu stream "${song.title}"...`)

    try {
      await bridge.playSong(song.id)
    } catch (error) {
      setStatus(error.message || 'Không thể phát bài hát.')
    }
  }

  function handleLogout() {
    clearSession()
    setSessionUser(null)
    setStatus('Đã đăng xuất. Bạn có thể đăng nhập lại để lưu lịch sử nghe.')
  }

  const tcpLabel =
    tcpStatus === 'checking' ? 'Checking…' : tcpStatus === 'ok' ? 'Live ✓' : 'Offline ✕'

  return (
    <section className="home-layout">
      <div className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">Browser to bridge</p>
          <h1>Search trên HTTP, phát nhạc qua WebSocket, lưu lịch sử bằng JWT.</h1>
        </div>

        <div className="hero-stack">
          <div className="mini-card">
            <span>Session</span>
            <strong>{sessionUser ? sessionUser.username : 'Guest'}</strong>
          </div>
          <div className="mini-card">
            <span>WS Bridge</span>
            <strong>{bridgeReady ? 'Connected' : 'Connecting'}</strong>
          </div>
          <div className="mini-card">
            <span>TCP Server :8888</span>
            <strong>{tcpLabel}</strong>
          </div>
          <div className="mini-card">
            <span>Status</span>
            <strong>{loading ? 'Searching' : 'Ready'}</strong>
          </div>
        </div>
      </div>

      <div className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Catalog</p>
              <h2>Tìm bài hát</h2>
            </div>
            <div className="panel-actions">
              {sessionUser ? (
                <button className="button button-secondary" type="button" onClick={handleLogout}>
                  Đăng xuất
                </button>
              ) : (
                <Link className="button button-secondary" to="/login">
                  Đăng nhập
                </Link>
              )}
            </div>
          </div>

          <form className="search-form" onSubmit={handleSearch}>
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo title hoặc artist"
            />
            <button className="button button-primary" type="submit" disabled={loading}>
              {loading ? 'Đang tìm...' : 'Search'}
            </button>
          </form>

          <p className="status-line">{status}</p>

          <div className="results-grid">
            {results.map((song) => (
              <article className="song-card" key={song.id}>
                <div>
                  <p className="song-title">{song.title}</p>
                  <p className="song-meta">{song.artist ?? 'Unknown artist'}</p>
                </div>
                <div className="song-actions">
                  <button className="button button-primary" type="button" onClick={() => handlePlay(song)}>
                    Play
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel player-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Now playing</p>
              <h2>{selectedSong ? selectedSong.title : 'Chưa có bài nào'}</h2>
            </div>
            <Link className="button button-secondary" to="/history">
              History
            </Link>
          </div>

          <p className="status-line">
            {streamState.total
              ? `Received ${streamState.received}/${streamState.total} chunks`
              : 'Chọn một bài hát để bắt đầu stream.'}
          </p>

          <audio ref={audioRef} className="audio-player" controls />

          <div className="song-detail">
            <div>
              <span>Title</span>
              <strong>{selectedSong?.title ?? 'N/A'}</strong>
            </div>
            <div>
              <span>Artist</span>
              <strong>{selectedSong?.artist ?? 'N/A'}</strong>
            </div>
            <div>
              <span>MIME</span>
              <strong>{selectedSong?.mime_type ?? streamState.mimeType}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Home

