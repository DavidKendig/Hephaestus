import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import logo from '../assets/logo.svg'

function CodeBlock({ children, className, ...props }) {
  const [copied, setCopied] = useState(false)
  const isBlock = className?.includes('language-') || String(children).includes('\n')
  if (!isBlock) {
    return <code className="inline-code" {...props}>{children}</code>
  }
  const lang = className?.match(/language-([\w-]+)/)?.[1] || ''
  const copy = () => {
    navigator.clipboard.writeText(String(children))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <span className="codeblock">
      <span className="codeblock-bar">
        <span>{lang}</span>
        <button onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
      </span>
      <code className={className} {...props}>{children}</code>
    </span>
  )
}

export default function Message({ message, streaming }) {
  if (message.role === 'user') {
    return (
      <div className="msg-row user">
        <div className="user-msg">
          {message.images?.length > 0 && (
            <div className="msg-images">
              {message.images.map((src, i) => (
                <img key={i} src={src} alt="attachment" />
              ))}
            </div>
          )}
          {Array.isArray(message.files) && message.files.length > 0 && (
            <div className="msg-files">
              {message.files.map((f, i) => (
                <span key={i} className="doc-chip">📎 {f.name}</span>
              ))}
            </div>
          )}
          {message.content && (
            <div className="user-bubble">{message.content}</div>
          )}
        </div>
      </div>
    )
  }

  const isThinking = message.pending && !message.content && !message.error

  return (
    <div className="msg-row assistant">
      <div className="assistant-avatar">
        <img src={logo} alt="" className="avatar-logo" />
      </div>
      <div className="assistant-body">
        {message.sources?.length > 0 && (
          <div className="sources">
            {message.sources.map((s, i) => (
              <a
                key={s.url + i}
                className="source-chip"
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={s.snippet}
              >
                [{i + 1}] {s.title || new URL(s.url).hostname}
              </a>
            ))}
          </div>
        )}
        {Array.isArray(message.tool_events) && message.tool_events.length > 0 && (
          <div className="tool-chips">
            {message.tool_events.map((t, i) => (
              <span
                key={i}
                className={`tool-chip ${t.ok ? '' : 'failed'}`}
                title={t.ok ? t.path : t.error}
              >
                {t.ok
                  ? `📄 Created ${t.filename} in ${t.folder}`
                  : `⚠️ ${t.name} failed`}
              </span>
            ))}
          </div>
        )}
        {isThinking && <span className="thinking-dot" />}
        <div className="markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{ code: CodeBlock }}
          >
            {message.content}
          </ReactMarkdown>
          {message.pending && message.content && streaming && (
            <span className="cursor-blink">▍</span>
          )}
        </div>
        {message.error && <div className="msg-error">{message.error}</div>}
      </div>
    </div>
  )
}
