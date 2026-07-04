// 游戏主画面: 3D Canvas + HUD
import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { CLASSES, MAPS } from '../../shared/config.js'
import { connectGame, disconnectGame } from '../game/net/socket.js'
import NovicePlain from '../game/scenes/NovicePlain.jsx'
import Player from '../game/entities/Player.jsx'

export default function GameScreen({ token, character, onLogout }) {
  const [status, setStatus] = useState('connecting') // connecting | online | kicked | offline
  const [online, setOnline] = useState(0)
  const cls = CLASSES[character.classId]

  useEffect(() => {
    connectGame(token, {
      onWelcome: (d) => {
        setStatus('online')
        setOnline(d.online)
      },
      onKicked: () => setStatus('kicked'),
      onDisconnect: () => setStatus((s) => (s === 'kicked' ? s : 'offline')),
      onError: () => setStatus('offline'),
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

  return (
    <div className="game-root">
      <Canvas shadows camera={{ fov: 55, position: [0, 6, 10] }}>
        <Suspense fallback={null}>
          <NovicePlain />
          <Player character={character} />
        </Suspense>
      </Canvas>

      {/* HUD */}
      <div className="hud-top-left">
        <div className="hud-name">
          {character.nickname} <span className="hud-class">Lv.{character.level} {cls.name}</span>
        </div>
        <div className="hud-bar hp">
          <div style={{ width: `${(character.hp / character.hp) * 100}%` }} />
          <span>HP {character.hp}</span>
        </div>
        <div className="hud-bar mp">
          <div style={{ width: '100%' }} />
          <span>MP {character.mp}</span>
        </div>
      </div>

      <div className="hud-top-right">
        <div>{MAPS[character.map].name}</div>
        <div className={`hud-status ${status}`}>
          {status === 'online' ? `在线 ${online} 人` : status === 'connecting' ? '连接中…' : '连接断开'}
        </div>
      </div>

      <div className="hud-bottom">
        WASD 移动 · 右键拖动旋转镜头 · 滚轮缩放
      </div>
    </div>
  )
}
