import { useRef, useState } from 'react'

export default function Composer({ onSend, onStop, streaming }) {
  const [text, setText] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const textareaRef = useRef(null)

  const submit = () => {
    if (!text.trim() || streaming) return
    onSend(text, webSearch)
    setText('')
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

  return (
    <div className="composer-wrap">
      <div className="composer">
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
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Message Hephaestus…"
          value={text}
          onChange={autosize}
          onKeyDown={onKeyDown}
        />
        {streaming ? (
          <button className="send-btn stop" title="Stop generating"
            onClick={onStop}>
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button className="send-btn" title="Send" disabled={!text.trim()}
            onClick={submit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
      <p className="composer-hint">
        AI models can make mistakes. Enter to send · Shift+Enter for a new
        line.
      </p>
    </div>
  )
}
