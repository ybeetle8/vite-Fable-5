// 注册/登录界面(DQ 风格)
import { useState } from 'react'
import { api } from '../game/net/api.js'

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login') // login | register
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      if (mode === 'register') {
        const r = await api.register(username, password)
        if (!r.ok) return setMsg(r.error)
        setMsg('注册成功，请登录')
        setMode('login')
      } else {
        const r = await api.login(username, password)
        if (!r.ok) return setMsg(r.error)
        onLoggedIn({ token: r.token, character: r.character, classes: r.classes })
      }
    } catch {
      setMsg('无法连接服务器，请确认服务器已启动')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dq-screen">
      <h1 className="dq-title">勇者斗魔王 Online</h1>
      <form className="dq-panel" onSubmit={submit}>
        <h2>{mode === 'login' ? '▼ 登入冒险' : '▼ 登记新勇者'}</h2>
        <label>
          用户名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            maxLength={16}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={32}
          />
        </label>
        {msg && <p className="dq-msg">{msg}</p>}
        <button type="submit" disabled={busy}>
          {mode === 'login' ? '进入世界' : '注册'}
        </button>
        <button
          type="button"
          className="dq-link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setMsg('')
          }}
        >
          {mode === 'login' ? '没有账号？点此注册' : '已有账号？返回登录'}
        </button>
      </form>
    </div>
  )
}
