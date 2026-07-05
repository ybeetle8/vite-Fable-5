// 游戏主画面: 3D Canvas + 地图切换 + 远程玩家 + 怪物 + 飘字 + HUD
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { CLASSES, MAPS } from '../../shared/config.js'
import { connectGame, disconnectGame } from '../game/net/socket.js'
import { worldStore } from '../game/net/worldStore.js'
import { SKILLS, ITEMS, NPCS, QUESTS } from '../game/gameData.js'
import GameMap from '../game/scenes/GameMap.jsx'
import Player from '../game/entities/Player.jsx'
import RemotePlayer from '../game/entities/RemotePlayer.jsx'
import Monster from '../game/entities/Monster.jsx'
import DamagePopups from '../game/entities/DamagePopups.jsx'
import SkillEffects from '../game/entities/SkillEffects.jsx'
import ChatPanel from './ChatPanel.jsx'
import SkillBar from './SkillBar.jsx'
import CharacterPanel from './CharacterPanel.jsx'
import NpcDialog from './NpcDialog.jsx'
import QuestPanel from './QuestPanel.jsx'

// NPC 交互结果 -> 系统消息文案
function npcResultText(r) {
  const item = ITEMS[r.itemId]
  if (r.action === 'buy') {
    if (r.ok) return `购买了【${item?.name ?? r.itemId}】 -${r.cost}G`
    if (r.reason === 'gold') return '金币不足, 买不起…'
    if (r.reason === 'bag_full') return '背包已满, 无法购买'
  }
  if (r.action === 'sell' && r.ok) return `出售了【${item?.name ?? r.itemId}】 +${r.gold}G`
  if (r.action === 'inn') {
    if (r.ok) return `在旅馆好好休息了一晚 -${r.cost}G, HP/MP 全满!`
    if (r.reason === 'gold') return `金币不足, 住不起旅馆(需 ${r.cost}G)`
  }
  if (r.action === 'accept' && r.ok) {
    return `【任务】接受了「${QUESTS[r.questId]?.name ?? r.questId}」`
  }
  if (r.action === 'complete') {
    if (r.ok) {
      const items = (r.items ?? []).map((id) => `【${ITEMS[id]?.name ?? id}】`).join('')
      return `【任务】完成「${QUESTS[r.questId]?.name ?? r.questId}」 +${r.exp}经验 +${r.gold}G ${items}`
    }
    if (r.reason === 'bag_full') return '背包已满, 无法领取任务奖励'
  }
  return null
}

// 订阅实体 id 列表(增删时才重渲染)
function useEntityIds() {
  const cache = useRef({ remotes: [], monsters: [] })
  return useSyncExternalStore(
    (cb) => worldStore.subscribe(cb),
    () => {
      const remotes = worldStore.remoteIds()
      const monsters = worldStore.monsterIds()
      const c = cache.current
      if (
        remotes.length !== c.remotes.length ||
        remotes.some((v, i) => v !== c.remotes[i]) ||
        monsters.length !== c.monsters.length ||
        monsters.some((v, i) => v !== c.monsters[i])
      ) {
        cache.current = { remotes, monsters }
      }
      return cache.current
    },
  )
}

// 订阅自身属性(player_update)
function useSelfStats() {
  return useSyncExternalStore(
    (cb) => worldStore.subscribeStats(cb),
    () => worldStore.getSelfStats(),
  )
}

