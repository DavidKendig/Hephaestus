import { useEffect, useState } from 'react'
import * as api from '../api.js'
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

/** Best-effort split of an llmfit JSON report into summary + model rows. */
function splitReport(report) {
  if (Array.isArray(report)) return { summary: {}, rows: report }
  if (report && typeof report === 'object') {
    const summary = {}
    let rows = []
    for (const [key, value] of Object.entries(report)) {
      if (Array.isArray(value) && value.length && !rows.length) {
        rows = value
      } else if (typeof value !== 'object' || value === null) {
        summary[key] = value
      } else {
        for (const [k, v] of Object.entries(value)) {
          if (typeof v !== 'object' || v === null) {
            summary[`${key} ${k}`] = v
          }
        }
      }
    }
    return { summary, rows }
  }
  return { summary: {}, rows: [] }
}

const fmtCell = (v) => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return String(v)
}

// Known llmfit model fields, in display order: [key, label]
const LLMFIT_COLUMNS = [
  ['name', 'Model'],
  ['parameter_count', 'Params'],
  ['best_quant', 'Quant'],
  ['fit_level', 'Fit'],
  ['estimated_tps', 'Est. tok/s'],
  ['memory_required_gb', 'Memory (GB)'],
  ['score', 'Score'],
  ['use_case', 'Use case'],
]

function systemSummary(sys) {
  if (!sys) return {}
  const out = {}
  if (sys.cpu_name) {
    out.CPU = sys.cpu_cores
      ? `${sys.cpu_name} · ${sys.cpu_cores} cores` : sys.cpu_name
  }
  if (sys.total_ram_gb) {
    out.RAM = `${sys.total_ram_gb} GB`
      + (sys.available_ram_gb ? ` (${sys.available_ram_gb} GB free)` : '')
  }
  if (sys.gpu_name) {
    out.GPU = sys.gpu_vram_gb
      ? `${sys.gpu_name} · ${sys.gpu_vram_gb} GB VRAM` : sys.gpu_name
  }
  if (sys.backend) out.Backend = sys.backend
  return out
}

export function HardwareView({ onClose }) {
  const [result, setResult] = useState({ loading: true })
  const [showRaw, setShowRaw] = useState(false)

  const load = () => {
    setResult({ loading: true })
    api.getHardware()
      .then((data) => setResult({ data }))
      .catch((err) => setResult({ error: err.message }))
  }
  useEffect(load, [])

  const report = result.data?.installed ? result.data.report : null
  let summary = {}
  let rows = []
  let columns = []
  if (report?.models && Array.isArray(report.models)) {
    // Shape produced by `llmfit recommend --json`
    summary = systemSummary(report.system)
    rows = report.models
    columns = rows.length
      ? LLMFIT_COLUMNS.filter(([key]) => key in rows[0])
      : []
  } else if (report) {
    // Unknown / future report shape — render best-effort
    const split = splitReport(report)
    summary = split.summary
    rows = split.rows
    columns = (rows.length ? Object.keys(rows[0]) : [])
      .filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] === null)
      .slice(0, 7)
      .map((k) => [k, k])
  }

  return (
    <SettingsShell title="Hardware" onClose={onClose}>
      <section className="settings-section">
        <h2>Model fit</h2>
        <p className="settings-note">
          Powered by{' '}
          <a href="https://github.com/AlexsJones/llmfit" target="_blank"
            rel="noreferrer">llmfit</a>
          , which sizes models against this machine&apos;s RAM, CPU and GPU.
        </p>

        {result.loading && <p className="settings-note">Scanning hardware…</p>}

        {result.error && (
          <>
            <p className="form-error">{result.error}</p>
            <button className="ghost-btn" onClick={load}>Retry</button>
          </>
        )}

        {result.data && !result.data.installed && (
          <div className="hw-missing">
            <p>
              llmfit is not installed on this machine (it must be on the
              PATH of the Hephaestus backend). Install it, then come back:
            </p>
            <pre className="hw-install">
              {'# Windows\nscoop install llmfit\n\n'
                + '# macOS / Linux\nbrew install llmfit'}
            </pre>
            <button className="ghost-btn" onClick={load}>Check again</button>
          </div>
        )}

        {report && (
          <>
            {Object.keys(summary).length > 0 && (
              <div className="hw-chips">
                {Object.entries(summary).map(([k, v]) => (
                  <span className="hw-chip" key={k}>
                    <em>{k}</em> {fmtCell(v)}
                  </span>
                ))}
              </div>
            )}
            {rows.length > 0 && columns.length > 0 && (
              <div className="hw-table-wrap">
                <table className="hw-table">
                  <thead>
                    <tr>
                      {columns.map(([key, label]) => (
                        <th key={key}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        {columns.map(([key]) => (
                          <td key={key}>{fmtCell(row[key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="ghost-btn" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? 'Hide raw report' : 'Show raw report'}
            </button>
            {showRaw && (
              <pre className="hw-raw">{JSON.stringify(report, null, 2)}</pre>
            )}
          </>
        )}
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
