import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getAuthToken } from '../services/api.js'
import { createAudioStream, createChunkBuffer } from '../services/stream.js'
import { createTcpClient } from '../services/tcpClient.js'

const PlayerContext = createContext(null)

function revokeUrl(url) {
  if (url) {
    URL.revokeObjectURL(url)
  }
}

function triggerBrowserDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => revokeUrl(objectUrl), 1500)
}

export function PlayerProvider({ children }) {
  const [sessionToken, setSessionToken] = useState(() => getAuthToken())
  const [bridgeReady, setBridgeReady] = useState(false)
  const [tcpStatus, setTcpStatus] = useState('checking')
  const [statusMessage, setStatusMessage] = useState('Bridge is connecting.')
  const [currentSong, setCurrentSong] = useState(null)
  const [streamState, setStreamState] = useState({ received: 0, total: 0, mimeType: 'audio/wav' })
  const [downloadState, setDownloadState] = useState({
    status: 'idle',
    receivedBytes: 0,
    totalBytes: 0,
    progressPercent: 0,
    fileName: '',
    mimeType: 'application/octet-stream',
  })
  const [audioUrl, setAudioUrl] = useState('')
  const [audioElement, setAudioElement] = useState(null)
  const [playback, setPlayback] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    muted: false,
  })
  const bridgeRef = useRef(null)
  const streamBufferRef = useRef(createAudioStream())
  const downloadBufferRef = useRef(createChunkBuffer())
  const pendingAutoplayRef = useRef(false)
  const streamMimeRef = useRef('audio/wav')

  useEffect(() => {
    function syncSession() {
      setSessionToken(getAuthToken())
    }

    window.addEventListener('melodynet-session-changed', syncSession)
    return () => {
      window.removeEventListener('melodynet-session-changed', syncSession)
    }
  }, [])

  useEffect(() => {
    const bridge = createTcpClient({
      token: sessionToken,
      onEvent: (message) => {
        if (message.type === 'stream_begin') {
          streamBufferRef.current.reset()
          streamMimeRef.current = message.mime_type ?? 'audio/wav'
          setCurrentSong(message.song)
          setStreamState({
            received: 0,
            total: message.total_chunks ?? 0,
            mimeType: streamMimeRef.current,
          })
          setStatusMessage(`Streaming ${message.song.title}`)
          return
        }

        if (message.type === 'stream_chunk') {
          streamBufferRef.current.appendChunk({
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
          const nextUrl = streamBufferRef.current.finalize({
            mimeType: streamMimeRef.current,
          })
          setAudioUrl((current) => {
            revokeUrl(current)
            return nextUrl
          })
          pendingAutoplayRef.current = true
          setStatusMessage('Audio stream is ready.')
          return
        }

        if (message.type === 'download_begin') {
          downloadBufferRef.current.reset()
          setCurrentSong(message.song)
          setDownloadState({
            status: 'downloading',
            receivedBytes: 0,
            totalBytes: message.total_bytes ?? 0,
            progressPercent: 0,
            fileName: message.file_name ?? 'track.bin',
            mimeType: message.mime_type ?? 'application/octet-stream',
          })
          setStatusMessage(`Downloading ${message.song.title}`)
          return
        }

        if (message.type === 'download_chunk') {
          downloadBufferRef.current.appendChunk({
            seqNo: message.seq_no ?? 0,
            data: message.data,
          })
          setDownloadState((current) => {
            const totalBytes = message.total_bytes ?? current.totalBytes ?? 0
            const receivedBytes = message.bytes_sent ?? current.receivedBytes
            return {
              ...current,
              status: 'downloading',
              receivedBytes,
              totalBytes,
              progressPercent: totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : 0,
            }
          })
          return
        }

        if (message.type === 'download_end') {
          setDownloadState((current) => {
            const blob = downloadBufferRef.current.finalizeBlob({ mimeType: current.mimeType })
            if (blob) {
              triggerBrowserDownload(blob, current.fileName || 'track.bin')
            }
            return {
              ...current,
              status: 'completed',
              progressPercent: 100,
              receivedBytes: current.totalBytes,
            }
          })
          setStatusMessage('Download completed.')
          return
        }

        if (message.type === 'error') {
          setStatusMessage(message.message ?? 'Bridge error.')
          setDownloadState((current) =>
            current.status === 'downloading'
              ? {
                  ...current,
                  status: 'failed',
                }
              : current,
          )
        }
      },
    })

    bridgeRef.current = bridge
    setBridgeReady(false)
    setTcpStatus('checking')

    bridge
      .connect()
      .then(() => {
        setBridgeReady(true)
        return bridge.pingTcpServer()
      })
      .then(() => {
        setTcpStatus('ok')
        setStatusMessage((current) => (current === 'Bridge is connecting.' ? 'Bridge ready.' : current))
      })
      .catch(() => {
        setBridgeReady(false)
        setTcpStatus('error')
        setStatusMessage('Bridge connected but TCP core is unavailable.')
      })

    return () => {
      bridge.close()
    }
  }, [sessionToken])

  useEffect(() => {
    if (!audioElement) {
      return undefined
    }

    audioElement.volume = playback.volume
    audioElement.muted = playback.muted

    function syncPlaybackState() {
      setPlayback({
        isPlaying: !audioElement.paused,
        currentTime: audioElement.currentTime || 0,
        duration: Number.isFinite(audioElement.duration) ? audioElement.duration : 0,
        volume: audioElement.volume,
        muted: audioElement.muted,
      })
    }

    audioElement.addEventListener('timeupdate', syncPlaybackState)
    audioElement.addEventListener('durationchange', syncPlaybackState)
    audioElement.addEventListener('play', syncPlaybackState)
    audioElement.addEventListener('pause', syncPlaybackState)
    audioElement.addEventListener('volumechange', syncPlaybackState)
    audioElement.addEventListener('ended', syncPlaybackState)
    syncPlaybackState()

    return () => {
      audioElement.removeEventListener('timeupdate', syncPlaybackState)
      audioElement.removeEventListener('durationchange', syncPlaybackState)
      audioElement.removeEventListener('play', syncPlaybackState)
      audioElement.removeEventListener('pause', syncPlaybackState)
      audioElement.removeEventListener('volumechange', syncPlaybackState)
      audioElement.removeEventListener('ended', syncPlaybackState)
    }
  }, [audioElement, playback.muted, playback.volume])

  useEffect(() => {
    if (!audioElement || !audioUrl) {
      return
    }

    audioElement.src = audioUrl
    audioElement.load()

    if (pendingAutoplayRef.current) {
      pendingAutoplayRef.current = false
      audioElement.play().catch(() => {})
    }
  }, [audioElement, audioUrl])

  useEffect(() => {
    return () => {
      revokeUrl(audioUrl)
    }
  }, [audioUrl])

  async function playSong(song) {
    const bridge = bridgeRef.current
    if (!bridge) {
      throw new Error('Bridge is not ready.')
    }

    pendingAutoplayRef.current = true
    streamBufferRef.current.reset()
    setCurrentSong(song)
    setStreamState({ received: 0, total: 0, mimeType: song.mime_type ?? 'audio/wav' })
    setStatusMessage(`Starting ${song.title}`)
    await bridge.playSong(song.id)
  }

  async function downloadSong(song = currentSong) {
    const bridge = bridgeRef.current
    if (!bridge) {
      throw new Error('Bridge is not ready.')
    }
    if (!song) {
      throw new Error('Choose a song first.')
    }

    downloadBufferRef.current.reset()
    setDownloadState({
      status: 'queued',
      receivedBytes: 0,
      totalBytes: 0,
      progressPercent: 0,
      fileName: song.title,
      mimeType: song.mime_type ?? 'application/octet-stream',
    })
    await bridge.downloadSong(song.id)
  }

  function togglePlayback() {
    if (!audioElement) {
      return
    }
    if (audioElement.paused) {
      audioElement.play().catch(() => {})
      return
    }
    audioElement.pause()
  }

  function seekToRatio(ratio) {
    if (!audioElement || !playback.duration) {
      return
    }
    const nextTime = Math.max(0, Math.min(1, ratio)) * playback.duration
    audioElement.currentTime = nextTime
  }

  function setVolume(nextVolume) {
    if (!audioElement) {
      return
    }
    const safeVolume = Math.max(0, Math.min(1, nextVolume))
    audioElement.volume = safeVolume
    if (safeVolume > 0 && audioElement.muted) {
      audioElement.muted = false
    }
  }

  function toggleMute() {
    if (!audioElement) {
      return
    }
    audioElement.muted = !audioElement.muted
  }

  const value = {
    bridgeReady,
    tcpStatus,
    statusMessage,
    currentSong,
    streamState,
    downloadState,
    playback,
    playSong,
    downloadSong,
    registerAudioElement: setAudioElement,
    togglePlayback,
    seekToRatio,
    setVolume,
    toggleMute,
  }

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const context = useContext(PlayerContext)
  if (!context) {
    throw new Error('usePlayer must be used inside PlayerProvider.')
  }
  return context
}
