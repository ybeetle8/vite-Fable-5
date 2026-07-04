// 聊天面板: 左下角消息列表 + Enter 唤出输入框
import { useEffect, useRef, useState } from 'react'
import { sendChat } from '../game/net/socket.js'

const MAX_MESSAGES = 50

export default function ChatPanel({ messagesRef }) {
  const [messages, setMessages] = useState([])
  const [inputOpen, setInputOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // GameScreen 把收到的消息推进 messagesRef.current, 这里注册消费回调
  useEffect(() => {
    messagesRef.current = (msg) => {
      setMessages((list) => [...list.slice(-(MAX_MESSAGES - 1)), { ...msg, key: msg.t + msg.from }])
    }
    return () => {
      messagesRef.current = null
    }
  }, [messagesRef])

  // Enter 唤出/发送, Esc 取消
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Enter') {
        if (!inputOpen) {
          setInputOpen(true)
          e.preventDefault()
        }
      } else if (e.code === 'Escape' && inputOpen) {
        setInputOpen(false)
        setDraft('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inputOpen])

  // 输入框打开时聚焦
  useEffect(() => {
    if (inputOpen) inputRef.current?.focus()
  }, [inputOpen])

  // 新消息自动滚到底
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  function submit(e) {
    e.preventDefault()
    const text = draft.trim()
    if (text) sendChat(text)
    setDraft('')
    setInputOpen(false)
  }

  return (
    <div className="chat-panel">
      <div className="chat-list" ref={listRef}>
        {messages.map((m) => (
          <div key={m.key} className="chat-msg">
            <span className="chat-from">[{m.from}]</span> {m.text}
          </div>
        ))}
      </div>
      {inputOpen ? (
        <form className="chat-input-row" onSubmit={submit}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            placeholder="按 Enter 发送, Esc 取消"
            onBlur={() => {
              // 点击别处关闭(延迟避免与提交竞争)
              setTimeout(() => setInputOpen(false), 100)
            }}
          />
        </form>
      ) : (
        <div className="chat-hint">按 Enter 聊天</div>
      )}
    </div>
  )
}
