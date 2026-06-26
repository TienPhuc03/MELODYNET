function sortChunks(chunks) {
  return [...chunks].sort((left, right) => left.seqNo - right.seqNo)
}

export function createChunkBuffer() {
  let chunks = []

  return {
    reset() {
      chunks = []
    },

    appendChunk({ seqNo, data }) {
      chunks.push({
        seqNo,
        data: data instanceof Uint8Array ? data : new Uint8Array(data),
      })
    },

    finalizeBlob({ mimeType = 'application/octet-stream' } = {}) {
      if (!chunks.length) {
        return null
      }
      const orderedChunks = sortChunks(chunks)
      return new Blob(
        orderedChunks.map((item) => item.data),
        { type: mimeType },
      )
    },

    getCount() {
      return chunks.length
    },
  }
}

export function createAudioStream() {
  const buffer = createChunkBuffer()
  let objectUrl = ''
  let lastMimeType = 'audio/wav'

  function revokeCurrentUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = ''
    }
  }

  return {
    reset() {
      revokeCurrentUrl()
      buffer.reset()
      lastMimeType = 'audio/wav'
    },

    appendChunk(payload) {
      buffer.appendChunk(payload)
    },

    finalize({ mimeType = 'audio/wav' } = {}) {
      const blob = buffer.finalizeBlob({ mimeType })
      if (!blob) {
        return ''
      }

      lastMimeType = mimeType
      revokeCurrentUrl()
      objectUrl = URL.createObjectURL(blob)
      return objectUrl
    },

    getStatus() {
      return {
        chunks: buffer.getCount(),
        mimeType: lastMimeType,
        hasUrl: Boolean(objectUrl),
      }
    },
  }
}
