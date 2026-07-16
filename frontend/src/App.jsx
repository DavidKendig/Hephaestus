import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ChatView from './components/ChatView.jsx'
import Composer from './components/Composer.jsx'
import {
  SetupModal, LoginModal, ChangePasswordModal, ManageUsersModal,
} from './components/AuthModals.jsx'
import * as api from './api.js'

export default function App() {
  const [models, setModels] = useState([])
  const [model, setModel] = useState(
    () => localStorage.getItem('heph-model') || '',
  )
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState('')
  const [backendError, setBackendError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [user, setUser] = useState(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showManageUsers, setShowManageUsers] = useState(false)
  const abortRef = useRef(null)

  const refreshConversations = useCallback(async () => {
    const data = await api.listConversations()
    setConversations(data.conversations)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const data = await api.getModels()
        if (cancelled) return
        setModels(data.models)
        setModel((current) => {
          if (current && data.models.some((m) => m.name === current)) {
            return current
          }
          return data.models[0]?.name || ''
        })
        setBackendError('')
      } catch (err) {
        if (!cancelled) setBackendError(err.message)
      }
      try {
        const status = await api.authStatus()
        if (cancelled) return
        setSetupRequired(status.setup_required)
        if (status.user) {
          setUser(status.user)
        } else if (api.hasToken()) {
          api.setToken(null) // stale/invalidated session
        }
      } catch { /* backend down; error already surfaced */ }
      try {
        if (!cancelled) await refreshConversations()
      } catch { /* backend down; error already surfaced */ }
    }
    boot()
    return () => { cancelled = true }
  }, [refreshConversations])

  useEffect(() => {
    if (model) localStorage.setItem('heph-model', model)
  }, [model])

  const openConversation = useCallback(async (id) => {
    abortRef.current?.abort()
    setActiveId(id)
    if (!id) {
      setMessages([])
      return
    }
    const conv = await api.getConversation(id)
    setMessages(conv.messages)
    if (conv.model) setModel((m) => conv.model || m)
  }, [])

  const send = useCallback(
    async (text, webSearch, images = [], files = [], think) => {
      if ((!text.trim() && !images.length && !files.length)
          || streaming || !model) return
      setStreaming(true)
      setStatus('')
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: text, images,
          files: files.map((f) => ({ name: f.name })) },
        { id: 'pending', role: 'assistant', content: '', pending: true },
      ])

      const controller = new AbortController()
      abortRef.current = controller
      let convId = activeId

      const patchPending = (fn) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === 'pending' ? fn(m) : m)),
        )

      try {
        await api.streamChat(
          { conversationId: activeId, model, message: text, webSearch,
            images, files, think },
          (event) => {
            if (event.type === 'conversation') {
              convId = event.conversation_id
              setActiveId(convId)
            } else if (event.type === 'status') {
              setStatus(event.content)
            } else if (event.type === 'sources') {
              setStatus('')
              patchPending((m) => ({ ...m, sources: event.sources }))
            } else if (event.type === 'token') {
              setStatus('')
              patchPending((m) => ({ ...m, content: m.content + event.content }))
            } else if (event.type === 'tool_event') {
              patchPending((m) => ({
                ...m,
                tool_events: [...(m.tool_events || []), event.event],
              }))
            } else if (event.type === 'error') {
              patchPending((m) => ({ ...m, error: event.content }))
            }
          },
          controller.signal,
        )
      } catch (err) {
        if (err.name !== 'AbortError') {
          patchPending((m) => ({ ...m, error: err.message }))
        }
      } finally {
        setStreaming(false)
        setStatus('')
        abortRef.current = null
        setMessages((prev) =>
          prev.map((m) =>
            m.id === 'pending'
              ? { ...m, id: `a-${Date.now()}`, pending: false }
              : m,
          ),
        )
        refreshConversations().catch(() => {})
      }
    },
    [activeId, model, streaming, refreshConversations],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const removeConversation = useCallback(
    async (id) => {
      await api.deleteConversation(id)
      if (id === activeId) {
        setActiveId(null)
        setMessages([])
      }
      refreshConversations().catch(() => {})
    },
    [activeId, refreshConversations],
  )

  const renameConversation = useCallback(
    async (id, title) => {
      await api.renameConversation(id, title)
      refreshConversations().catch(() => {})
    },
    [refreshConversations],
  )

  // Switch account context: clear the open chat, reload the user's list.
  const enterAccountContext = useCallback((nextUser) => {
    abortRef.current?.abort()
    setUser(nextUser)
    setSetupRequired(false)
    setActiveId(null)
    setMessages([])
    api.listConversations()
      .then((d) => setConversations(d.conversations))
      .catch(() => setConversations([]))
  }, [])

  const handleLogin = useCallback((loggedInUser) => {
    setShowLogin(false)
    enterAccountContext(loggedInUser)
  }, [enterAccountContext])

  const handleLogout = useCallback(async () => {
    try { await api.logout() } catch { /* session may already be gone */ }
    api.setToken(null)
    enterAccountContext(null)
  }, [enterAccountContext])

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        user={user}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSelect={openConversation}
        onNewChat={() => openConversation(null)}
        onDelete={removeConversation}
        onRename={renameConversation}
        onSignIn={() => setShowLogin(true)}
        onLogout={handleLogout}
        onManageUsers={() => setShowManageUsers(true)}
        onChangePassword={() => setShowChangePassword(true)}
        onUserUpdate={setUser}
      />
      <main className="main">
        <header className="topbar">
          {!sidebarOpen && (
            <button
              className="icon-btn"
              title="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <SidebarIcon />
            </button>
          )}
        </header>
        {backendError && (
          <div className="banner-error">
            Backend problem: {backendError}. Is Ollama running?
          </div>
        )}
        <ChatView messages={messages} status={status} streaming={streaming} />
        <Composer
          onSend={send}
          onStop={stop}
          streaming={streaming}
          models={models}
          model={model}
          onModelChange={setModel}
          thinkSupported={
            models.find((m) => m.name === model)
              ?.capabilities?.includes('thinking') ?? false
          }
        />
      </main>

      {setupRequired && !backendError && (
        <SetupModal onDone={handleLogin} />
      )}
      {showLogin && !setupRequired && (
        <LoginModal onDone={handleLogin} onClose={() => setShowLogin(false)} />
      )}
      {user?.must_change_password && (
        <ChangePasswordModal
          forced
          onDone={() => setUser({ ...user, must_change_password: false })}
        />
      )}
      {showChangePassword && user && !user.must_change_password && (
        <ChangePasswordModal
          onDone={() => setShowChangePassword(false)}
          onClose={() => setShowChangePassword(false)}
        />
      )}
      {showManageUsers && user?.is_admin && (
        <ManageUsersModal
          currentUser={user}
          onClose={() => setShowManageUsers(false)}
        />
      )}
    </div>
  )
}

function SidebarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  )
}
