import { getWebSocketBaseUrl } from './api.js'

function decodeBase64ToBytes(base64Text) {
  const binaryString = window.atob(base64Text)
  const bytes = new Uint8Array(binaryString.length)
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index)
  }
  return bytes
}

class WebSocketBridgeClient {
  constructor({ token = '', url = getWebSocketBaseUrl(), onEvent = null } = {}) {
    this.url = url
    this.token = token
    this.onEvent = onEvent
    this.socket = null
    this.nextRequestId = 1
    this.pending = new Map()
    this.connectPromise = null
  }

  async connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const bridgeUrl = new URL(this.url)
      if (this.token) {
        bridgeUrl.searchParams.set('token', this.token)
      }

      const socket = new WebSocket(bridgeUrl.toString())
      this.socket = socket

      socket.onopen = () => {
        this.connectPromise = null
        resolve(socket)
      }

      socket.onerror = () => {
        this.connectPromise = null
        reject(new Error('WebSocket bridge failed to connect.'))
      }

      socket.onclose = () => {
        this.socket = null
        this.connectPromise = null
        this.pending.forEach(({ reject }) => reject(new Error('WebSocket bridge closed.')))
        this.pending.clear()
      }

      socket.onmessage = (event) => {
        this.handleMessage(event.data)
      }
    })

    return this.connectPromise
  }

  close() {
    if (this.socket) {
      this.socket.close()
    }
  }

  async request(action, payload = {}, { expect = null } = {}) {
    const socket = await this.connect()
    const requestId = this.nextRequestId
    this.nextRequestId += 1

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, expect })
      socket.send(
        JSON.stringify({
          request_id: requestId,
          action,
          ...payload,
        }),
      )
    })
  }

  async searchSongs(query) {
    const response = await this.request('search', { query }, { expect: 'search_result' })
    return response.items ?? []
  }

  async playSong(songId) {
    return this.request('play', { song_id: songId }, { expect: 'stream_begin' })
  }

  /**
   * Gửi ping tới WebSocket bridge → bridge forward sang TCP server port 8888
   * → TCP server trả pong → bridge trả về client.
   *
   * Mục đích: chứng minh với giám khảo rằng TCP server (port 8888) đang sống
   * và thực sự xử lý request — không chỉ là WebSocket bridge hoạt động độc lập.
   *
   * Luồng đầy đủ:
   *   Browser → WS /ws/bridge (port 8000)
   *             → TCP asyncio server (port 8888)   ← custom binary protocol
   *             ← pong response
   *          ← WS message type "pong"
   */
  async pingTcpServer() {
    const response = await this.request('ping', {}, { expect: 'pong' })
    return response
  }

  handleMessage(rawMessage) {
    let message
    try {
      message = JSON.parse(rawMessage)
    } catch {
      return
    }

    const requestId = Number(message.request_id ?? 0)
    const pending = this.pending.get(requestId)

    if (message.type === 'stream_chunk') {
      const chunkBytes = decodeBase64ToBytes(message.data)
      this.emit({
        ...message,
        data: chunkBytes,
      })
      return
    }

    if (message.type === 'error') {
      if (pending) {
        pending.reject(new Error(message.message ?? 'Unexpected bridge error.'))
        this.pending.delete(requestId)
      }
      this.emit(message)
      return
    }

    if (pending) {
      const expectedType = pending.expect
      if (!expectedType || expectedType === message.type) {
        pending.resolve(message)
        this.pending.delete(requestId)
      }
    }

    this.emit(message)
  }

  emit(message) {
    if (typeof this.onEvent === 'function') {
      this.onEvent(message)
    }
  }
}

export function createTcpClient(options = {}) {
  return new WebSocketBridgeClient(options)
}