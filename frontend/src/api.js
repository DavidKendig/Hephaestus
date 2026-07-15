const port = window.hephaestus?.backendPort || '8155'
export const API_BASE = `http://127.0.0.1:${port}/api`

let token = localStorage.getItem('heph-token') || null

export function setToken(t) {
  token = t
  if (t) localStorage.setItem('heph-token', t)
  else localStorage.removeItem('heph-token')
}

export function hasToken() {
  return !!token
}

function headers(json = false) {
  const h = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function parse(resp) {
  if (!resp.ok) {
    let detail = resp.statusText
    try {
      detail = (await resp.json()).detail || detail
    } catch { /* not json */ }
    const err = new Error(detail)
    err.status = resp.status
    throw err
  }
  return resp.json()
}

const get = (path) => fetch(`${API_BASE}${path}`, { headers: headers() }).then(parse)
const post = (path, body) =>
  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: headers(true),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parse)
const del = (path) =>
  fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: headers() }).then(parse)

// Models & conversations
export const getModels = () => get('/models')
export const listConversations = () => get('/conversations')
export const getConversation = (id) => get(`/conversations/${id}`)
export const deleteConversation = (id) => del(`/conversations/${id}`)
export const renameConversation = (id, title) =>
  fetch(`${API_BASE}/conversations/${id}`, {
    method: 'PATCH',
    headers: headers(true),
    body: JSON.stringify({ title }),
  }).then(parse)

// Auth
export const authStatus = () => get('/auth/status')
export const setup = (username, password) =>
  post('/auth/setup', { username, password })
export const login = (username, password) =>
  post('/auth/login', { username, password })
export const logout = () => post('/auth/logout')
export const changePassword = (current_password, new_password) =>
  post('/auth/change-password', { current_password, new_password })
export const setAvatar = (avatar) => post('/auth/avatar', { avatar })
export const removeAvatar = () => del('/auth/avatar')

// User management (admin)
export const listUsers = () => get('/users')
export const addUser = (username) => post('/users', { username })
export const resetUserPassword = (id) => post(`/users/${id}/reset-password`)
export const deleteUser = (id) => del(`/users/${id}`)

/**
 * POST /api/chat and parse the SSE stream, invoking onEvent for each
 * JSON event: {type: conversation|status|sources|token|error|done, ...}
 */
export async function streamChat(
  { conversationId, model, message, webSearch },
  onEvent,
  signal,
) {
  const resp = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({
      conversation_id: conversationId,
      model,
      message,
      web_search: webSearch,
    }),
    signal,
  })
  if (!resp.ok) {
    let detail = resp.statusText
    try {
      detail = (await resp.json()).detail || detail
    } catch { /* not json */ }
    throw new Error(detail)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()
    for (const part of parts) {
      const line = part.trim()
      if (line.startsWith('data: ')) {
        onEvent(JSON.parse(line.slice(6)))
      }
    }
  }
}