export default function GameScreen({ token, character, onLogout }) {
  const [status, setStatus] = useState('connecting')
  // 当前地图与本图起始位置; 切图时更新并触发场景/玩家重挂
  const [mapState, setMapState] = useState({
    mapId: character.map,
    pos: { x: character.pos.x, z: character.pos.z },
    seq: 0, // 同图传送(复活回城时已在王城)也要重挂
  })
  const [loading, setLoading] = useState(false)
  const [nearPortal, setNearPortal] = useState(false)
  const [nearNpc, setNearNpc] = useState(null)      // 附近 NPC id
  const [activeNpc, setActiveNpc] = useState(null)  // 正在对话的 NPC id
  const [showCharPanel, setShowCharPanel] = useState(false)
  const [showQuestPanel, setShowQuestPanel] = useState(false)
  const [, buffTick] = useState(0) // 驱动 buff 剩余秒数刷新
  const { remotes, monsters } = useEntityIds()
  const stats = useSelfStats()
  const cls = CLASSES[character.classId]
  const selfPosRef = useRef({ x: character.pos.x, z: character.pos.z })
  const getSelfPos = useCallback(() => selfPosRef.current, [])
  const chatSinkRef = useRef(null)

  useEffect(() => {
    connectGame(token, {
      onWelcome: (d) => {
        setStatus('online')
        setMapState({
          mapId: d.character.map,
          pos: { x: d.character.pos.x, z: d.character.pos.z },
          seq: 0,
        })
      },
      onMapChanged: (d) => {
        // 短暂 Loading 遮罩过渡, 掩盖场景重建
        setLoading(true)
        setNearPortal(false)
        setNearNpc(null)
        setActiveNpc(null)
        setMapState((prev) => ({ mapId: d.map, pos: { x: d.x, z: d.z }, seq: prev.seq + 1 }))
        setTimeout(() => setLoading(false), 500)
      },
      onKicked: () => setStatus('kicked'),
      onDisconnect: () => setStatus((s) => (s === 'kicked' ? s : 'offline')),
      onError: () => setStatus('offline'),
      onChat: (msg) => chatSinkRef.current?.(msg),
      onNpcResult: (r) => {
        // NPC 交互结果 -> 系统消息
        const text = npcResultText(r)
        if (text) {
          chatSinkRef.current?.({ from: '系统', level: 0, text, t: Date.now() })
        }
      },
    })
    return () => disconnectGame()
  }, [token])

  // C 键角色面板 / Q 键任务面板
  useEffect(() => {
    function onKey(e) {
      if (e.repeat) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'KeyC') setShowCharPanel((v) => !v)
      if (e.code === 'KeyQ') setShowQuestPanel((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 对话中走出交互范围自动关闭
  useEffect(() => {
    if (!activeNpc) return
    const npc = NPCS[activeNpc]
    const iv = setInterval(() => {
      const pos = selfPosRef.current
      if (Math.hypot(npc.x - pos.x, npc.z - pos.z) > 3.2) setActiveNpc(null)
    }, 300)
    return () => clearInterval(iv)
  }, [activeNpc])

  // 任务进度 toast -> 系统消息
  useEffect(() => {
    return worldStore.subscribeQuests((d) => {
      if (!d.toast) return
      const q = QUESTS[d.toast.questId]
      if (!q) return
      const text = d.toast.done
        ? `【任务】${q.name} 已完成! 回去找${NPCS[q.npc]?.name ?? 'NPC'}交付吧`
        : `【任务】${q.name} ${d.toast.progress}/${d.toast.goal}`
      chatSinkRef.current?.({ from: '系统', level: 0, text, t: Date.now() })
    })
  }, [])

  // 掉落获得提示 -> 聊天面板系统消息
  useEffect(() => {
    return worldStore.subscribeInventory((d) => {
      if (d.gained) {
        const item = ITEMS[d.gained]
        chatSinkRef.current?.({
          from: '系统',
          level: 0,
          text: `击败${d.gainedFrom ?? '怪物'}, 获得【${item?.name ?? d.gained}】!`,
          t: Date.now(),
        })
      } else if (d.full) {
        chatSinkRef.current?.({
          from: '系统', level: 0, text: '背包已满, 掉落的装备丢失了…', t: Date.now(),
        })
      }
    })
  }, [])

  // Buff 图标剩余秒数每秒刷新
  useEffect(() => {
    const iv = setInterval(() => buffTick((n) => n + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  if (status === 'kicked') {
    return (
      <div className="dq-screen">
        <div className="dq-panel">
          <h2>你的账号在其他地方登录</h2>
          <button onClick={onLogout}>返回登录</button>
        </div>
      </div>
    )
  }

  const hp = stats?.hp ?? character.hp
  const maxHp = stats?.maxHp ?? character.hp
  const mp = stats?.mp ?? character.mp
  const maxMp = stats?.maxMp ?? character.mp
  const level = stats?.level ?? character.level
  const exp = stats?.exp ?? character.exp
  const expNext = stats?.expNext ?? 1
  const gold = stats?.gold ?? character.gold
  const isDead = hp <= 0
  const mapKey = `${mapState.mapId}#${mapState.seq}`

  // Buff 图标数据: 用接收时刻 + remain 推算剩余秒
  const buffAge = stats?.t ? (Date.now() - stats.t) / 1000 : 0
  const activeBuffs = (stats?.buffs ?? [])
    .map((b) => ({ ...b, left: Math.max(0, b.remain - buffAge) }))
    .filter((b) => b.left > 0)

  return (
    <div className="game-root">
      <Canvas shadows camera={{ fov: 55, position: [0, 6, 10] }}>
        <Suspense fallback={null}>
          <GameMap key={`map-${mapKey}`} mapId={mapState.mapId} />
          <Player
            key={`player-${mapKey}`}
            character={character}
            mapId={mapState.mapId}
            startPos={mapState.pos}
            posRef={selfPosRef}
            onPortalNearby={setNearPortal}
            onNpcNearby={setNearNpc}
            onInteractNpc={setActiveNpc}
          />
          {remotes.map((id) => (
            <RemotePlayer key={id} id={id} />
          ))}
          {monsters.map((id) => (
            <Monster key={id} id={id} />
          ))}
          <DamagePopups selfId={character.nickname} getSelfPos={getSelfPos} />
          <SkillEffects getSelfPos={getSelfPos} />
        </Suspense>
      </Canvas>

      {/* HUD 左上: 状态面板 */}
      <div className="hud-top-left">
        <div className="hud-name">
          {character.nickname} <span className="hud-class">Lv.{level} {cls.name}</span>
        </div>
        <div className="hud-bar hp">
          <div style={{ width: `${(hp / maxHp) * 100}%` }} />
          <span>HP {hp}/{maxHp}</span>
        </div>
        <div className="hud-bar mp">
          <div style={{ width: `${(mp / maxMp) * 100}%` }} />
          <span>MP {mp}/{maxMp}</span>
        </div>
        <div className="hud-bar exp">
          <div style={{ width: `${(exp / expNext) * 100}%` }} />
          <span>EXP {exp}/{expNext}</span>
        </div>
        <div className="hud-gold">💰 {gold} G</div>
        {activeBuffs.length > 0 && (
          <div className="hud-buffs">
            {activeBuffs.map((b) => (
              <span key={b.id} className="hud-buff" title={SKILLS[b.id]?.name ?? b.id}>
                {SKILLS[b.id]?.icon ?? '✦'} {Math.ceil(b.left)}s
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="hud-top-right">
        <div>{MAPS[mapState.mapId].name}</div>
        <div className={`hud-status ${status}`}>
          {status === 'online'
            ? `本图 ${remotes.length + 1} 人`
            : status === 'connecting'
              ? '连接中…'
              : '连接断开'}
        </div>
      </div>

      {/* 传送/NPC 交互提示 */}
      {nearNpc && !activeNpc && !isDead && (
        <div className="portal-hint">按 E 与 {NPCS[nearNpc]?.name} 对话</div>
      )}
      {nearPortal && !nearNpc && !isDead && (
        <div className="portal-hint">按 E 传送</div>
      )}

      {/* 死亡遮罩 */}
      {isDead && (
        <div className="death-overlay">
          <div>你被击倒了…</div>
          <div className="death-sub">3 秒后在王城复活</div>
        </div>
      )}

      {/* 切图 Loading */}
      {loading && (
        <div className="map-loading">
          <div>{MAPS[mapState.mapId].name}</div>
        </div>
      )}

      <ChatPanel messagesRef={chatSinkRef} />

      <SkillBar classId={character.classId} />

      {showCharPanel && (
        <CharacterPanel character={character} onClose={() => setShowCharPanel(false)} />
      )}

      {showQuestPanel && <QuestPanel onClose={() => setShowQuestPanel(false)} />}

      {activeNpc && !isDead && (
        <NpcDialog npcId={activeNpc} character={character} onClose={() => setActiveNpc(null)} />
      )}

      <div className="hud-bottom">
        WASD 移动 · 空格 攻击 · 1/2/3 技能 · E 交互 · C 角色 · Q 任务 · Enter 聊天
      </div>
    </div>
  )
}
