const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000')
const CONFIGURED_WS_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_WS_BASE_URL ?? '')
const TOKEN_KEY = 'melodynet_access_token'
const USER_KEY = 'melodynet_user'

function normalizeBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

function toWebSocketOrigin(url) {
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://')
  }
  if (url.startsWith('http://')) {
    return url.replace('http://', 'ws://')
  }
  return url
}

function buildWebSocketUrl(pathname) {
  let wsBaseUrl = CONFIGURED_WS_BASE_URL || toWebSocketOrigin(API_BASE_URL)
  if (wsBaseUrl.endsWith('/ws/bridge') || wsBaseUrl.endsWith('/ws/admin')) {
    wsBaseUrl = wsBaseUrl.slice(0, wsBaseUrl.lastIndexOf('/ws/'))
  }
  if (wsBaseUrl.endsWith(pathname)) {
    return wsBaseUrl
  }
  return `${wsBaseUrl}${pathname}`
}

export function getApiBaseUrl() {
  return API_BASE_URL
}

export function getWebSocketBridgeUrl() {
  return buildWebSocketUrl('/ws/bridge')
}

export function getAdminWebSocketUrl() {
  return buildWebSocketUrl('/ws/admin')
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function getStoredUser() {
  const rawUser = localStorage.getItem(USER_KEY)
  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser)
  } catch {
    return null
  }
}

export function saveSession({ access_token, user }) {
  localStorage.setItem(TOKEN_KEY, access_token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('melodynet-session-changed'))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event('melodynet-session-changed'))
}

function shouldSendJsonHeaders(body) {
  if (body === undefined || body === null) {
    return false
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return false
  }
  return true
}

function buildHeaders(headers = {}, body = undefined) {
  const finalHeaders = { ...headers }
  if (shouldSendJsonHeaders(body) && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json'
  }

  const token = getAuthToken()
  if (token && !finalHeaders.Authorization) {
    finalHeaders.Authorization = `Bearer ${token}`
  }

  return finalHeaders
}

async function readResponse(response) {
  const rawText = await response.text()
  if (!response.ok) {
    try {
      const parsed = JSON.parse(rawText)
      throw new Error(parsed.detail ?? parsed.message ?? `Request failed with status ${response.status}`)
    } catch {
      throw new Error(rawText || `Request failed with status ${response.status}`)
    }
  }

  if (!rawText) {
    return null
  }

  return JSON.parse(rawText)
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options.headers, options.body),
  })

  return readResponse(response)
}

export async function register(payload) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function login(payload) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function me() {
  return apiRequest('/auth/me')
}

export async function searchSongs(query) {
  const params = new URLSearchParams({ q: query ?? '' })
  return apiRequest(`/songs/search?${params.toString()}`)
}

export async function startPlayback(songId) {
  return apiRequest(`/songs/${songId}/play`, {
    method: 'POST',
  })
}

export async function getHistory() {
  return apiRequest('/history/me')
}

export async function listAdminSongs(query = '') {
  const params = new URLSearchParams({ q: query })
  return apiRequest(`/admin/songs?${params.toString()}`)
}

export async function uploadAdminSong(formData) {
  return apiRequest('/admin/songs', {
    method: 'POST',
    body: formData,
  })
}

export async function deleteAdminSong(songId) {
  return apiRequest(`/admin/songs/${songId}`, {
    method: 'DELETE',
  })
}

export async function getAdminStats() {
  return apiRequest('/admin/stats')
}
