// 怪物实体: 按类型渲染不同几何体造型 + 弹跳/浮动动画 + 插值 + 受击闪红 + 血条
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { worldStore } from '../net/worldStore.js'
import Nameplate from './Nameplate.jsx'

const RENDER_DELAY_MS = 100
const FLASH_COLOR = '#ff4444'

// 各怪物类型的造型配置: 主色 + 造型函数
const LOOKS = {
  slime: { color: '#3b7ddd', height: 1.5, bob: 0.12 },
  bigbeak: { color: '#e0a030', height: 1.9, bob: 0.1 },
  mothvenom: { color: '#9b59b6', height: 1.9, bob: 0.22, float: 0.8 },
  treant: { color: '#5d7a3a', height: 2.9, bob: 0.04 },
  skeleton: { color: '#cfc9bd', height: 2.4, bob: 0.05 },
  golem: { color: '#7d7468', height: 2.9, bob: 0.03 },
  demon: { color: '#c0392b', height: 2.7, bob: 0.08 },
}

/* ---------- 造型 ---------- */

function SlimeBody({ material }) {
  return (
    <>
      <mesh position={[0, 0.45, 0]} scale={[1, 0.85, 1]} castShadow material={material}>
        <sphereGeometry args={[0.5, 24, 18]} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow material={material}>
        <coneGeometry args={[0.22, 0.4, 16]} />
      </mesh>
      <Eyes y={0.55} z={0.42} />
    </>
  )
}

function BigbeakBody({ material }) {
  return (
    <>
      {/* 圆胖鸟身 */}
      <mesh position={[0, 0.7, 0]} scale={[1, 1.1, 1]} castShadow material={material}>
        <sphereGeometry args={[0.5, 20, 16]} />
      </mesh>
      {/* 大嘴 */}
      <mesh position={[0, 0.65, 0.55]} rotation={[Math.PI / 2.2, 0, 0]} castShadow>
        <coneGeometry args={[0.22, 0.6, 10]} />
        <meshStandardMaterial color="#f5c542" />
      </mesh>
      {/* 翅膀 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.5, 0.75, 0]} rotation={[0, 0, side * 0.6]} castShadow material={material}>
          <boxGeometry args={[0.5, 0.1, 0.4]} />
        </mesh>
      ))}
      <Eyes y={0.95} z={0.38} gap={0.14} />
    </>
  )
}

function MothBody({ material }) {
  return (
    <>
      {/* 蛾身 */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={material}>
        <capsuleGeometry args={[0.22, 0.5, 6, 12]} />
      </mesh>
      {/* 双翅 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.5, 0.1, 0]} rotation={[0, side * -0.3, side * 0.2]} castShadow>
          <planeGeometry args={[0.9, 0.65]} />
          <meshStandardMaterial color="#c39bd3" side={2} transparent opacity={0.85} />
        </mesh>
      ))}
      <Eyes y={0.1} z={0.5} gap={0.12} />
    </>
  )
}

function TreantBody({ material }) {
  return (
    <>
      {/* 树干身体 */}
      <mesh position={[0, 1.0, 0]} castShadow material={material}>
        <cylinderGeometry args={[0.45, 0.65, 2.0, 10]} />
      </mesh>
      {/* 树冠头 */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <sphereGeometry args={[0.75, 12, 10]} />
        <meshStandardMaterial color="#3d6b2f" flatShading />
      </mesh>
      {/* 手臂 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.75, 1.35, 0]} rotation={[0, 0, side * 0.7]} castShadow material={material}>
          <cylinderGeometry args={[0.1, 0.16, 1.1, 6]} />
        </mesh>
      ))}
      <Eyes y={1.5} z={0.48} gap={0.2} />
    </>
  )
}

function SkeletonBody({ material }) {
  return (
    <>
      {/* 躯干 */}
      <mesh position={[0, 1.0, 0]} castShadow material={material}>
        <boxGeometry args={[0.55, 0.8, 0.3]} />
      </mesh>
      {/* 头骨 */}
      <mesh position={[0, 1.75, 0]} castShadow material={material}>
        <sphereGeometry args={[0.28, 12, 10]} />
      </mesh>
      {/* 四肢 */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.4, 1.05, 0]} rotation={[0, 0, side * 0.25]} castShadow material={material}>
            <cylinderGeometry args={[0.06, 0.06, 0.7, 6]} />
          </mesh>
          <mesh position={[side * 0.15, 0.35, 0]} castShadow material={material}>
            <cylinderGeometry args={[0.07, 0.07, 0.7, 6]} />
          </mesh>
        </group>
      ))}
      {/* 眼窝 */}
      <mesh position={[-0.09, 1.78, 0.24]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshBasicMaterial color="#200" />
      </mesh>
      <mesh position={[0.09, 1.78, 0.24]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshBasicMaterial color="#200" />
      </mesh>
    </>
  )
}

