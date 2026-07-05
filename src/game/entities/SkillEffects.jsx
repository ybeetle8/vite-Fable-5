// 技能特效(M8): 订阅 skill_result 的 hit 事件, 按技能生成一次性几何体特效
// 与 DamagePopups 同款模式: state 数组 + onDone 自清理
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { SKILLS } from '../gameData.js'
import { worldStore } from '../net/worldStore.js'

let nextKey = 1

// 施法者/目标当前位置(自己用 posRef, 他人查 store)
function entityPos(id, selfId, selfPos) {
  if (id === selfId) return selfPos
  const r = worldStore.getRemote(id)
  if (r) return { x: r.info.x, z: r.info.z }
  const m = worldStore.getMonster(id)
  if (m) return { x: m.info.x, z: m.info.z }
  return null
}

// ---------- 各类特效组件(全部 useFrame 驱动, 到时 onDone 卸载) ----------

// 火球: 从施法者飞向目标 0.25s, 命中处爆开渐隐 0.3s
function Fireball({ data, onDone }) {
  const ref = useRef()
  const age = useRef(0)
  const FLY = 0.25
  const BOOM = 0.3
  useFrame((_, delta) => {
    age.current += delta
    const t = age.current
    if (t >= FLY + BOOM) return onDone()
    if (!ref.current) return
    if (t < FLY) {
      const k = t / FLY
      ref.current.position.set(
        data.from.x + (data.to.x - data.from.x) * k,
        1.2,
        data.from.z + (data.to.z - data.from.z) * k,
      )
    } else {
      const k = (t - FLY) / BOOM
      ref.current.position.set(data.to.x, 1.2, data.to.z)
      ref.current.scale.setScalar(1 + k * 3)
      ref.current.material.opacity = 0.9 * (1 - k)
    }
  })
  return (
    <mesh ref={ref} position={[data.from.x, 1.2, data.from.z]}>
      <sphereGeometry args={[0.28, 12, 12]} />
      <meshBasicMaterial color="#ff8830" transparent opacity={0.9} />
    </mesh>
  )
}

