// 技能栏(M8): 底部 3 格, 1/2/3 快捷键 + 冷却遮罩 + MP 不足灰显 + 提示抖动 + 吟唱进度条
import { useEffect, useState, useSyncExternalStore } from 'react'
import { SKILLS_BY_CLASS } from '../game/gameData.js'
import { worldStore } from '../game/net/worldStore.js'

function useSelfStats() {
  return useSyncExternalStore(worldStore.subscribeStats, worldStore.getSelfStats)
}

export default function SkillBar({ classId }) {
  const skills = SKILLS_BY_CLASS[classId] ?? []
  const stats = useSelfStats()
  const [, forceTick] = useState(0)         // 驱动冷却遮罩刷新
  const [hints, setHints] = useState({})    // skillId -> 提示文字
  const [shakes, setShakes] = useState({})  // skillId -> 抖动 key
  const [casting, setCasting] = useState(null) // { skillId, castTime, startAt }

  // 订阅技能 UI 事件: 提示 / 冷却变化 / 吟唱
  useEffect(() => {
    const timers = []
    const unsub = worldStore.subscribeSkillUi((ev) => {
      if (ev.phase === 'hint') {
        setHints((h) => ({ ...h, [ev.skillId]: ev.text }))
        setShakes((s) => ({ ...s, [ev.skillId]: (s[ev.skillId] ?? 0) + 1 }))
        timers.push(setTimeout(() => setHints((h) => ({ ...h, [ev.skillId]: null })), 800))
      } else if (ev.phase === 'fail') {
        setCasting((c) => (c?.skillId === ev.skillId ? null : c))
        if (ev.reason === 'interrupted') return // 打断不额外提示
        const text = { mp: 'MP 不足', cd: '冷却中', target: '没有目标' }[ev.reason] ?? '失败'
        setHints((h) => ({ ...h, [ev.skillId]: text }))
        timers.push(setTimeout(() => setHints((h) => ({ ...h, [ev.skillId]: null })), 800))
      } else if (ev.phase === 'cast' && ev.casterId === worldStore.getSelfId()) {
        setCasting({ skillId: ev.skillId, castTime: ev.castTime, startAt: Date.now() })
      } else if (ev.phase === 'hit' && ev.casterId === worldStore.getSelfId()) {
        setCasting(null)
      } else {
        forceTick((n) => n + 1) // local_cd 等
      }
    })
    // 冷却遮罩定时刷新
    const iv = setInterval(() => forceTick((n) => n + 1), 100)
    return () => {
      unsub()
      clearInterval(iv)
      timers.forEach(clearTimeout)
    }
  }, [])

  const now = Date.now()
  const castingSkill = casting && SKILLS_BY_CLASS[classId]?.find((s) => s?.id === casting.skillId)
  const castPct = casting
    ? Math.min(100, ((now - casting.startAt) / (casting.castTime * 1000)) * 100)
    : 0

  return (
    <div className="skill-bar">
      {casting && castingSkill && (
        <div className="cast-bar">
          <div className="cast-bar-fill" style={{ width: `${castPct}%` }} />
          <span className="cast-bar-label">{castingSkill.name}…</span>
        </div>
      )}
      <div className="skill-slots">
        {skills.map((skill, i) => {
          if (!skill) return null
          const readyAt = worldStore.skillReadyAt(skill.id)
          const cdLeft = Math.max(0, readyAt - now)
          const cdPct = Math.min(100, (cdLeft / (skill.cd * 1000)) * 100)
          const noMp = (stats?.mp ?? 0) < skill.mp
          return (
            <div
              key={`${skill.id}-${shakes[skill.id] ?? 0}`}
              className={`skill-slot${noMp ? ' no-mp' : ''}${shakes[skill.id] ? ' shake' : ''}`}
              title={`${skill.name}: ${skill.desc}(MP ${skill.mp} / CD ${skill.cd}s)`}
            >
              {hints[skill.id] && <div className="skill-hint">{hints[skill.id]}</div>}
              <span className="skill-icon">{skill.icon}</span>
              <span className="skill-key">{i + 1}</span>
              <span className="skill-name">{skill.name}</span>
              {cdLeft > 0 && (
                <>
                  <div className="skill-cd-mask" style={{ height: `${cdPct}%` }} />
                  <span className="skill-cd-text">{(cdLeft / 1000).toFixed(1)}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
