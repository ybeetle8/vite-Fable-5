// 怪物系统: AI 状态机(idle/patrol/chase/attack/return) + 重生
// 由 world.js 的 Tick 循环驱动
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeDamage } from '../../shared/combat.js'
import { stepPosition } from '../../shared/movement.js'
import { MAPS } from '../../shared/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MONSTERS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/monsters.json'), 'utf-8'))
const SPAWNS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/spawns.json'), 'utf-8'))

// mapId -> Monster[]
const monstersByMap = new Map()
let nextId = 1

function createMonster(mapId, spawn) {
  const cfg = MONSTERS[spawn.type]
  return {
    id: `m${nextId++}`,
    type: spawn.type,
    cfg,
    mapId,
    home: { x: spawn.x, z: spawn.z },
    pos: { x: spawn.x, z: spawn.z },
    facing: 0,
    hp: cfg.maxHp,
    state: 'idle',        // idle | patrol | chase | attack | return | dead
    target: null,          // 追击中的玩家 username
    attackTimer: 0,        // 攻击冷却计时
    stateTimer: 2 + Math.random() * 3, // idle/patrol 切换计时
    patrolDir: { x: 0, z: 0 },
    respawnTimer: 0,
    moving: false,
    debuffs: {},           // 减益: { slow: { remain, factor } }
  }
}

// 初始化所有地图的怪物
for (const [mapId, spawns] of Object.entries(SPAWNS)) {
  monstersByMap.set(mapId, spawns.map((s) => createMonster(mapId, s)))
}

export function getMonsters(mapId) {
  return monstersByMap.get(mapId) ?? []
}

export function findMonster(mapId, id) {
  return getMonsters(mapId).find((m) => m.id === id)
}

