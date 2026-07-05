// NPC 对话框(M9): DQ 风格文本框 + 按 NPC 类型的功能区(任务/商店/旅馆)
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { NPCS, ITEMS, QUESTS_BY_NPC } from '../game/gameData.js'
import {
  sendQuestAccept, sendQuestComplete, sendShopBuy, sendShopSell, sendInnRest,
} from '../game/net/socket.js'
import { worldStore } from '../game/net/worldStore.js'

function useQuests() {
  return useSyncExternalStore(worldStore.subscribeQuests, worldStore.getQuests)
}
function useSelfStats() {
  return useSyncExternalStore(worldStore.subscribeStats, worldStore.getSelfStats)
}
function useSelfInventory() {
  return useSyncExternalStore(worldStore.subscribeInventory, worldStore.getSelfInventory)
}

// 逐字打字机文本, 点击父容器可跳过
function Typewriter({ lines, skipSignal }) {
  const full = lines.join('\n')
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(0)
    const iv = setInterval(() => {
      setCount((n) => {
        if (n >= full.length) {
          clearInterval(iv)
          return n
        }
        return n + 1
      })
    }, 30)
    return () => clearInterval(iv)
  }, [full])

  useEffect(() => {
    if (skipSignal > 0) setCount(full.length)
  }, [skipSignal, full.length])

  return <div className="npc-dialog-text">{full.slice(0, count)}</div>
}

// 单个任务在玩家视角的状态
function questState(quest, quests) {
  if (!quests) return 'locked'
  if (quests.completed.includes(quest.id)) return 'done'
  const active = quests.active.find((q) => q.id === quest.id)
  if (active) return active.progress >= quest.goal ? 'ready' : 'doing'
  const okPrereq = !quest.prereq || quests.completed.includes(quest.prereq)
  return okPrereq ? 'available' : 'locked'
}

function questGoalText(quest) {
  if (quest.type === 'collect') {
    return `收集 ${quest.material} ×${quest.goal}(击败${monsterName(quest.target)}获得)`
  }
  return `讨伐 ${monsterName(quest.target)} ×${quest.goal}`
}

const MONSTER_NAMES = {
  slime: '史莱姆', bigbeak: '大嘴鸟', mothvenom: '毒蛾',
  treant: '树精', skeleton: '骷髅兵', golem: '石魔像', demon: '恶魔卫兵',
}
function monsterName(id) {
  return MONSTER_NAMES[id] ?? id
}

// 奖励预览(含职业专属装备)
function rewardText(quest, classId) {
  const parts = [`${quest.reward.exp} 经验`, `${quest.reward.gold} G`]
  const extraGold = quest.reward.goldByClass?.[classId]
  if (extraGold) parts[1] = `${quest.reward.gold + extraGold} G`
  const items = [...(quest.reward.items ?? [])]
  const byClass = quest.reward.itemsByClass?.[classId]
  if (byClass) items.push(byClass)
  for (const id of items) parts.push(`【${ITEMS[id]?.name ?? id}】`)
  return parts.join(' · ')
}

