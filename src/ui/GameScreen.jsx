// 游戏主画面: 3D Canvas + 远程玩家 + 怪物 + 飘字 + HUD
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { CLASSES, MAPS } from '../../shared/config.js'
import { connectGame, disconnectGame } from '../game/net/socket.js'
import { worldStore } from '../game/net/worldStore.js'
import NovicePlain from '../game/scenes/NovicePlain.jsx'
import Player from '../game/entities/Player.jsx'
import RemotePlayer from '../game/entities/RemotePlayer.jsx'
import Monster from '../game/entities/Monster.jsx'
import DamagePopups from '../game/entities/DamagePopups.jsx'
import ChatPanel from './ChatPanel.jsx'

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
  const { remotes, monsters } = useEntityIds()
  const stats = useSelfStats()
  const cls = CLASSES[character.classId]
  const selfPosRef = useRef({ x: character.pos.x, z: character.pos.z })
  const getSelfPos = useCallback(() => selfPosRef.current, [])
  const chatSinkRef = useRef(null)

  useEffect(() => {
    connectGame(token, {
      onWelcome: () => setStatus('online'),
      onKicked: () => setStatus('kicked'),
      onDisconnect: () => setStatus((s) => (s === 'kicked' ? s : 'offline')),
      onError: () => setStatus('offline'),
      onChat: (msg) => chatSinkRef.current?.(msg),
    })
    return () => disconnectGame()
  }, [token])

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

  return (
    <div className="game-root">
      <Canvas shadows camera={{ fov: 55, position: [0, 6, 10] }}>
        <Suspense fallback={null}>
          <NovicePlain />
          <Player character={character} posRef={selfPosRef} />
          {remotes.map((id) => (
            <RemotePlayer key={id} id={id} />
          ))}
          {monsters.map((id) => (
            <Monster key={id} id={id} />
          ))}
          <DamagePopups selfId={character.nickname} getSelfPos={getSelfPos} />
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
      </div>

      <div className="hud-top-right">
        <div>{MAPS[character.map].name}</div>
        <div className={`hud-status ${status}`}>
          {status === 'online'
            ? `在线 ${remotes.length + 1} 人`
            : status === 'connecting'
              ? '连接中…'
              : '连接断开'}
        </div>
      </div>

      {/* 死亡遮罩 */}
      {isDead && (
        <div className="death-overlay">
          <div>你被击倒了…</div>
          <div className="death-sub">3 秒后在出生点复活</div>
        </div>
      )}

      <ChatPanel messagesRef={chatSinkRef} />

      <div className="hud-bottom">
        WASD 移动 · 空格 攻击 · Enter 聊天 · 右键拖动旋转镜头 · 滚轮缩放
      </div>
    </div>
  )
}
