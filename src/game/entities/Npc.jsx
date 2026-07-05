// NPC 实体(M9): 几何体小人 + 头顶名字 + 任务标记(!/?)
import { useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { QUESTS_BY_NPC } from '../gameData.js'
import { worldStore } from '../net/worldStore.js'

const SKIN = '#f0c8a0'

// 按玩家任务状态计算 NPC 头顶标记: 可交付 > 可接 > 进行中
function questMarker(npcId, quests) {
  const list = QUESTS_BY_NPC[npcId]
  if (!list || !quests) return null
  const activeIds = new Set(quests.active.map((q) => q.id))
  const progressOf = (id) => quests.active.find((q) => q.id === id)?.progress ?? 0

  for (const q of list) {
    if (activeIds.has(q.id) && progressOf(q.id) >= q.goal) {
      return { text: '?', color: '#ffd75e' } // 可交付
    }
  }
  for (const q of list) {
    const done = quests.completed.includes(q.id)
    const okPrereq = !q.prereq || quests.completed.includes(q.prereq)
    if (!done && !activeIds.has(q.id) && okPrereq) {
      return { text: '!', color: '#ffd75e' } // 可接取
    }
  }
  if (list.some((q) => activeIds.has(q.id))) {
    return { text: '?', color: '#9a9aa8' } // 进行中
  }
  return null
}

// shape 差异件: 王冠/头巾/帽子等
function ShapeExtra({ shape, color }) {
  switch (shape) {
    case 'king':
      return (
        <mesh position={[0, 1.78, 0]}>
          <cylinderGeometry args={[0.22, 0.26, 0.22, 8]} />
          <meshStandardMaterial color="#ffd75e" flatShading />
        </mesh>
      )
    case 'sister':
      return (
        <mesh position={[0, 1.62, 0]}>
          <coneGeometry args={[0.32, 0.5, 10]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
      )
    case 'burly':
      return (
        <mesh position={[0, 1.15, 0]} rotation-z={0.15}>
          <boxGeometry args={[0.9, 0.18, 0.35]} />
          <meshStandardMaterial color="#5a3a24" flatShading />
        </mesh>
      )
    case 'lady':
      return (
        <mesh position={[0, 0.72, 0]}>
          <coneGeometry args={[0.48, 0.7, 10]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      )
    case 'round':
      return (
        <mesh position={[0, 1.7, 0]}>
          <cylinderGeometry args={[0.18, 0.2, 0.16, 10]} />
          <meshStandardMaterial color="#3a2a1a" flatShading />
        </mesh>
      )
    default:
      return null
  }
}

export default function Npc({ npc }) {
  const markerRef = useRef()
  const bob = useRef(Math.random() * Math.PI * 2)
  const quests = useSyncExternalStore(worldStore.subscribeQuests, worldStore.getQuests)
  const marker = npc.type === 'quest_giver' ? questMarker(npc.id, quests) : null

  // 标记上下浮动
  useFrame((_, delta) => {
    if (!markerRef.current) return
    bob.current += delta * 2.5
    markerRef.current.position.y = 2.9 + Math.sin(bob.current) * 0.1
  })

  const bodyWidth = npc.shape === 'burly' ? 0.45 : 0.35

  return (
    <group position={[npc.x, 0, npc.z]} rotation-y={npc.facing}>
      {/* 身体 */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[bodyWidth, bodyWidth + 0.08, 1.1, 10]} />
        <meshStandardMaterial color={npc.color} flatShading />
      </mesh>
      {/* 头 */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial color={SKIN} flatShading />
      </mesh>
      <ShapeExtra shape={npc.shape} color={npc.color} />

      {/* 头顶名字 */}
      <Billboard position={[0, 2.35, 0]}>
        <Text fontSize={0.3} color="#bde6ff" outlineWidth={0.025} outlineColor="#001a2e">
          {npc.name}
        </Text>
      </Billboard>

      {/* 任务标记 */}
      {marker && (
        <Billboard ref={markerRef} position={[0, 2.9, 0]}>
          <Text fontSize={0.55} color={marker.color} outlineWidth={0.04} outlineColor="#000000" fontWeight="bold">
            {marker.text}
          </Text>
        </Billboard>
      )}
    </group>
  )
}
