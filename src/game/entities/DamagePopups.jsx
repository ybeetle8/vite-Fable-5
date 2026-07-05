// 伤害飘字: 订阅战斗事件, 在目标位置生成上飘渐隐的数字
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { worldStore } from '../net/worldStore.js'

const LIFETIME = 0.9 // 秒

let nextKey = 1

// 事件 -> 飘字的世界坐标与样式
function toPopup(ev, selfId, selfPos) {
  if (ev.kind === 'player_hit_monster') {
    const m = worldStore.getMonster(ev.targetId)
    if (!m) return null
    return {
      x: m.info.x, z: m.info.z, y: 1.4,
      text: `${ev.dmg}`,
      color: ev.attackerId === selfId ? '#ffe066' : '#ffffff',
    }
  }
  if (ev.kind === 'monster_hit_player') {
    if (ev.targetId === selfId) {
      return { x: selfPos.x, z: selfPos.z, y: 2.0, text: `-${ev.dmg}`, color: '#ff6b6b' }
    }
    const r = worldStore.getRemote(ev.targetId)
    if (!r) return null
    return { x: r.info.x, z: r.info.z, y: 2.0, text: `-${ev.dmg}`, color: '#ff9a9a' }
  }
  if (ev.kind === 'player_heal') {
    if (ev.targetId === selfId) {
      return { x: selfPos.x, z: selfPos.z, y: 2.0, text: `+${ev.amount}`, color: '#7cff9a' }
    }
    const r = worldStore.getRemote(ev.targetId)
    if (!r) return null
    return { x: r.info.x, z: r.info.z, y: 2.0, text: `+${ev.amount}`, color: '#7cff9a' }
  }
  if (ev.kind === 'level_up') {
    if (ev.playerId === selfId) {
      return { x: selfPos.x, z: selfPos.z, y: 2.4, text: 'LEVEL UP!', color: '#7cff7c', big: true }
    }
    const r = worldStore.getRemote(ev.playerId)
    if (!r) return null
    return { x: r.info.x, z: r.info.z, y: 2.4, text: 'LEVEL UP!', color: '#7cff7c', big: true }
  }
  return null
}

function Popup({ data, onDone }) {
  const ref = useRef()
  const age = useRef(0)
  useFrame((_, delta) => {
    age.current += delta
    if (age.current >= LIFETIME) {
      onDone()
      return
    }
    if (ref.current) {
      ref.current.position.y = data.y + age.current * 1.5
    }
  })
  return (
    <Billboard ref={ref} position={[data.x, data.y, data.z]}>
      <Text
        fontSize={data.big ? 0.5 : 0.42}
        color={data.color}
        outlineWidth={0.03}
        outlineColor="#000000"
        fontWeight="bold"
      >
        {data.text}
      </Text>
    </Billboard>
  )
}

export default function DamagePopups({ selfId, getSelfPos }) {
  const [popups, setPopups] = useState([])

  useEffect(() => {
    return worldStore.subscribeCombat((ev) => {
      // 服务器事件中玩家 id 为 username, 以 store 的 selfId 为准
      const p = toPopup(ev, worldStore.getSelfId() ?? selfId, getSelfPos())
      if (!p) return
      const key = nextKey++
      setPopups((list) => [...list.slice(-20), { key, ...p }]) // 上限防堆积
    })
  }, [selfId, getSelfPos])

  return popups.map((p) => (
    <Popup
      key={p.key}
      data={p}
      onDone={() => setPopups((list) => list.filter((x) => x.key !== p.key))}
    />
  ))
}
