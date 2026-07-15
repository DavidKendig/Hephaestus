import { useEffect, useRef } from 'react'
import Message from './Message.jsx'
import logo from '../assets/logo.svg'

export default function ChatView({ messages, status, streaming }) {
  const bottomRef = useRef(null)
  const scrollerRef = useRef(null)
  const pinnedRef = useRef(true)

  // Autoscroll only while the user is already near the bottom.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      pinnedRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (pinnedRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [messages, status])

  if (messages.length === 0) {
    return (
      <div className="chat-scroll empty" ref={scrollerRef}>
        <div className="welcome">
          <img src={logo} alt="" className="welcome-mark" />
          <h1>How can I help you today?</h1>
          <p>
            Chat with your local Ollama models. Toggle the globe to pull in
            real-time info from the web.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-scroll" ref={scrollerRef}>
      <div className="chat-column">
        {messages.map((m) => (
          <Message key={m.id} message={m} streaming={streaming} />
        ))}
        {status && (
          <div className="status-row">
            <span className="spinner" />
            {status}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
