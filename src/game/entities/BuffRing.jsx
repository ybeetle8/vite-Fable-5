// 强化术(blessing)持续光环: 脚下旋转金色光圈
// getBuffs 每帧返回当前 buff id 数组(自己来自 selfStats, 远程玩家来自快照)
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export default function BuffRing({ getBuffs }) {
  const ref = useRef()
  const t = useRef(0)

  useFrame((_, delta) => {
    if (!ref.current) return
    const active = getBuffs?.()?.includes('blessing') ?? false
    ref.current.visible = active
    if (active) {
      t.current += delta
      const s = 1 + Math.sin(t.current * 4) * 0.12 // 呼吸脉动
      ref.current.scale.set(s, s, 1)
      ref.current.material.opacity = 0.5 + Math.sin(t.current * 4) * 0.2
    }
  })

  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.06} visible={false}>
      <ringGeometry args={[0.55, 0.8, 32]} />
      <meshBasicMaterial color="#ffd75e" transparent opacity={0.65} side={2} />
    </mesh>
  )
}