// 闪电: 沿朝向的细长盒, 闪烁 0.25s
function Lightning({ data, onDone }) {
  const ref = useRef()
  const age = useRef(0)
  const LIFE = 0.3
  useFrame((_, delta) => {
    age.current += delta
    if (age.current >= LIFE) return onDone()
    if (ref.current) {
      ref.current.material.opacity = 0.4 + Math.random() * 0.5 // 电光闪烁
    }
  })
  const len = data.length
  return (
    <group
      position={[data.x, 1.1, data.z]}
      rotation-y={data.facing}
    >
      <mesh ref={ref} position={[0, 0, len / 2]}>
        <boxGeometry args={[0.3, 1.6, len]} />
        <meshBasicMaterial color="#9fdcff" transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

// 扩散圆环: 旋风斩(橙)/挑衅(红)/群疗(绿) 通用, 从小扩到 radius 渐隐
function ExpandRing({ data, onDone }) {
  const ref = useRef()
  const age = useRef(0)
  const LIFE = 0.45
  useFrame((_, delta) => {
    age.current += delta
    const k = age.current / LIFE
    if (k >= 1) return onDone()
    if (ref.current) {
      const r = 0.5 + (data.radius - 0.5) * k
      ref.current.scale.set(r, r, 1)
      ref.current.material.opacity = 0.7 * (1 - k)
    }
  })
  return (
    <mesh ref={ref} position={[data.x, 0.1, data.z]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.85, 1, 40]} />
      <meshBasicMaterial color={data.color} transparent opacity={0.7} side={2} />
    </mesh>
  )
}

// 冰晶: 目标处冰蓝二十面体 0.5s 渐隐
function FrostCrystal({ data, onDone }) {
  const ref = useRef()
  const age = useRef(0)
  const LIFE = 0.5
  useFrame((_, delta) => {
    age.current += delta
    const k = age.current / LIFE
    if (k >= 1) return onDone()
    if (ref.current) {
      ref.current.rotation.y += delta * 3
      ref.current.material.opacity = 0.85 * (1 - k)
    }
  })
  return (
    <mesh ref={ref} position={[data.x, 1.0, data.z]}>
      <icosahedronGeometry args={[0.5, 0]} />
      <meshBasicMaterial color="#8fd8ff" transparent opacity={0.85} />
    </mesh>
  )
}

// 光柱: 治疗(绿)/强化(金), 竖直圆柱 0.8s 渐隐上升
function LightPillar({ data, onDone }) {
  const ref = useRef()
  const age = useRef(0)
  const LIFE = 0.8
  useFrame((_, delta) => {
    age.current += delta
    const k = age.current / LIFE
    if (k >= 1) return onDone()
    if (ref.current) {
      ref.current.position.y = 1.5 + k * 0.8
      ref.current.material.opacity = 0.55 * (1 - k)
    }
  })
  return (
    <mesh ref={ref} position={[data.x, 1.5, data.z]}>
      <cylinderGeometry args={[0.55, 0.55, 3, 16, 1, true]} />
      <meshBasicMaterial color={data.color} transparent opacity={0.55} side={2} />
    </mesh>
  )
}

// 挑衅感叹号: 施法者头顶红色 ❗ 0.8s
function TauntMark({ data, onDone }) {
  const age = useRef(0)
  const LIFE = 0.8
  useFrame((_, delta) => {
    age.current += delta
    if (age.current >= LIFE) onDone()
  })
  return (
    <Billboard position={[data.x, 2.6, data.z]}>
      <Text fontSize={0.6} color="#ff5544" outlineWidth={0.04} outlineColor="#000" fontWeight="bold">
        !!
      </Text>
    </Billboard>
  )
}

const COMPONENTS = {
  fireball: Fireball,
  lightning: Lightning,
  ring: ExpandRing,
  frost: FrostCrystal,
  pillar: LightPillar,
  taunt: TauntMark,
}

// skill_result(hit) -> 特效描述列表
function toEffects(ev, selfId, selfPos) {
  const skill = SKILLS[ev.skillId]
  if (!skill) return []
  const caster = entityPos(ev.casterId, selfId, selfPos) ?? { x: ev.x, z: ev.z }
  const fx = []

  switch (ev.skillId) {
    case 'fireball': {
      const to = entityPos(ev.targetId, selfId, selfPos) ?? caster
      fx.push({ type: 'fireball', from: { ...caster }, to: { ...to } })
      break
    }
    case 'frost': {
      const to = entityPos(ev.targetId, selfId, selfPos) ?? caster
      fx.push({ type: 'frost', x: to.x, z: to.z })
      break
    }
    case 'lightning':
      fx.push({ type: 'lightning', x: ev.x, z: ev.z, facing: ev.facing, length: skill.length })
      break
    case 'heavy_slash': {
      const to = entityPos(ev.targets?.[0], selfId, selfPos)
      if (to) fx.push({ type: 'ring', x: to.x, z: to.z, radius: 1.2, color: '#ffcc66' })
      break
    }
    case 'whirlwind':
      fx.push({ type: 'ring', x: ev.x, z: ev.z, radius: skill.radius, color: '#ffaa33' })
      break
    case 'taunt':
      fx.push({ type: 'taunt', x: ev.x, z: ev.z })
      fx.push({ type: 'ring', x: ev.x, z: ev.z, radius: skill.radius, color: '#ff5544' })
      break
    case 'heal':
    case 'mass_heal':
      for (const id of ev.targets ?? []) {
        const p = entityPos(id, selfId, selfPos)
        if (p) fx.push({ type: 'pillar', x: p.x, z: p.z, color: '#7cff9a' })
      }
      break
    case 'blessing':
      for (const id of ev.targets ?? []) {
        const p = entityPos(id, selfId, selfPos)
        if (p) fx.push({ type: 'pillar', x: p.x, z: p.z, color: '#ffd75e' })
      }
      break
  }
  return fx
}

export default function SkillEffects({ getSelfPos }) {
  const [effects, setEffects] = useState([])

  useEffect(() => {
    return worldStore.subscribeSkill((ev) => {
      if (ev.phase !== 'hit') return
      const fx = toEffects(ev, worldStore.getSelfId(), getSelfPos())
      if (fx.length === 0) return
      setEffects((list) => [...list.slice(-24), ...fx.map((f) => ({ key: nextKey++, ...f }))])
    })
  }, [getSelfPos])

  return effects.map((f) => {
    const Comp = COMPONENTS[f.type]
    return (
      <Comp
        key={f.key}
        data={f}
        onDone={() => setEffects((list) => list.filter((x) => x.key !== f.key))}
      />
    )
  })
}
