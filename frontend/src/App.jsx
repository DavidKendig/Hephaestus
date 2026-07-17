import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ChatView from './components/ChatView.jsx'
import Composer from './components/Composer.jsx'
import {
  SetupModal, LoginModal, ChangePasswordModal,
} from './components/AuthModals.jsx'
import {
  SettingsView, AdminSettingsView, ModelsView,
} from './components/SettingsView.jsx'
import * as api from './api.js'

function loadLastConvByPane() {
  try {
    return JSON.parse(localStorage.getItem('heph-last-conv') || '{}')
  } catch {
    return {}
  }
}

export default function App() {
  const [models, setModels] = useState([])
  const [model, setModel] = useState(
    () => localStorage.getItem('heph-model') || '',
  )
  // Image generation models, hosted by the backend (pane: image).
  const [imageInfo, setImageInfo] = useState({ installed: true, models: [] })
  const [imageModel, setImageModel] = useState(
    () => localStorage.getItem('heph-image-model') || '',
  )
  const [pane, setPane] = useState(
    () => localStorage.getItem('heph-pane') || 'chat',
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
  const [debugMode, setDebugMode] = useState(false)
  // 'chat' | 'settings' | 'admin' | 'models'
  const [view, setView] = useState('chat')
  // Current model download: {name, status, pct, done, error, cancelled}.
  // Lives here (not in ModelsView) so the download keeps streaming and
  // the menu badge stays live while the pane is closed.
  const [modelPull, setModelPull] = useState(null)
  const pullAbortRef = useRef(null)
  const abortRef = useRef(null)
  // Last active conversation per pane (chat / image / code), kept across
  // pane switches and app restarts.
  const lastConvRef = useRef(loadLastConvByPane())

  const refreshConversations = useCallback(async () => {
    const data = await api.listConversations()
    setConversations(data.conversations)
  }, [])

  const refreshModels = useCallback(async () => {
    const data = await api.getModels()
    setModels(data.models)
    setModel((current) => {
      if (current && data.models.some((m) => m.name === current)) {
        return current
      }
      return data.models[0]?.name || ''
    })
  }, [])

  const refreshImageModels = useCallback(async () => {
    const data = await api.getImageModels()
    setImageInfo(data)
    setImageModel((current) => {
      if (current && data.models.some((m) => m.name === current)) {
        return current
      }
      return data.models[0]?.name || ''
    })
  }, [])

  const openConversation = useCallback(async (id) => {
    abortRef.current?.abort()
    setView('chat')
    setActiveId(id)
    if (!id) {
      setMessages([])
      return
    }
    // Remembered conversations may have been deleted (or belong to a
    // previous session) — fall back to an empty chat instead of crashing.
    const conv = await api.getConversation(id).catch(() => null)
    if (!conv) {
      setActiveId(null)
      setMessages([])
      return
    }
    setMessages(conv.messages)
    if (conv.model) setModel((m) => conv.model || m)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        await refreshModels()
        if (cancelled) return
        setBackendError('')
      } catch (err) {
        if (!cancelled) setBackendError(err.message)
      }
      try {
        if (!cancelled) await refreshImageModels()
      } catch { /* backend down; error already surfaced */ }
      try {
        const status = await api.authStatus()
        if (cancelled) return
        setSetupRequired(status.setup_required)
        setDebugMode(!!status.debug)
        if (status.user) {
          setUser(status.user)
        } else if (api.hasToken()) {
          api.setToken(null) // stale/invalidated session
        }
      } catch { /* backend down; error already surfaced */ }
      try {
        if (!cancelled) await refreshConversations()
      } catch { /* backend down; error already surfaced */ }
      // Reopen the conversation that was active in this pane last session.
      const remembered = lastConvRef.current[
        localStorage.getItem('heph-pane') || 'chat'
      ]
      if (!cancelled && remembered) openConversation(remembered)
    }
    boot()
    return () => { cancelled = true }
  }, [refreshConversations, refreshModels, refreshImageModels,
    openConversation])

  useEffect(() => {
    if (model) localStorage.setItem('heph-model', model)
  }, [model])

  useEffect(() => {
    if (imageModel) localStorage.setItem('heph-image-model', imageModel)
  }, [imageModel])

  // Remember the active conversation for the current pane, surviving
  // pane switches and restarts.
  useEffect(() => {
    lastConvRef.current = { ...lastConvRef.current, [pane]: activeId }
    localStorage.setItem('heph-last-conv', JSON.stringify(lastConvRef.current))
    localStorage.setItem('heph-pane', pane)
  }, [pane, activeId])

  const switchPane = useCallback((next) => {
    if (next === pane) return
    setPane(next)
    openConversation(lastConvRef.current[next] || null)
  }, [pane, openConversation])

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

  const sendImage = useCallback(
    async (text) => {
      if (!text.trim() || streaming || !imageModel) return
      setStreaming(true)
      setStatus('')
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: text },
        { id: 'pending', role: 'assistant', content: '', pending: true },
      ])

      const controller = new AbortController()
      abortRef.current = controller

      const patchPending = (fn) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === 'pending' ? fn(m) : m)),
        )

      try {
        await api.streamImage(
          { conversationId: activeId, model: imageModel, message: text },
          (event) => {
            if (event.type === 'conversation') {
              setActiveId(event.conversation_id)
            } else if (event.type === 'status') {
              setStatus(event.content)
            } else if (event.type === 'image') {
              setStatus('')
              patchPending((m) => ({ ...m, images: [event.content] }))
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
    [activeId, imageModel, streaming, refreshConversations],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const startModelPull = useCallback(async (name) => {
    if (pullAbortRef.current) return // one download at a time
    setModelPull({ name, status: 'Starting…', pct: null })
    const controller = new AbortController()
    pullAbortRef.current = controller
    try {
      await api.pullModel(name, (event) => {
        if (event.type === 'progress') {
          setModelPull({
            name,
            status: event.status || 'Downloading…',
            pct: event.total
              ? Math.round(((event.completed || 0) / event.total) * 100)
              : null,
          })
        } else if (event.type === 'error') {
          setModelPull({ name, error: event.content })
        } else if (event.type === 'done') {
          setModelPull({ name, done: true })
        }
      }, controller.signal)
    } catch (err) {
      setModelPull(err.name === 'AbortError'
        ? { name, cancelled: true }
        : { name, error: err.message })
    } finally {
      pullAbortRef.current = null
      refreshModels().catch(() => {})
    }
  }, [refreshModels])

  const cancelModelPull = useCallback(() => {
    pullAbortRef.current?.abort()
  }, [])

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
    setView('chat')
    setActiveId(null)
    setMessages([])
    // Pane memory belongs to the previous account's conversations.
    lastConvRef.current = {}
    localStorage.removeItem('heph-last-conv')
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
        pane={pane}
        onPaneChange={switchPane}
        models={pane === 'image' ? imageInfo.models : models}
        model={pane === 'image' ? imageModel : model}
        onModelChange={pane === 'image' ? setImageModel : setModel}
        streaming={streaming}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSelect={openConversation}
        onNewChat={() => openConversation(null)}
        onDelete={removeConversation}
        onRename={renameConversation}
        onSignIn={() => setShowLogin(true)}
        onLogout={handleLogout}
        onOpenSettings={() => setView('settings')}
        onOpenAdminSettings={() => setView('admin')}
        onOpenModels={() => setView('models')}
        modelPull={modelPull}
        onUserUpdate={setUser}
      />
      <main className="main">
        {debugMode && (
          <div className="banner-debug">
            ⚠ DEBUG MODE — a passwordless debug admin is available on the
            sign-in screen. Do not use with real data; the debug account and
            its chats are deleted on the next normal start.
          </div>
        )}
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
        {view === 'admin' && user?.is_admin ? (
          <AdminSettingsView
            currentUser={user}
            onClose={() => setView('chat')}
          />
        ) : view === 'settings' && user ? (
          <SettingsView onClose={() => setView('chat')} />
        ) : view === 'models' && user ? (
          <ModelsView
            models={models}
            pull={modelPull}
            onPull={startModelPull}
            onCancelPull={cancelModelPull}
            onRefresh={() => refreshModels().catch(() => {})}
            onClose={() => setView('chat')}
          />
        ) : (
          <>
            {pane === 'image' && !imageInfo.installed && (
              <div className="banner-debug">
                Image generation runtime is not installed. Run{' '}
                <code>pip install -r backend/requirements-image.txt</code>
                {' '}and restart Hephaestus.
              </div>
            )}
            <ChatView
              messages={messages}
              status={status}
              streaming={streaming}
            />
            <Composer
              mode={pane === 'image' ? 'image' : 'chat'}
              onSend={pane === 'image' ? sendImage : send}
              onStop={stop}
              streaming={streaming}
              thinkSupported={
                pane !== 'image'
                && (models.find((m) => m.name === model)
                  ?.capabilities?.includes('thinking') ?? false)
              }
            />
          </>
        )}
      </main>

      {setupRequired && !backendError && (
        <SetupModal onDone={handleLogin} />
      )}
      {showLogin && !setupRequired && (
        <LoginModal
          debug={debugMode}
          onDone={handleLogin}
          onClose={() => setShowLogin(false)}
        />
      )}
      {user?.must_change_password && (
        <ChangePasswordModal
          forced
          onDone={() => setUser({ ...user, must_change_password: false })}
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
