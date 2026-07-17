import { useEffect, useState } from 'react'
import * as api from '../api.js'
import { ChangePasswordForm, ManageUsersPanel } from './AuthModals.jsx'

const fmtSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} MB`
  return `${(bytes / 1e9).toFixed(1)} GB`
}

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

function ModelFitSection() {
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
  )
}

// Hand-picked models that are tested and known to work with Hephaestus.
const RECOMMENDED_MODELS = [
  { name: 'gemma4:e4b', note: 'Fastest — 8B parameters' },
  { name: 'gemma4:26b', note: 'Balanced — 26B parameters' },
  { name: 'gemma4:31b', note: 'Most capable — 31B parameters' },
]

function GoogleGIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function ModelsView({
  models, pull, onPull, onCancelPull, onRefresh, onClose,
}) {
  const [name, setName] = useState('')
  const [recOpen, setRecOpen] = useState(false)
  const pulling = !!pull && !pull.done && !pull.error && !pull.cancelled

  const submit = (e) => {
    e.preventDefault()
    const model = name.trim()
    if (!model || pulling) return
    onPull(model)
  }

  return (
    <SettingsShell title="Models" onClose={onClose}>
      <section className="settings-section">
        <button
          className="rec-head"
          aria-expanded={recOpen}
          onClick={() => setRecOpen((v) => !v)}
        >
          <h2>Recommended models</h2>
          <svg className={`rec-chevron ${recOpen ? 'open' : ''}`}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {recOpen && (
          <>
            <p className="settings-note">
              Tested and known to work well with Hephaestus.
            </p>
            <div className="rec-list">
              {RECOMMENDED_MODELS.map((rec) => {
                const installed = models.some((m) => m.name === rec.name)
                const isPulling = pulling && pull.name === rec.name
                return (
                  <div className="rec-item" key={rec.name}>
                    <GoogleGIcon />
                    <div className="rec-info">
                      <strong>{rec.name}</strong>
                      <span>{rec.note}</span>
                    </div>
                    {installed ? (
                      <span className="model-ok">● Installed</span>
                    ) : isPulling ? (
                      <span className="pull-status-text">
                        {pull.pct != null ? `${pull.pct}%` : 'Downloading…'}
                      </span>
                    ) : (
                      <button className="ghost-btn" disabled={pulling}
                        onClick={() => onPull(rec.name)}>
                        Download
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section className="settings-section">
        <h2>Add a model</h2>
        <p className="settings-note">
          Downloads a model into the local Ollama instance — the same
          download <code>ollama run &lt;model&gt;</code> performs. Browse
          available models at{' '}
          <a href="https://ollama.com/library" target="_blank"
            rel="noreferrer">ollama.com/library</a>.
        </p>
        <form className="models-add-row" onSubmit={submit}>
          <input
            value={name}
            placeholder="e.g. llama3.2:3b"
            disabled={pulling}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="ghost-btn"
            disabled={pulling || !name.trim()}>
            {pulling ? 'Downloading…' : 'Download'}
          </button>
        </form>

        {pull && (
          <div className="pull-status">
            <div className="pull-status-line">
              <strong>{pull.name}</strong>
              <span className={`pull-status-text ${pull.error ? 'error' : ''}`}>
                {pull.error ? pull.error
                  : pull.cancelled ? 'Cancelled'
                    : pull.done ? 'Installed and ready to use'
                      : pull.status || 'Starting…'}
                {pulling && pull.pct != null && ` — ${pull.pct}%`}
              </span>
            </div>
            {pulling && (
              <div className="pull-bar">
                <div
                  className={`pull-bar-fill ${pull.pct == null ? 'indeterminate' : ''}`}
                  style={pull.pct != null ? { width: `${pull.pct}%` } : undefined}
                />
              </div>
            )}
            {pulling && (
              <button className="ghost-btn" onClick={onCancelPull}>
                Cancel download
              </button>
            )}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Installed models</h2>
        {models.length === 0 ? (
          <p className="settings-note">
            No models installed yet. Add one above to get started.
          </p>
        ) : (
          <div className="hw-table-wrap">
            <table className="hw-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Params</th>
                  <th>Size</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>{m.parameter_size || ''}</td>
                    <td>{fmtSize(m.size)}</td>
                    <td><span className="model-ok">● Installed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="ghost-btn" onClick={onRefresh}>Refresh</button>
      </section>

      <ModelFitSection />
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