function GolemBody({ material }) {
  return (
    <>
      {/* 巨石躯干 */}
      <mesh position={[0, 1.1, 0]} castShadow material={material}>
        <dodecahedronGeometry args={[0.85, 0]} />
      </mesh>
      {/* 头 */}
      <mesh position={[0, 2.15, 0]} castShadow material={material}>
        <dodecahedronGeometry args={[0.4, 0]} />
      </mesh>
      {/* 拳头 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.0, 0.9, 0]} castShadow material={material}>
          <dodecahedronGeometry args={[0.38, 0]} />
        </mesh>
      ))}
      <Eyes y={2.2} z={0.32} gap={0.15} color="#ffcc00" />
    </>
  )
}

function DemonBody({ material }) {
  return (
    <>
      {/* 躯干 */}
      <mesh position={[0, 1.1, 0]} scale={[1, 1.25, 0.8]} castShadow material={material}>
        <sphereGeometry args={[0.55, 14, 12]} />
      </mesh>
      {/* 头 */}
      <mesh position={[0, 2.0, 0]} castShadow material={material}>
        <sphereGeometry args={[0.32, 12, 10]} />
      </mesh>
      {/* 犄角 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.2, 2.32, 0]} rotation={[0, 0, side * -0.4]} castShadow>
          <coneGeometry args={[0.08, 0.4, 8]} />
          <meshStandardMaterial color="#2c2c2c" />
        </mesh>
      ))}
      {/* 翅膀 */}
      {[-1, 1].map((side) => (
        <mesh key={`w${side}`} position={[side * 0.7, 1.5, -0.3]} rotation={[0.3, 0, side * 0.9]} castShadow>
          <planeGeometry args={[0.9, 0.7]} />
          <meshStandardMaterial color="#5b1a1a" side={2} />
        </mesh>
      ))}
      <Eyes y={2.05} z={0.28} gap={0.13} color="#ffe600" />
    </>
  )
}

function Eyes({ y, z, gap = 0.16, color = '#ffffff' }) {
  return (
    <>
      <mesh position={[-gap, y, z]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[gap, y, z]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {color === '#ffffff' && (
        <>
          <mesh position={[-gap, y, z + 0.06]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial color="#111111" />
          </mesh>
          <mesh position={[gap, y, z + 0.06]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial color="#111111" />
          </mesh>
        </>
      )}
    </>
  )
}

const BODIES = {
  slime: SlimeBody,
  bigbeak: BigbeakBody,
  mothvenom: MothBody,
  treant: TreantBody,
  skeleton: SkeletonBody,
  golem: GolemBody,
  demon: DemonBody,
}

/* ---------- 主组件 ---------- */

export default function Monster({ id }) {
  const group = useRef()
  const bounce = useRef(Math.random() * Math.PI * 2)
  const flashUntil = useRef(0)
  const entry = worldStore.getMonster(id)
  const type = entry?.info.type ?? 'slime'
  const look = LOOKS[type] ?? LOOKS.slime

  // 每只怪独立材质便于受击闪红
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.4, flatShading: type !== 'slime' }),
    [look.color, type],
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

    // 死亡: 缩小消失; 重生时快照 dead=false 自然放大回来
    if (info.dead) {
      group.current.scale.lerp(new THREE.Vector3(0.01, 0.01, 0.01), Math.min(1, delta * 10))
      group.current.visible = group.current.scale.x > 0.05
      return
    }
    group.current.visible = true
    group.current.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, delta * 8))

    // 快照插值
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

    // 弹跳/漂浮
    bounce.current += delta * (info.moving ? 10 : 4)
    const base = look.float ?? 0
    group.current.position.y = base + Math.abs(Math.sin(bounce.current)) * look.bob

    // 受击闪红 > 冰冻染蓝 > 原色
    if (performance.now() < flashUntil.current) {
      material.color.set(FLASH_COLOR)
    } else if (info.slowed) {
      material.color.set('#7ec8f0')
    } else {
      material.color.set(look.color)
    }
  })

  if (!entry) return null
  const { info } = entry
  const Body = BODIES[type] ?? SlimeBody

  return (
    <group ref={group} position={[info.x, 0, info.z]}>
      <Body material={material} />
      <Nameplate
        nickname={info.name}
        hp={info.hp}
        maxHp={info.maxHp}
        getStats={() => worldStore.getMonster(id)?.info}
        color="#ffb0b0"
        height={look.height}
      />
    </group>
  )
}
