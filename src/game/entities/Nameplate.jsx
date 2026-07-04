// 头顶昵称/等级/血条(Billboard 朝向镜头)
// 实体组件平时不走 React 重渲染(useFrame 命令式更新), 所以血量通过
// getStats 回调每帧拉取最新值, 命令式更新血条与文字
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'

const BAR_W = 1.2
const BAR_H = 0.12

function makeLabel(level, nickname) {
  return level != null && level !== '' ? `Lv.${level} ${nickname}` : nickname
}

export default function Nameplate({ nickname, level, hp, maxHp, getStats, color = '#ffffff', height = 2.3 }) {
  const fillRef = useRef()
  const textRef = useRef()

  useFrame(() => {
    const s = getStats?.()
    if (!s) return
    const ratio = Math.max(0, Math.min(1, s.maxHp > 0 ? s.hp / s.maxHp : 1))
    if (fillRef.current) {
      fillRef.current.scale.x = Math.max(ratio, 0.001)
      fillRef.current.position.x = (-BAR_W * (1 - ratio)) / 2
    }
    if (textRef.current) {
      const label = makeLabel(s.level ?? level, nickname)
      if (textRef.current.text !== label) textRef.current.text = label
    }
  })

  const ratio = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 1))

  return (
    <Billboard position={[0, height, 0]}>
      <Text
        ref={textRef}
        fontSize={0.28}
        color={color}
        outlineWidth={0.02}
        outlineColor="#000000"
        anchorY="bottom"
        position={[0, 0.12, 0]}
      >
        {makeLabel(level, nickname)}
      </Text>
      {/* 血条底 */}
      <mesh>
        <planeGeometry args={[BAR_W, BAR_H]} />
        <meshBasicMaterial color="#222222" depthWrite={false} />
      </mesh>
      {/* 血条填充: 左对齐缩放 */}
      <mesh
        ref={fillRef}
        position={[(-BAR_W * (1 - ratio)) / 2, 0, 0.001]}
        scale={[Math.max(ratio, 0.001), 1, 1]}
      >
        <planeGeometry args={[BAR_W, BAR_H]} />
        <meshBasicMaterial color="#3ecf3e" depthWrite={false} />
      </mesh>
    </Billboard>
  )
}