// 任务视图: 该 NPC 的任务列表(只显示当前主线环 + 进行中的)
function QuestView({ npc, quests, classId }) {
  const list = QUESTS_BY_NPC[npc.id] ?? []
  // 显示: 进行中/可交付全部 + 第一个可接的
  const visible = []
  for (const q of list) {
    const st = questState(q, quests)
    if (st === 'doing' || st === 'ready') visible.push([q, st])
  }
  const nextAvail = list.find((q) => questState(q, quests) === 'available')
  if (nextAvail) visible.push([nextAvail, 'available'])

  if (visible.length === 0) {
    return <div className="npc-quest-empty">当前没有可以委托你的任务了。</div>
  }

  return (
    <div className="npc-quest-list">
      {visible.map(([q, st]) => {
        const progress = quests?.active.find((a) => a.id === q.id)?.progress ?? 0
        return (
          <div key={q.id} className={`npc-quest-item ${st}`}>
            <div className="npc-quest-title">
              <b>{q.name}</b>
              <span className="npc-quest-lv">Lv.{q.recommendLevel} 推荐</span>
            </div>
            <div className="npc-quest-goal">
              {questGoalText(q)}
              {st !== 'available' && ` — ${Math.min(progress, q.goal)}/${q.goal}`}
            </div>
            <div className="npc-quest-reward">奖励: {rewardText(q, classId)}</div>
            <div className="npc-quest-btns">
              {st === 'available' && (
                <button onClick={() => sendQuestAccept(q.id)}>接受委托</button>
              )}
              {st === 'ready' && (
                <button className="ready" onClick={() => sendQuestComplete(q.id)}>完成交付</button>
              )}
              {st === 'doing' && <span className="npc-quest-doing">进行中…</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 商店视图: 购买/出售两 Tab
function ShopView({ npc, classId }) {
  const [tab, setTab] = useState('buy')
  const stats = useSelfStats()
  const inv = useSelfInventory()
  const gold = stats?.gold ?? 0
  const inventory = inv?.inventory ?? []

  const goods = useMemo(
    () =>
      Object.values(ITEMS)
        .filter((it) => npc.sells.includes(it.slot))
        .sort((a, b) => a.price - b.price),
    [npc.sells],
  )

  return (
    <div className="shop-view">
      <div className="shop-tabs">
        <button className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>购买</button>
        <button className={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>出售</button>
        <span className="shop-gold">💰 {gold} G</span>
      </div>

      {tab === 'buy' && (
        <div className="shop-list">
          {goods.map((it) => {
            const usable = it.classes.includes(classId)
            const afford = gold >= it.price
            return (
              <div
                key={it.id}
                className={`shop-item${afford ? '' : ' poor'}${usable ? '' : ' unusable'}`}
                title={usable ? '' : '你的职业无法使用(仍可购买)'}
              >
                <span className="shop-icon">{it.icon}</span>
                <span className="shop-info">
                  <span className="shop-name">{it.name}</span>
                  <span className="shop-stat">
                    {it.atk > 0 && `攻+${it.atk} `}
                    {it.def > 0 && `防+${it.def}`}
                    {!usable && ' · 职业不符'}
                  </span>
                </span>
                <button disabled={!afford} onClick={() => sendShopBuy(npc.id, it.id)}>
                  {it.price} G
                </button>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'sell' && (
        <div className="shop-list">
          {inventory.length === 0 && <div className="npc-quest-empty">背包里没有可出售的装备。</div>}
          {inventory.map((itemId, i) => {
            const it = ITEMS[itemId]
            if (!it) return null
            return (
              <div key={`${itemId}-${i}`} className="shop-item">
                <span className="shop-icon">{it.icon}</span>
                <span className="shop-info">
                  <span className="shop-name">{it.name}</span>
                  <span className="shop-stat">
                    {it.atk > 0 && `攻+${it.atk} `}
                    {it.def > 0 && `防+${it.def}`}
                  </span>
                </span>
                <button onClick={() => sendShopSell(npc.id, i)}>
                  卖 {Math.floor(it.price / 2)} G
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function NpcDialog({ npcId, character, onClose }) {
  const npc = NPCS[npcId]
  const quests = useQuests()
  const stats = useSelfStats()
  const [skip, setSkip] = useState(0)

  // Esc 关闭
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!npc) return null

  // 任务型 NPC: 对话文本按当前任务状态取 offer/progress/complete
  let lines = npc.dialog
  if (npc.type === 'quest_giver') {
    const list = QUESTS_BY_NPC[npc.id] ?? []
    const ready = list.find((q) => questState(q, quests) === 'ready')
    const doing = list.find((q) => questState(q, quests) === 'doing')
    const avail = list.find((q) => questState(q, quests) === 'available')
    if (ready) lines = ready.dialog.complete
    else if (avail) lines = avail.dialog.offer
    else if (doing) lines = doing.dialog.progress
  }

  const level = stats?.level ?? 1
  const innPrice = level * 5

  return (
    <div className="npc-dialog dq-panel" onClick={() => setSkip((n) => n + 1)}>
      <div className="npc-dialog-head">
        <span className="npc-dialog-name">{npc.name}</span>
        <button className="char-close" onClick={onClose}>✕ (Esc)</button>
      </div>

      <Typewriter lines={lines} skipSignal={skip} />

      <div className="npc-dialog-body" onClick={(e) => e.stopPropagation()}>
        {npc.type === 'quest_giver' && (
          <QuestView npc={npc} quests={quests} classId={character.classId} />
        )}
        {npc.type === 'shop' && <ShopView npc={npc} classId={character.classId} />}
        {npc.type === 'inn' && (
          <div className="npc-inn">
            <button
              disabled={(stats?.gold ?? 0) < innPrice}
              onClick={() => sendInnRest(npc.id)}
            >
              住宿休息 — 回满 HP/MP({innPrice} G)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
