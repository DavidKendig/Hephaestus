import { useEffect, useState } from 'react'
import * as api from '../api.js'
import { Avatar } from './AccountMenu.jsx'

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose ? (e) => {
      if (e.target === e.currentTarget) onClose()
    } : undefined}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

function FormError({ error }) {
  return error ? <p className="form-error">{error}</p> : null
}

/** First-run: create the admin account. Cannot be dismissed. */
export function SetupModal({ onDone }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await api.setup(username, password)
      api.setToken(res.token)
      onDone(res.user)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Welcome to Hephaestus">
      <p className="modal-sub">
        First-time setup: create the administrator account for this
        installation.
      </p>
      <form onSubmit={submit} className="modal-form">
        <label>Admin username
          <input value={username} autoFocus required
            onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>Password <span className="hint">(min 8 characters)</span>
          <input type="password" value={password} required minLength={8}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>Confirm password
          <input type="password" value={confirm} required
            onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <FormError error={error} />
        <button className="primary-btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create admin account'}
        </button>
      </form>
    </Modal>
  )
}

export function LoginModal({ onDone, onClose }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.login(username, password)
      api.setToken(res.token)
      onDone(res.user)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Sign in" onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <label>Username
          <input value={username} autoFocus required
            onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>Password
          <input type="password" value={password} required
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        <FormError error={error} />
        <button className="primary-btn" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Modal>
  )
}

/** Change-password form, reusable in a modal or a settings pane. */
export function ChangePasswordForm({ forced, onDone }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.changePassword(current, password)
      setCurrent('')
      setPassword('')
      setConfirm('')
      setBusy(false)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="modal-form">
      <label>{forced ? 'Temporary password' : 'Current password'}
        <input type="password" value={current} autoFocus required
          onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>New password <span className="hint">(min 8 characters)</span>
        <input type="password" value={password} required minLength={8}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label>Confirm new password
        <input type="password" value={confirm} required
          onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <FormError error={error} />
      <button className="primary-btn" disabled={busy}>
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  )
}

/** Change password; `forced` (temp password) mode cannot be dismissed. */
export function ChangePasswordModal({ forced, onDone, onClose }) {
  return (
    <Modal
      title={forced ? 'Set a new password' : 'Change password'}
      onClose={forced ? undefined : onClose}
    >
      {forced && (
        <p className="modal-sub">
          You signed in with a temporary password. Choose your own password
          to continue.
        </p>
      )}
      <ChangePasswordForm forced={forced} onDone={onDone} />
    </Modal>
  )
}

/** Admin panel: master list of accounts with add / reset / delete. */
export function ManageUsersPanel({ currentUser }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  // {username, password, action} — shown once after add/reset
  const [tempCred, setTempCred] = useState(null)
  const [copied, setCopied] = useState(false)

  const refresh = () =>
    api.listUsers().then((d) => setUsers(d.users)).catch((e) => setError(e.message))

  useEffect(() => { refresh() }, [])

  const add = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await api.addUser(newName.trim())
      setTempCred({
        username: res.user.username,
        password: res.temp_password,
        action: 'created',
      })
      setNewName('')
      refresh()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const reset = async (u) => {
    if (!window.confirm(
      `Reset ${u.username}'s password?\n\nTheir chat history is encrypted`
      + ' with their current password and cannot be recovered — it will be'
      + ' permanently deleted.')) return
    setError('')
    try {
      const res = await api.resetUserPassword(u.id)
      setTempCred({
        username: u.username,
        password: res.temp_password,
        action: 'reset',
      })
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (u) => {
    if (!window.confirm(
      `Delete ${u.username} and all of their conversations?`)) return
    setError('')
    try {
      await api.deleteUser(u.id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const copyTemp = () => {
    navigator.clipboard.writeText(tempCred.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <form className="add-user-row" onSubmit={add}>
        <input
          placeholder="New username…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="primary-btn" disabled={busy || !newName.trim()}>
          Add user
        </button>
      </form>

      {tempCred && (
        <div className="temp-cred">
          <div>
            Account <strong>{tempCred.username}</strong>{' '}
            {tempCred.action === 'created' ? 'created' : 'password reset'}.
            Temporary password (shown once — they must change it at next
            sign-in):
          </div>
          <div className="temp-cred-row">
            <code>{tempCred.password}</code>
            <button className="ghost-btn" onClick={copyTemp}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="ghost-btn" onClick={() => setTempCred(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <FormError error={error} />

      <div className="user-table">
        <div className="user-row user-row-head">
          <span>User</span>
          <span>Role</span>
          <span>Status</span>
          <span></span>
        </div>
        {users.map((u) => (
          <div className="user-row" key={u.id}>
            <span className="user-cell-name">
              <Avatar user={u} className="small" />
              {u.username}
              {u.id === currentUser.id && <em> (you)</em>}
            </span>
            <span>{u.is_admin ? 'Admin' : 'Member'}</span>
            <span>
              {u.must_change_password
                ? <span className="badge pending">Temp password</span>
                : <span className="badge active">Active</span>}
            </span>
            <span className="user-actions">
              {u.id !== currentUser.id && (
                <>
                  <button className="ghost-btn" onClick={() => reset(u)}>
                    Reset password
                  </button>
                  <button className="ghost-btn danger"
                    onClick={() => remove(u)}>
                    Delete
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
