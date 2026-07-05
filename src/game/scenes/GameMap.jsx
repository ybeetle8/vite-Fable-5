// 通用地图场景: 按 MAPS[mapId].theme 渲染地面/光照/装饰/传送门
// 装饰物几何体拼装, 障碍物数据来自 shared/obstacles.js(与碰撞一致)
import { useMemo } from 'react'
import { Sky, Text, Billboard } from '@react-three/drei'
import { MAPS } from '../../../shared/config.js'
import { OBSTACLES } from '../../../shared/obstacles.js'
import { NPCS } from '../gameData.js'
import Npc from '../entities/Npc.jsx'

// 各主题的环境参数
const THEMES = {
  town: {
    ground: '#8fb573', sky: [60, 40, 20], ambient: 0.75, sun: 1.6, fog: null,
  },
  plain: {
    ground: '#6aa84f', sky: [60, 40, 20], ambient: 0.7, sun: 1.6, fog: null,
  },
  forest: {
    ground: '#3f6b3f', sky: [30, 15, 10], ambient: 0.5, sun: 0.9,
    fog: { color: '#a8c8b8', near: 15, far: 60 },
  },
  cavern: {
    ground: '#5a5350', sky: null, ambient: 0.35, sun: 0.5,
    fog: { color: '#221d1a', near: 10, far: 45 }, bg: '#1a1512',
  },
  demon: {
    ground: '#4a2f3a', sky: null, ambient: 0.4, sun: 0.7, sunColor: '#ff6b4a',
    fog: { color: '#2a0f18', near: 12, far: 50 }, bg: '#1c0a10',
  },
}

/* ---------- 装饰物 ---------- */

function Tree({ x, z, dark }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2, 8]} />
        <meshStandardMaterial color={dark ? '#4a3520' : '#7a5230'} />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <coneGeometry args={[1.4, 2.4, 8]} />
        <meshStandardMaterial color={dark ? '#26472b' : '#3d8b3d'} />
      </mesh>
      <mesh position={[0, 3.8, 0]} castShadow>
        <coneGeometry args={[1.0, 1.8, 8]} />
        <meshStandardMaterial color={dark ? '#2f5735' : '#4a9e4a'} />
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

function Pillar({ x, z, r }) {
  return (
    <mesh position={[x, 3, z]} castShadow>
      <cylinderGeometry args={[r * 0.7, r, 6, 8]} />
      <meshStandardMaterial color="#6e635c" flatShading />
    </mesh>
  )
}

function Spike({ x, z, r }) {
  return (
    <mesh position={[x, 2, z]} castShadow>
      <coneGeometry args={[r, 4.5, 6]} />
      <meshStandardMaterial color="#3a2030" flatShading />
    </mesh>
  )
}

function House({ x, z, r }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[r * 1.8, 2.8, r * 1.8]} />
        <meshStandardMaterial color="#d9c8a9" />
      </mesh>
      <mesh position={[0, 3.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[r * 1.6, 1.8, 4]} />
        <meshStandardMaterial color="#a0522d" />
      </mesh>
      <mesh position={[0, 0.75, r * 0.91]}>
        <boxGeometry args={[0.8, 1.5, 0.05]} />
        <meshStandardMaterial color="#5c4326" />
      </mesh>
    </group>
  )
}

function Castle({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3, 0]} castShadow>
        <boxGeometry args={[9, 6, 6]} />
        <meshStandardMaterial color="#c9c9c9" />
      </mesh>
      {[-4, 4].map((tx) => (
        <group key={tx} position={[tx, 0, 2.5]}>
          <mesh position={[0, 4, 0]} castShadow>
            <cylinderGeometry args={[1.1, 1.1, 8, 10]} />
            <meshStandardMaterial color="#bdbdbd" />
          </mesh>
          <mesh position={[0, 8.8, 0]} castShadow>
            <coneGeometry args={[1.4, 1.8, 10]} />
            <meshStandardMaterial color="#3f5da8" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.25, 3.02]}>
        <boxGeometry args={[2, 2.5, 0.06]} />
        <meshStandardMaterial color="#4a3520" />
      </mesh>
    </group>
  )
}

function Fountain({ x, z, r }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[r, r, 0.6, 20]} />
        <meshStandardMaterial color="#9e9e9e" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[r * 0.75, r * 0.75, 0.1, 20]} />
        <meshStandardMaterial color="#5aa4d4" />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.25, 0.35, 1.0, 10]} />
        <meshStandardMaterial color="#9e9e9e" />
      </mesh>
    </group>
  )
}

function Throne({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[3, 3.5, 1, 8]} />
        <meshStandardMaterial color="#38202e" flatShading />
      </mesh>
      <mesh position={[0, 2, -1]} castShadow>
        <boxGeometry args={[1.6, 3, 0.6]} />
        <meshStandardMaterial color="#521f35" />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.6, 0.5, 1.4]} />
        <meshStandardMaterial color="#521f35" />
      </mesh>
    </group>
  )
}