export function monsterPublicState(m) {
  return {
    id: m.id,
    type: m.type,
    name: m.cfg.name,
    x: m.pos.x,
    z: m.pos.z,
    facing: m.facing,
    moving: m.moving,
    hp: m.hp,
    maxHp: m.cfg.maxHp,
    dead: m.state === 'dead',
    slowed: !!m.debuffs.slow,
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// 玩家是否处于安全状态(全图安全 或 出生点安全区内)
function inSafeZone(mapId, pos) {
  const map = MAPS[mapId]
  if (map.safe) return true
  if (!map.safeRadius) return false
  return dist(pos, map.spawn) < map.safeRadius
}

// 每 Tick 更新一张地图的怪物; players: 该图在线玩家实体数组
// 返回本 Tick 产生的战斗事件(怪物攻击玩家), 由调用方广播
export function updateMonsters(mapId, players, delta) {
  const events = []
  const mapSize = MAPS[mapId].size

  for (const m of getMonsters(mapId)) {
    if (m.state === 'dead') {
      m.respawnTimer -= delta
      if (m.respawnTimer <= 0) {
        // 重生
        m.hp = m.cfg.maxHp
        m.pos = { ...m.home }
        m.state = 'idle'
        m.target = null
        m.debuffs = {}
        m.stateTimer = 2 + Math.random() * 3
        events.push({ kind: 'respawn', monster: monsterPublicState(m) })
      }
      continue
    }

    m.attackTimer = Math.max(0, m.attackTimer - delta)
    m.moving = false

    // Debuff 计时递减, 到期移除
    for (const key of Object.keys(m.debuffs)) {
      m.debuffs[key].remain -= delta
      if (m.debuffs[key].remain <= 0) delete m.debuffs[key]
    }
    const spdMul = m.debuffs.slow?.factor ?? 1

    // 索敌: 找 aggro 范围内最近的活玩家(安全区内玩家不被索敌)
    if (m.state === 'idle' || m.state === 'patrol') {
      let nearest = null
      let nearestD = m.cfg.aggroRange
      for (const p of players) {
        if (p.character.hp <= 0) continue
        if (inSafeZone(mapId, p.character.pos)) continue
        const d = dist(m.pos, p.character.pos)
        if (d < nearestD) {
          nearest = p
          nearestD = d
        }
      }
      if (nearest) {
        m.state = 'chase'
        m.target = nearest.username
      }
    }

    switch (m.state) {
      case 'idle': {
        m.stateTimer -= delta
        if (m.stateTimer <= 0) {
          m.state = 'patrol'
          m.stateTimer = 1.5 + Math.random() * 2
          const ang = Math.random() * Math.PI * 2
          m.patrolDir = { x: Math.sin(ang), z: Math.cos(ang) }
        }
        break
      }

      case 'patrol': {
        m.stateTimer -= delta
        // 巡逻不离家超过 5 米
        if (dist(m.pos, m.home) > 5) {
          const dx = m.home.x - m.pos.x
          const dz = m.home.z - m.pos.z
          const len = Math.hypot(dx, dz)
          m.patrolDir = { x: dx / len, z: dz / len }
        }
        m.pos = stepPosition(m.pos, m.patrolDir, m.cfg.spd * 0.5 * spdMul, delta, mapId, mapSize)
        m.facing = Math.atan2(m.patrolDir.x, m.patrolDir.z)
        m.moving = true
        if (m.stateTimer <= 0) {
          m.state = 'idle'
          m.stateTimer = 2 + Math.random() * 3
        }
        break
      }

      case 'chase': {
        const target = players.find((p) => p.username === m.target)
        // 目标消失/死亡/超出脱战范围/躲进安全区 -> 回归
        if (
          !target ||
          target.character.hp <= 0 ||
          dist(m.pos, m.home) > m.cfg.leashRange ||
          inSafeZone(mapId, target.character.pos)
        ) {
          m.state = 'return'
          m.target = null
          break
        }
        const d = dist(m.pos, target.character.pos)
        if (d <= m.cfg.attackRange) {
          m.state = 'attack'
          break
        }
        const dx = target.character.pos.x - m.pos.x
        const dz = target.character.pos.z - m.pos.z
        const dir = { x: dx / d, z: dz / d }
        m.pos = stepPosition(m.pos, dir, m.cfg.spd * spdMul, delta, mapId, mapSize)
        m.facing = Math.atan2(dir.x, dir.z)
        m.moving = true
        break
      }

      case 'attack': {
        const target = players.find((p) => p.username === m.target)
        if (!target || target.character.hp <= 0 || inSafeZone(mapId, target.character.pos)) {
          m.state = 'return'
          m.target = null
          break
        }
        const d = dist(m.pos, target.character.pos)
        if (d > m.cfg.attackRange * 1.2) {
          m.state = 'chase'
          break
        }
        m.facing = Math.atan2(
          target.character.pos.x - m.pos.x,
          target.character.pos.z - m.pos.z,
        )
        if (m.attackTimer <= 0) {
          m.attackTimer = m.cfg.attackCooldown
          events.push({ kind: 'monster_attack', monster: m, targetPlayer: target })
        }
        break
      }

      case 'return': {
        const d = dist(m.pos, m.home)
        if (d < 0.5) {
          m.state = 'idle'
          m.stateTimer = 2 + Math.random() * 3
          m.hp = m.cfg.maxHp // 脱战回血(经典 MMO 规则)
          break
        }
        const dir = { x: (m.home.x - m.pos.x) / d, z: (m.home.z - m.pos.z) / d }
        m.pos = stepPosition(m.pos, dir, m.cfg.spd * 1.5 * spdMul, delta, mapId, mapSize)
        m.facing = Math.atan2(dir.x, dir.z)
        m.moving = true
        break
      }
    }
  }

  return events
}

// 玩家攻击怪物, 返回结算结果; 击杀时标记 dead 并启动重生计时
export function damageMonster(m, atk) {
  const dmg = computeDamage(atk, m.cfg.def)
  m.hp = Math.max(0, m.hp - dmg)
  const killed = m.hp === 0
  if (killed) {
    m.state = 'dead'
    m.target = null
    m.respawnTimer = m.cfg.respawnSec
  } else if (m.state === 'idle' || m.state === 'patrol' || m.state === 'return') {
    // 被打立即仇恨(由调用方设置 target)
    m.state = 'chase'
  }
  return { dmg, killed }
}
