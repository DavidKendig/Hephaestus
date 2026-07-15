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
        <div className="user-bubble">{message.content}</div>
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
