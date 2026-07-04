// 移动积分逻辑, 前后端共享:
// 服务器每 Tick 权威计算, 客户端用同一函数做本地预测, 保证结果一致
import { OBSTACLES } from './obstacles.js'

const PLAYER_RADIUS = 0.5

// pos: {x,z}  dir: {x,z}(单位向量或零向量)  返回新位置 {x,z}
export function stepPosition(pos, dir, spd, delta, mapId, mapSize) {
  let x = pos.x + dir.x * spd * delta
  let z = pos.z + dir.z * spd * delta

  // 地图边界钳制(留 1 米内边距)
  const half = mapSize / 2 - 1
  x = Math.max(-half, Math.min(half, x))
  z = Math.max(-half, Math.min(half, z))

  // 圆形障碍推出重叠
  for (const ob of OBSTACLES[mapId] ?? []) {
    const dx = x - ob.x
    const dz = z - ob.z
    const distSq = dx * dx + dz * dz
    const minDist = ob.r + PLAYER_RADIUS
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const d = Math.sqrt(distSq)
      x = ob.x + (dx / d) * minDist
      z = ob.z + (dz / d) * minDist
    }
  }

  return { x, z }
}

// 归一化输入方向: 非法输入返回零向量, 模长超 1 时压回单位圆
export function sanitizeDir(dx, dz) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return { x: 0, z: 0 }
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return { x: 0, z: 0 }
  if (len > 1) return { x: dx / len, z: dz / len }
  return { x: dx, z: dz }
}
