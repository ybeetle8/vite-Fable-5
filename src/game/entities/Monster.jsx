// 史莱姆怪物实体: DQ 风格水滴形几何体 + 弹跳动画 + 插值 + 受击闪红 + 血条
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { worldStore } from '../net/worldStore.js'
import Nameplate from './Nameplate.jsx'

const RENDER_DELAY_MS = 100
const BODY_COLOR = '#3b7ddd'
const FLASH_COLOR = '#ff4444'

export default function Monster({ id }) {
  const group = useRef()
  const bounce = useRef(Math.random() * Math.PI * 2)
  const flashUntil = useRef(0)
  const entry = worldStore.getMonster(id)

  // 每只怪独立材质便于受击闪红
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.3 }),
    [],
  )

  // 订阅战斗事件: 自己被打时闪红
  useEffect(() => {
    return worldStore.subscribeCombat((ev) => {
      if (ev.kind === 'player_hit_monster' && ev.targetId === id) {
        flashUntil.current = performance.now() + 150
      }
    })
  }, [id])

  useFrame((_, delta) => {
    const m = worldStore.getMonster(id)
    if (!m || !group.current) return
    const { info, buffer } = m

    // 死亡: 缩小消失; 重生时快照 dead=false 会自然放大回来
    if (info.dead) {
      group.current.scale.lerp(new THREE.Vector3(0.01, 0.01, 0.01), Math.min(1, delta * 10))
      group.current.visible = group.current.scale.x > 0.05
      return
    }
    group.current.visible = true
    group.current.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, delta * 8))

    // 快照插值(与 RemotePlayer 相同策略)
    if (buffer.length > 0) {
      const renderT = Date.now() - RENDER_DELAY_MS
      let a = buffer[0]
      let b = buffer[buffer.length - 1]
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i].t <= renderT) {
          a = buffer[i]
          b = buffer[i + 1] ?? buffer[i]
          break
        }
      }
      const span = b.t - a.t
      const k = span > 0 ? THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1) : 1
      group.current.position.x = THREE.MathUtils.lerp(a.x, b.x, k)
      group.current.position.z = THREE.MathUtils.lerp(a.z, b.z, k)
      let diff = b.facing - a.facing
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      group.current.rotation.y = a.facing + diff * k
    }

    // 待机/移动弹跳
    bounce.current += delta * (info.moving ? 10 : 4)
    group.current.position.y = Math.abs(Math.sin(bounce.current)) * 0.12

    // 受击闪红
    material.color.set(performance.now() < flashUntil.current ? FLASH_COLOR : BODY_COLOR)
  })

  if (!entry) return null
  const { info } = entry

  return (
    <group ref={group} position={[info.x, 0, info.z]}>
      {/* 身体: 压扁的球 */}
      <mesh position={[0, 0.45, 0]} scale={[1, 0.85, 1]} castShadow material={material}>
        <sphereGeometry args={[0.5, 24, 18]} />
      </mesh>
      {/* 头顶尖角(DQ 史莱姆经典轮廓) */}
      <mesh position={[0, 0.95, 0]} castShadow material={material}>
        <coneGeometry args={[0.22, 0.4, 16]} />
      </mesh>
      {/* 眼睛 */}
      <mesh position={[-0.16, 0.55, 0.42]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.16, 0.55, 0.42]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.16, 0.55, 0.48]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial color="#111111" />
      </mesh>
      <mesh position={[0.16, 0.55, 0.48]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial color="#111111" />
      </mesh>
      <Nameplate
        nickname={info.name}
        hp={info.hp}
        maxHp={info.maxHp}
        getStats={() => worldStore.getMonster(id)?.info}
        color="#ffb0b0"
        height={1.5}
      />
    </group>
  )
}