const DECOR = {
  tree: (o, theme) => <Tree x={o.x} z={o.z} dark={theme === 'forest' || theme === 'demon'} />,
  rock: (o) => <Rock x={o.x} z={o.z} r={o.r} />,
  pillar: (o) => <Pillar x={o.x} z={o.z} r={o.r} />,
  spike: (o) => <Spike x={o.x} z={o.z} r={o.r} />,
  house: (o) => <House x={o.x} z={o.z} r={o.r} />,
  castle: (o) => <Castle x={o.x} z={o.z} />,
  fountain: (o) => <Fountain x={o.x} z={o.z} r={o.r} />,
  throne: (o) => <Throne x={o.x} z={o.z} />,
}

/* ---------- 传送门 ---------- */

function Portal({ portal }) {
  return (
    <group position={[portal.x, 0, portal.z]}>
      {/* 发光门圈 */}
      <mesh position={[0, 1.6, 0]}>
        <torusGeometry args={[1.5, 0.14, 12, 32]} />
        <meshStandardMaterial color="#6fd8ff" emissive="#2fa8e0" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <circleGeometry args={[1.36, 32]} />
        <meshBasicMaterial color="#bdeeff" transparent opacity={0.35} side={2} />
      </mesh>
      {/* 地面光圈 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2.2, 32]} />
        <meshBasicMaterial color="#6fd8ff" transparent opacity={0.5} />
      </mesh>
      <Billboard position={[0, 3.4, 0]}>
        <Text fontSize={0.42} color="#bdeeff" outlineWidth={0.03} outlineColor="#003a55">
          {portal.label}
        </Text>
      </Billboard>
    </group>
  )
}

/* ---------- 主组件 ---------- */

// 固定伪随机草丛(每张图种子不同)
function GrassPatches({ size, seedBase, color }) {
  const patches = useMemo(() => {
    const arr = []
    let seed = seedBase
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let i = 0; i < 100; i++) {
      arr.push({
        x: (rand() - 0.5) * (size - 10),
        z: (rand() - 0.5) * (size - 10),
        s: 0.3 + rand() * 0.5,
        rot: rand() * Math.PI,
      })
    }
    return arr
  }, [size, seedBase])
  return patches.map((p, i) => (
    <mesh key={i} position={[p.x, p.s * 0.5, p.z]} rotation={[0, p.rot, 0]}>
      <coneGeometry args={[p.s * 0.5, p.s, 4]} />
      <meshStandardMaterial color={color} />
    </mesh>
  ))
}

function BorderPosts({ size, color }) {
  const posts = useMemo(() => {
    const arr = []
    const half = size / 2
    for (let i = -half; i <= half; i += 5) {
      arr.push([i, half], [i, -half], [half, i], [-half, i])
    }
    return arr
  }, [size])
  return posts.map(([x, z], i) => (
    <mesh key={i} position={[x, 0.6, z]}>
      <boxGeometry args={[0.3, 1.2, 0.3]} />
      <meshStandardMaterial color={color} />
    </mesh>
  ))
}

export default function GameMap({ mapId }) {
  const map = MAPS[mapId]
  const theme = THEMES[map.theme]
  const obstacles = OBSTACLES[mapId] ?? []
  const seedBase = mapId.length * 1000 + map.size

  return (
    <>
      {theme.bg && <color attach="background" args={[theme.bg]} />}
      {theme.fog && <fog attach="fog" args={[theme.fog.color, theme.fog.near, theme.fog.far]} />}
      {theme.sky && <Sky sunPosition={theme.sky} turbidity={6} />}
      <ambientLight intensity={theme.ambient} />
      <directionalLight
        position={[40, 60, 20]}
        intensity={theme.sun}
        color={theme.sunColor ?? '#ffffff'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[map.size, map.size]} />
        <meshStandardMaterial color={theme.ground} />
      </mesh>

      {/* 出生点石板 */}
      <mesh position={[map.spawn.x, 0.01, map.spawn.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.5, 32]} />
        <meshStandardMaterial color="#b7b7a4" />
      </mesh>
      {/* 局部安全区边界圈 */}
      {map.safeRadius && (
        <mesh position={[map.spawn.x, 0.02, map.spawn.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[map.safeRadius - 0.15, map.safeRadius, 64]} />
          <meshBasicMaterial color="#ffe08a" transparent opacity={0.55} />
        </mesh>
      )}

      {/* 障碍装饰物 */}
      {obstacles.map((o, i) => (
        <group key={i}>{DECOR[o.type]?.(o, map.theme)}</group>
      ))}

      {/* 草丛(洞窟/魔王城不长草) */}
      {(map.theme === 'town' || map.theme === 'plain' || map.theme === 'forest') && (
        <GrassPatches
          size={map.size}
          seedBase={seedBase}
          color={map.theme === 'forest' ? '#3f7a48' : '#5cab5c'}
        />
      )}

      <BorderPosts size={map.size} color={map.theme === 'demon' ? '#3a2030' : '#9c7b4f'} />

      {/* 传送门 */}
      {(map.portals ?? []).map((pt, i) => (
        <Portal key={i} portal={pt} />
      ))}

      {/* NPC(M9) */}
      {Object.values(NPCS)
        .filter((n) => n.map === mapId)
        .map((n) => (
          <Npc key={n.id} npc={n} />
        ))}
    </>
  )
}
