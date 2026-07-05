// 任务面板(M9): Q 键开关, 进行中(含可交付高亮) + 主线进度
import { useSyncExternalStore } from 'react'
import { QUESTS, QUEST_TOTAL } from '../game/gameData.js'
import { worldStore } from '../game/net/worldStore.js'

const MONSTER_NAMES = {
  slime: '史莱姆', bigbeak: '大嘴鸟', mothvenom: '毒蛾',
  treant: '树精', skeleton: '骷髅兵', golem: '石魔像', demon: '恶魔卫兵',
}

function useQuests() {
  return useSyncExternalStore(worldStore.subscribeQuests, worldStore.getQuests)
}

function goalText(quest) {
  if (quest.type === 'collect') {
    return `收集 ${quest.material}(击败${MONSTER_NAMES[quest.target] ?? quest.target}获得)`
  }
  return `讨伐 ${MONSTER_NAMES[quest.target] ?? quest.target}`
}

export default function QuestPanel({ onClose }) {
  const quests = useQuests()
  const active = quests?.active ?? []
  const completed = quests?.completed ?? []

  return (
    <div className="quest-panel dq-panel">
      <div className="char-panel-head">
        <span>任务日志</span>
        <button className="char-close" onClick={onClose}>✕ (Q)</button>
      </div>

      <div className="quest-progress-line">主线进度: {completed.length}/{QUEST_TOTAL}</div>

      <div className="quest-section">进行中</div>
      {active.length === 0 && (
        <div className="quest-empty">
          没有进行中的任务。去王城找 <b>阿雷夫国王</b> 领取委托吧!
        </div>
      )}
      {active.map(({ id, progress }) => {
        const q = QUESTS[id]
        if (!q) return null
        const done = progress >= q.goal
        const pct = Math.min(100, (progress / q.goal) * 100)
        return (
          <div key={id} className={`quest-item${done ? ' done' : ''}`}>
            <div className="quest-item-title">
              <b>{q.name}</b>
              {done && <span className="quest-ready-badge">可交付!回见国王</span>}
            </div>
            <div className="quest-item-goal">
              {goalText(q)} — {Math.min(progress, q.goal)}/{q.goal}
            </div>
            <div className="quest-bar">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}

      {completed.length > 0 && (
        <>
          <div className="quest-section">已完成({completed.length})</div>
          <div className="quest-completed-list">
            {completed.map((id) => (
              <span key={id} className="quest-completed-item">✓ {QUESTS[id]?.name ?? id}</span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
