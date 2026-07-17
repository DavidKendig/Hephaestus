import { useEffect, useRef, useState } from 'react'
import * as api from '../api.js'

export function Avatar({ user, className = '', onClick, title }) {
  const clickable = !!onClick
  return (
    <span
      className={`account-avatar ${className} ${clickable ? 'avatar-clickable' : ''}`}
      onClick={onClick}
      title={title}
      role={clickable ? 'button' : undefined}
    >
      {user.avatar
        ? <img src={user.avatar} alt="" />
        : user.username[0].toUpperCase()}
      {clickable && (
        <span className="avatar-overlay">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
      )}
    </span>
  )
}

/** Center-crop an image file to a small square PNG data URL. */
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file'))
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = 128
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      const min = Math.min(img.width, img.height)
      ctx.drawImage(
        img,
        (img.width - min) / 2, (img.height - min) / 2, min, min,
        0, 0, size, size,
      )
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}

export default function AccountMenu({
  user, onSignIn, onLogout, onOpenSettings, onOpenAdminSettings,
  onOpenModels, modelPull, onUserUpdate,
}) {
  const [open, setOpen] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const wrapRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!user) {
    return (
      <div className="account-area">
        <button className="account-btn" onClick={onSignIn}>
          <span className="account-avatar guest">?</span>
          <span className="account-name">Sign in</span>
        </button>
      </div>
    )
  }

  const pickAvatar = (e) => {
    e.stopPropagation()
    setAvatarError('')
    fileRef.current?.click()
  }

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      const dataUrl = await fileToAvatar(file)
      const res = await api.setAvatar(dataUrl)
      onUserUpdate({ ...user, avatar: res.avatar })
    } catch (err) {
      setAvatarError(err.message)
    }
  }

  const pick = (fn) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div className="account-area" ref={wrapRef}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChosen}
      />
      {open && (
        <div className="account-menu">
          <div className="account-menu-head">
            <Avatar user={user} onClick={pickAvatar}
              title="Change profile image" />
            <div>
              <div className="account-menu-name">{user.username}</div>
              <div className="account-menu-role">
                {user.is_admin ? 'Administrator' : 'Member'}
              </div>
            </div>
          </div>
          {avatarError && <p className="form-error menu-error">{avatarError}</p>}
          <div className="account-menu-sep" />
          {user.is_admin && (
            <button className="account-menu-item"
              onClick={pick(onOpenAdminSettings)}>
              <ShieldIcon /> Admin Settings
            </button>
          )}
          <button className="account-menu-item" onClick={pick(onOpenSettings)}>
            <GearIcon /> Settings
          </button>
          <button className="account-menu-item" onClick={pick(onOpenModels)}>
            <BoxIcon /> Models
            <PullBadge pull={modelPull} />
          </button>
          <div className="account-menu-sep" />
          <button className="account-menu-item" onClick={pick(onLogout)}>
            <LogoutIcon /> Log out
          </button>
        </div>
      )}
      <button
        className={`account-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar user={user} />
        <span className="account-name">{user.username}</span>
        <span className="account-caret">⋯</span>
      </button>
    </div>
  )
}

/** Live status of the current model download, shown inside the menu. */
function PullBadge({ pull }) {
  if (!pull || pull.cancelled) return null
  if (pull.error) return <span className="menu-badge error">failed</span>
  if (pull.done) return <span className="menu-badge done">installed</span>
  return (
    <span className="menu-badge">
      {pull.pct != null ? `${pull.pct}%` : 'pulling…'}
    </span>
  )
}

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
