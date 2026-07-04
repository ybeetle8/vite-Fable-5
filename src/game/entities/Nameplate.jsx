// 头顶昵称/等级/血条(Billboard 朝向镜头)
import { Billboard, Text } from '@react-three/drei'

const BAR_W = 1.2
const BAR_H = 0.12

export default function Nameplate({ nickname, level, hp, maxHp, color = '#ffffff', height = 2.3 }) {
  const ratio = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 1))
  const label = level != null && level !== '' ? `Lv.${level} ${nickname}` : nickname
  return (
    <Billboard position={[0, height, 0]}>
      <Text
        fontSize={0.28}
        color={color}
        outlineWidth={0.02}
        outlineColor="#000000"
        anchorY="bottom"
        position={[0, 0.12, 0]}
      >
        {label}
      </Text>
      {/* 血条底 */}
      <mesh>
        <planeGeometry args={[BAR_W, BAR_H]} />
        <meshBasicMaterial color="#222222" depthWrite={false} />
      </mesh>
      {/* 血条填充: 左对齐缩放 */}
      <mesh position={[(-BAR_W * (1 - ratio)) / 2, 0, 0.001]} scale={[Math.max(ratio, 0.001), 1, 1]}>
        <planeGeometry args={[BAR_W, BAR_H]} />
        <meshBasicMaterial color="#3ecf3e" depthWrite={false} />
      </mesh>
    </Billboard>
  )
}
