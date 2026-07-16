import { useEffect, useRef, useState } from 'react'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_DOC_BYTES = 20 * 1024 * 1024
const DOC_ACCEPT = [
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.yaml',
  '.yml', '.log', '.html', '.htm', '.css', '.py', '.js', '.jsx', '.ts',
  '.tsx', '.java', '.c', '.cpp', '.h', '.cs', '.sh', '.bat', '.sql',
  '.docx', '.xlsx', '.pdf',
].join(',')

export default function Composer({
  onSend, onStop, streaming,
  thinkSupported = false,
}) {
  const [text, setText] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [image, setImage] = useState(null) // data URL
  const [doc, setDoc] = useState(null) // {name, data}
  const [think, setThink] = useState(false)
  const textareaRef = useRef(null)
  const fileRef = useRef(null)
  const docRef = useRef(null)
  const toolsRef = useRef(null)

  useEffect(() => {
    if (!toolsOpen) return
    const close = (e) => {
      if (!toolsRef.current?.contains(e.target)) setToolsOpen(false)
    }
    const onEsc = (e) => e.key === 'Escape' && setToolsOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onEsc)
    }
  }, [toolsOpen])

  const submit = () => {
    if ((!text.trim() && !image && !doc) || streaming) return
    onSend(text, webSearch, image ? [image] : [], doc ? [doc] : [],
      thinkSupported ? think : undefined)
    setText('')
    setImage(null)
    setDoc(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const autosize = (e) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }

  const pickImage = () => {
    setToolsOpen(false)
    fileRef.current?.click()
  }

  const pickDoc = () => {
    setToolsOpen(false)
    docRef.current?.click()
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (file.size > MAX_IMAGE_BYTES) {
      alert('Image is too large (max 15 MB).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result)
    reader.readAsDataURL(file)
  }

  const onDoc = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DOC_BYTES) {
      alert('File is too large (max 20 MB).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setDoc({ name: file.name, data: reader.result })
    reader.readAsDataURL(file)
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        {(image || doc) && (
          <div className="attachment-row">
            {image && (
              <div className="attachment">
                <img src={image} alt="attachment" />
                <button
                  className="attachment-remove"
                  title="Remove image"
                  onClick={() => setImage(null)}
                >
                  ×
                </button>
              </div>
            )}
            {doc && (
              <div className="attachment doc">
                <span className="doc-chip" title={doc.name}>
                  📎 {doc.name}
                </span>
                <button
                  className="attachment-remove"
                  title="Remove file"
                  onClick={() => setDoc(null)}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}
        <div className="composer-row">
          <div className="composer-side left">
            <div className="composer-side-row">
              <button
                className={`globe-btn ${webSearch ? 'on' : ''}`}
                title={webSearch ? 'Web search: on' : 'Web search: off'}
                onClick={() => setWebSearch((v) => !v)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                {webSearch && <span>Search</span>}
              </button>
              <button
                className={`think-btn ${think && thinkSupported ? 'on' : ''}`}
                title={
                  !thinkSupported
                    ? 'Thinking mode: not supported by this model'
                    : think
                      ? 'Thinking mode: on'
                      : 'Thinking mode: off (regular)'
                }
                disabled={!thinkSupported}
                onClick={() => setThink((v) => !v)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <path d="M9 18h6M10 22h4" />
                  <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
                </svg>
                {think && thinkSupported && <span>Think</span>}
              </button>
              <div className="tools-wrap" ref={toolsRef}>
            <button
              className={`plus-btn ${toolsOpen ? 'open' : ''}`}
              title="More tools"
              onClick={() => setToolsOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {toolsOpen && (
              <div className="tools-menu">
                <button className="tools-item" onClick={pickImage}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  Add image
                </button>
                <button className="tools-item" onClick={pickDoc}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  Upload file
                </button>
              </div>
            )}
              </div>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onFile}
          />
          <input
            ref={docRef}
            type="file"
            accept={DOC_ACCEPT}
            style={{ display: 'none' }}
            onChange={onDoc}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Message Hephaestus…"
            value={text}
            onChange={autosize}
            onKeyDown={onKeyDown}
          />
          <div className="composer-side right">
            {streaming ? (
              <button className="send-btn stop" title="Stop generating"
                onClick={onStop}>
                <svg width="14" height="14" viewBox="0 0 24 24"
                  fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button className="send-btn" title="Send"
                disabled={!text.trim() && !image && !doc}
                onClick={submit}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="composer-hint">
        AI models can make mistakes. Enter to send · Shift+Enter for a new
        line.
      </p>
    </div>
  )
}
