// 角色创建界面: 昵称 + 三职业选择
import { useState } from 'react'
import { api } from '../game/net/api.js'

export default function CharacterCreate({ token, classes, onCreated }) {
  const [nickname, setNickname] = useState('')
  const [classId, setClassId] = useState('hero')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      const r = await api.createCharacter(token, nickname, classId)
      if (!r.ok) return setMsg(r.error)
      onCreated(r.character)
    } catch {
      setMsg('无法连接服务器')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dq-screen">
      <h1 className="dq-title">创建你的勇者</h1>
      <form className="dq-panel dq-panel-wide" onSubmit={submit}>
        <label>
          昵称
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
            maxLength={12}
            placeholder="将显示在头顶"
          />
        </label>
        <div className="dq-classes">
          {Object.values(classes).map((c) => (
            <button
              type="button"
              key={c.id}
              className={`dq-class-card ${classId === c.id ? 'selected' : ''}`}
              onClick={() => setClassId(c.id)}
            >
              <strong>{c.name}</strong>
              <span>{c.desc}</span>
              <em>
                HP {c.base.hp} / MP {c.base.mp} / 攻 {c.base.atk} / 防 {c.base.def}
              </em>
            </button>
          ))}
        </div>
        {msg && <p className="dq-msg">{msg}</p>}
        <button type="submit" disabled={busy}>
          踏上旅途
        </button>
      </form>
    </div>
  )
}
