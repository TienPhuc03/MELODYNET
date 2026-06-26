import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { usePlayer } from '../player/PlayerContext.jsx'

function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00'
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function Player() {
  const audioRef = useRef(null)
  const {
    currentSong,
    streamState,
    downloadState,
    playback,
    statusMessage,
    registerAudioElement,
    togglePlayback,
    seekToRatio,
    setVolume,
    toggleMute,
    downloadSong,
  } = usePlayer()

  useEffect(() => {
    registerAudioElement(audioRef.current)
    return () => {
      registerAudioElement(null)
    }
  }, [registerAudioElement])

  const playbackProgress = playback.duration ? Math.round((playback.currentTime / playback.duration) * 100) : 0
  const isBusyDownloading = downloadState.status === 'queued' || downloadState.status === 'downloading'

  return (
    <section className="player-shell">
      <div className="page-hero panel">
        <div>
          <p className="eyebrow">Player</p>
          <h1>{currentSong ? currentSong.title : 'Player Ready'}</h1>
          <p className="status-line">{statusMessage}</p>
        </div>
        <Link className="button button-secondary" to="/">
          Back to search
        </Link>
      </div>

      <div className="player-layout">
        <section className="panel player-stage">
          <div className="player-art">
            <div className="player-disc" />
            <div className="player-art-copy">
              <span>{currentSong?.artist ?? 'MelodyNet'}</span>
              <strong>{currentSong?.title ?? 'Choose a track from Home'}</strong>
            </div>
          </div>

          <audio ref={audioRef} className="native-audio" />

          <div className="progress-block">
            <div className="progress-caption">
              <span>{formatTime(playback.currentTime)}</span>
              <span>{formatTime(playback.duration)}</span>
            </div>
            <input
              className="range-input"
              type="range"
              min="0"
              max="100"
              value={playbackProgress}
              onChange={(event) => seekToRatio(Number(event.target.value) / 100)}
            />
          </div>

          <div className="player-controls">
            <button className="button button-primary" type="button" onClick={togglePlayback} disabled={!currentSong}>
              {playback.isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => downloadSong(currentSong)}
              disabled={!currentSong || isBusyDownloading}
            >
              {isBusyDownloading ? `Downloading ${downloadState.progressPercent}%` : 'Download'}
            </button>
            <button className="button button-secondary" type="button" onClick={toggleMute} disabled={!currentSong}>
              {playback.muted ? 'Unmute' : 'Mute'}
            </button>
          </div>

          <div className="volume-block">
            <span>Volume</span>
            <input
              className="range-input"
              type="range"
              min="0"
              max="100"
              value={Math.round((playback.volume ?? 0) * 100)}
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
            />
          </div>
        </section>

        <aside className="panel player-sidebar">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Transfer Status</p>
              <h2>Playback and Download</h2>
            </div>
          </div>

          <div className="player-summary-grid">
            <div className="metric-inline">
              <span>Stream chunks</span>
              <strong>{streamState.total ? `${streamState.received}/${streamState.total}` : 'Idle'}</strong>
            </div>
            <div className="metric-inline">
              <span>Download state</span>
              <strong>{downloadState.status}</strong>
            </div>
            <div className="metric-inline">
              <span>Bytes</span>
              <strong>
                {downloadState.totalBytes
                  ? `${downloadState.receivedBytes}/${downloadState.totalBytes}`
                  : '0/0'}
              </strong>
            </div>
          </div>

          <div className="download-progress-card">
            <div className="progress-caption">
              <span>Download progress</span>
              <span>{downloadState.progressPercent}%</span>
            </div>
            <div className="progress-bar-shell">
              <span style={{ width: `${downloadState.progressPercent}%` }} />
            </div>
            {/* <p className="status-line">
              {downloadState.fileName
                ? `Target file: ${downloadState.fileName}`
                : 'Start a download to watch TCP progress in real time.'}
            </p> */}
          </div>
       
          <div className="song-detail">
            <div>
              <span>Title</span>
              <strong>{currentSong?.title ?? 'N/A'}</strong>
            </div>
            <div>
              <span>Artist</span>
              <strong>{currentSong?.artist ?? 'N/A'}</strong>
            </div>
            <div>
              <span>MIME</span>
              <strong>{currentSong?.mime_type ?? streamState.mimeType}</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default Player
