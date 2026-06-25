function bytesToBlobUrl(chunks, mimeType) {
  const blob = new Blob(chunks, { type: mimeType })
  return URL.createObjectURL(blob)
}

export function createAudioStream() {
  let chunks = []
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
      chunks = []
      lastMimeType = 'audio/wav'
    },

    appendChunk({ seqNo, data }) {
      chunks.push({
        seqNo,
        data: data instanceof Uint8Array ? data : new Uint8Array(data),
      })
    },

    finalize({ mimeType = 'audio/wav' } = {}) {
      if (!chunks.length) {
        return ''
      }

      lastMimeType = mimeType
      const orderedChunks = [...chunks].sort((left, right) => left.seqNo - right.seqNo)
      const blobParts = orderedChunks.map((item) => item.data)
      revokeCurrentUrl()
      objectUrl = bytesToBlobUrl(blobParts, lastMimeType)
      return objectUrl
    },

    playOn(audioElement) {
      if (!audioElement || !objectUrl) {
        return Promise.resolve()
      }

      audioElement.src = objectUrl
      audioElement.load()
      return audioElement.play()
    },

    getStatus() {
      return {
        chunks: chunks.length,
        mimeType: lastMimeType,
        hasUrl: Boolean(objectUrl),
      }
    },
  }
}

