// 起始平原场景: 地面/光照/天空/装饰/边界
// 装饰物用低成本几何体拼装(树/石头), 后续可替换为 GLB 场景件
import { useMemo } from 'react'
import { Sky } from '@react-three/drei'
import { MAPS } from '../../../shared/config.js'
import { OBSTACLES } from './obstacles.js'

const SIZE = MAPS.novice_plain.size

function Tree({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2, 8]} />
        <meshStandardMaterial color="#7a5230" />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <coneGeometry args={[1.4, 2.4, 8]} />
        <meshStandardMaterial color="#3d8b3d" />
      </mesh>
      <mesh position={[0, 3.8, 0]} castShadow>
        <coneGeometry args={[1.0, 1.8, 8]} />
        <meshStandardMaterial color="#4a9e4a" />
      </mesh>
    </group>
  )
}

function Rock({ x, z, r }) {
  return (
    <mesh position={[x, r * 0.4, z]} castShadow>
      <dodecahedronGeometry args={[r, 0]} />
      <meshStandardMaterial color="#8a8a86" flatShading />
    </mesh>
  )
}

// 地图四周的围栏桩, 提示边界
function BorderPosts() {
  const posts = useMemo(() => {
    const arr = []
    const half = SIZE / 2
    for (let i = -half; i <= half; i += 5) {
      arr.push([i, half], [i, -half], [half, i], [-half, i])
    }
    return arr
  }, [])
  return posts.map(([x, z], i) => (
    <mesh key={i} position={[x, 0.6, z]}>
      <boxGeometry args={[0.3, 1.2, 0.3]} />
      <meshStandardMaterial color="#9c7b4f" />
    </mesh>
  ))
}

// 散布草丛点缀
function GrassPatches() {
  const patches = useMemo(() => {
    const arr = []
    // 固定伪随机(线性同余), 每次渲染一致
    let seed = 42
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let i = 0; i < 120; i++) {
      arr.push({
        x: (rand() - 0.5) * (SIZE - 10),
        z: (rand() - 0.5) * (SIZE - 10),
        s: 0.3 + rand() * 0.5,
        rot: rand() * Math.PI,
      })
    }
    return arr
  }, [])
  return patches.map((p, i) => (
    <mesh key={i} position={[p.x, p.s * 0.5, p.z]} rotation={[0, p.rot, 0]}>
      <coneGeometry args={[p.s * 0.5, p.s, 4]} />
      <meshStandardMaterial color="#5cab5c" />
    </mesh>
  ))
}

export default function NovicePlain() {
  return (
    <>
      <Sky sunPosition={[60, 40, 20]} turbidity={6} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[40, 60, 20]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color="#6aa84f" />
      </mesh>
      {/* 出生点石板 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.5, 32]} />
        <meshStandardMaterial color="#b7b7a4" />
      </mesh>

      {OBSTACLES.filter((o) => o.type === 'tree').map((o, i) => (
        <Tree key={`t${i}`} x={o.x} z={o.z} />
      ))}
      {OBSTACLES.filter((o) => o.type === 'rock').map((o, i) => (
        <Rock key={`r${i}`} x={o.x} z={o.z} r={o.r} />
      ))}
      <BorderPosts />
      <GrassPatches />
    </>
  )
}
