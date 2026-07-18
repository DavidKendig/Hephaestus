import { useState } from 'react'
import logo from '../assets/logo.svg'
import AccountMenu from './AccountMenu.jsx'

export default function Sidebar({
  open, conversations, activeId, user,
  pane = 'chat', onPaneChange, panes = ['chat', 'image', 'code'],
  models = [], model = '', onModelChange, streaming,
  onToggle, onSelect, onNewChat, onDelete, onRename,
  onSignIn, onLogout, onOpenSettings, onOpenAdminSettings,
  onOpenModels, modelPull, onUserUpdate,
}) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

  if (!open) return null

  const commitRename = (id) => {
    setEditingId(null)
    const title = draft.trim()
    if (title) onRename(id, title)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand">
          <img src={logo} alt="" className="brand-logo" />
          Hephaestus
        </span>
        <button className="icon-btn" title="Close sidebar" onClick={onToggle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
      </div>
      <div className="mode-toggle">
        {panes.map((m) => (
          <button
            key={m}
            className={`mode-option ${pane === m ? 'active' : ''}`}
            onClick={() => onPaneChange?.(m)}
          >
            {m === 'chat' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            )}
            {m === 'image' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            )}
            {m === 'code' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
              </svg>
            )}
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <select
        className="model-select-side"
        title={model || 'Select model'}
        value={model}
        onChange={(e) => onModelChange?.(e.target.value)}
        disabled={streaming}
      >
        {models.length === 0 && <option value="">No models</option>}
        {models.map((m) => (
          <option key={m.name} value={m.name}>{m.name}</option>
        ))}
      </select>
      <button className="new-chat-btn" onClick={onNewChat}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
      </button>
      <nav className="conv-list">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`conv-item ${c.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            {editingId === c.id ? (
              <input
                className="conv-rename"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => commitRename(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(c.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <span className="conv-title" title={c.title}>{c.title}</span>
            )}
            <span className="conv-actions">
              <button
                className="icon-btn small"
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingId(c.id)
                  setDraft(c.title)
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
              <button
                className="icon-btn small"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(c.id)
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </span>
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="conv-empty">No conversations yet</p>
        )}
      </nav>
      <AccountMenu
        user={user}
        onSignIn={onSignIn}
        onLogout={onLogout}
        onOpenSettings={onOpenSettings}
        onOpenAdminSettings={onOpenAdminSettings}
        onOpenModels={onOpenModels}
        modelPull={modelPull}
        onUserUpdate={onUserUpdate}
      />
    </aside>
  )
}
