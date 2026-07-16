import { useState } from 'react'
import { ChangePasswordForm, ManageUsersPanel } from './AuthModals.jsx'

function SettingsShell({ title, onClose, children }) {
  return (
    <div className="settings-view">
      <div className="settings-inner">
        <div className="settings-head">
          <h1>{title}</h1>
          <button className="icon-btn" title="Back to chat" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SettingsView({ onClose }) {
  const [saved, setSaved] = useState(false)

  return (
    <SettingsShell title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h2>Change password</h2>
        {saved && <p className="settings-success">Password updated.</p>}
        <ChangePasswordForm onDone={() => setSaved(true)} />
      </section>
    </SettingsShell>
  )
}

export function AdminSettingsView({ currentUser, onClose }) {
  return (
    <SettingsShell title="Admin Settings" onClose={onClose}>
      <section className="settings-section">
        <h2>Manage users</h2>
        <ManageUsersPanel currentUser={currentUser} />
      </section>
    </SettingsShell>
  )
}
