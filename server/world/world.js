// 世界管理(M5): 权威移动 + 怪物 AI + 战斗结算 + 经验升级 + 死亡复活
import { EVT, TICK_RATE } from '../../shared/events.js'
import {
  MAPS, CLASSES, statsForLevel, expToNext, RESPAWN_MAP, PORTAL_RANGE,
} from '../../shared/config.js'
import { stepPosition, sanitizeDir } from '../../shared/movement.js'
import { ATTACK_RANGE, ATTACK_COOLDOWN, computeDamage } from '../../shared/combat.js'
import { saveCharacter } from '../auth/accounts.js'
import {
  getMonsters, findMonster, monsterPublicState, updateMonsters, damageMonster,
} from '../systems/monsters.js'

// username -> player 运行时实体
const online = new Map()
let ioRef = null

const RESPAWN_DELAY = 3 // 玩家死亡后复活秒数

function playerStats(p) {
  return statsForLevel(p.character.classId, p.character.level)
}

function publicState(p) {
  return {
    id: p.username,
    nickname: p.character.nickname,
    classId: p.character.classId,
    level: p.character.level,
    x: p.character.pos.x,
    z: p.character.pos.z,
    facing: p.facing,
    moving: p.moving,
    hp: p.character.hp,
    maxHp: playerStats(p).maxHp,
    dead: p.character.hp <= 0,
  }
}

// 推送自身完整属性(HP/MP/经验/金币/等级)
function pushSelfUpdate(p) {
  const stats = playerStats(p)
  p.socket.emit(EVT.PLAYER_UPDATE, {
    level: p.character.level,
    exp: p.character.exp,
    expNext: expToNext(p.character.level),
    gold: p.character.gold,
    hp: p.character.hp,
    mp: p.character.mp,
    maxHp: stats.maxHp,
    maxMp: stats.maxMp,
    atk: stats.atk,
    def: stats.def,
  })
}

// 把玩家移到指定地图指定位置: 换 Room + 双向 enter/leave + 下发新图状态
function movePlayerToMap(p, mapId, x, z) {
  const oldMap = p.character.map
  p.moving = false
  p.dir = { x: 0, z: 0 }
  p.character.map = mapId
  p.character.pos = { x, z }

  if (oldMap !== mapId) {
    p.socket.leave(oldMap)
    ioRef.to(oldMap).emit(EVT.ENTITY_LEAVE, { id: p.username })
    p.socket.join(mapId)
  }
  p.socket.emit(EVT.MAP_CHANGED, {
    map: mapId,
    x,
    z,
    players: playersInMap(mapId)
      .filter((o) => o.username !== p.username)
      .map(publicState),
    monsters: getMonsters(mapId).map(monsterPublicState),
  })
  if (oldMap !== mapId) {
    p.socket.to(mapId).emit(EVT.ENTITY_ENTER, publicState(p))
  }
  saveCharacter(p.username, snapshotForSave(p))
}

export function onPlayerConnect(io, socket, username, character) {
  ioRef = io

  // 顶号: 同账号旧连接踢下线
  const prev = online.get(username)
  if (prev) {
    prev.socket.emit(EVT.KICKED, { reason: '账号在其他地方登录' })
    prev.socket.disconnect(true)
    online.delete(username)
  }

  const player = {
    username,
    socket,
    character,
    dir: { x: 0, z: 0 },
    facing: 0,
    moving: false,
    attackTimer: 0,
    respawnTimer: 0,
  }
  online.set(username, player)
  socket.join(character.map)

  socket.emit(EVT.WELCOME, {
    selfId: username,
    character,
    online: online.size,
    players: playersInMap(character.map)
      .filter((p) => p.username !== username)
      .map(publicState),
    monsters: getMonsters(character.map).map(monsterPublicState),
  })
  pushSelfUpdate(player)
  socket.to(character.map).emit(EVT.ENTITY_ENTER, publicState(player))
  console.log(`[world] ${character.nickname} 进入世界 (在线 ${online.size})`)

  // 移动意图
  socket.on(EVT.MOVE, (data) => {
    if (player.character.hp <= 0) return // 死亡不能动
    player.dir = sanitizeDir(data?.dx, data?.dz)
    player.moving = player.dir.x !== 0 || player.dir.z !== 0
    if (Number.isFinite(data?.facing)) player.facing = data.facing
  })

  // 普攻: 服务器校验冷却/距离/存活后结算
  socket.on(EVT.ATTACK, (data) => {
    if (player.character.hp <= 0) return
    if (player.attackTimer > 0) return
    const m = findMonster(player.character.map, data?.targetId)
    if (!m || m.state === 'dead') return
    const d = Math.hypot(m.pos.x - player.character.pos.x, m.pos.z - player.character.pos.z)
    if (d > ATTACK_RANGE + 0.5) return // 距离容差 0.5 抵消延迟

    player.attackTimer = ATTACK_COOLDOWN
    const { dmg, killed } = damageMonster(m, playerStats(player).atk)
    if (m.state === 'chase' && !m.target) m.target = username // 被打立即仇恨

    io.to(player.character.map).emit(EVT.COMBAT_RESULT, {
      kind: 'player_hit_monster',
      attackerId: username,
      targetId: m.id,
      dmg,
      hp: m.hp,
      killed,
    })

    if (killed) {
      grantReward(player, m.cfg)
    }
  })

  // 传送切图: 校验玩家在传送点附近
  socket.on(EVT.CHANGE_MAP, () => {
    if (player.character.hp <= 0) return
    const map = MAPS[player.character.map]
    const portal = (map.portals ?? []).find(
      (pt) =>
        Math.hypot(pt.x - player.character.pos.x, pt.z - player.character.pos.z) <
        PORTAL_RANGE + 0.5,
    )
    if (!portal || !MAPS[portal.to]) return
    movePlayerToMap(player, portal.to, portal.tx, portal.tz)
    console.log(`[world] ${character.nickname} 传送: ${map.name} -> ${MAPS[portal.to].name}`)
  })

  // 世界聊天: 长度/频率限制
  socket.on(EVT.CHAT, (data) => {
    const text = typeof data?.text === 'string' ? data.text.trim() : ''
    if (!text || text.length > 100) return
    const now = Date.now()
    // 限频: 1 秒内最多 2 条
    player.chatTimes = (player.chatTimes ?? []).filter((t) => now - t < 1000)
    if (player.chatTimes.length >= 2) return
    player.chatTimes.push(now)

    io.emit(EVT.CHAT_BROADCAST, {
      from: character.nickname,
      level: character.level,
      text,
      t: now,
    })
  })

  socket.on('disconnect', () => {
    if (online.get(username)?.socket !== socket) return
    online.delete(username)
    saveCharacter(username, snapshotForSave(player))
    io.to(character.map).emit(EVT.ENTITY_LEAVE, { id: username })
    console.log(`[world] ${character.nickname} 离开世界 (在线 ${online.size})`)
  })
}

function snapshotForSave(p) {
  return {
    pos: p.character.pos,
    map: p.character.map,
    level: p.character.level,
    exp: p.character.exp,
    gold: p.character.gold,
    hp: p.character.hp,
    mp: p.character.mp,
  }
}

// 击杀奖励: 经验 + 金币, 处理升级(可连升)
function grantReward(p, monsterCfg) {
  p.character.exp += monsterCfg.exp
  p.character.gold += monsterCfg.gold

  let leveled = false
  while (p.character.exp >= expToNext(p.character.level)) {
    p.character.exp -= expToNext(p.character.level)
    p.character.level += 1
    leveled = true
  }
  if (leveled) {
    // 升级回满
    const stats = playerStats(p)
    p.character.hp = stats.maxHp
    p.character.mp = stats.maxMp
    ioRef.to(p.character.map).emit(EVT.COMBAT_RESULT, {
      kind: 'level_up',
      playerId: p.username,
      level: p.character.level,
    })
    console.log(`[world] ${p.character.nickname} 升到 ${p.character.level} 级`)
  }
  pushSelfUpdate(p)
}

// 怪物攻击玩家结算
function resolveMonsterAttack(m, target) {
  const stats = playerStats(target)
  const dmg = computeDamage(m.cfg.atk, stats.def)
  target.character.hp = Math.max(0, target.character.hp - dmg)
  const killed = target.character.hp === 0

  ioRef.to(target.character.map).emit(EVT.COMBAT_RESULT, {
    kind: 'monster_hit_player',
    attackerId: m.id,
    targetId: target.username,
    dmg,
    hp: target.character.hp,
    killed,
  })
  pushSelfUpdate(target)

  if (killed) {
    target.moving = false
    target.dir = { x: 0, z: 0 }
    target.respawnTimer = RESPAWN_DELAY
    console.log(`[world] ${target.character.nickname} 被 ${m.cfg.name} 击倒`)
  }
}

// 玩家复活: 回王城(教会)满状态, 跨图死亡会切图
function respawnPlayer(p) {
  const stats = playerStats(p)
  p.character.hp = stats.maxHp
  p.character.mp = stats.maxMp
  const spawn = MAPS[RESPAWN_MAP].spawn
  const sameMap = p.character.map === RESPAWN_MAP
  ioRef.to(p.character.map).emit(EVT.COMBAT_RESULT, {
    kind: 'player_respawn',
    playerId: p.username,
    x: spawn.x,
    z: spawn.z,
  })
  if (sameMap) {
    p.character.pos = { ...spawn }
  } else {
    movePlayerToMap(p, RESPAWN_MAP, spawn.x, spawn.z)
  }
  pushSelfUpdate(p)
}

function playersInMap(mapId) {
  return [...online.values()].filter((p) => p.character.map === mapId)
}

// ---------- Tick 循环 ----------
const TICK_MS = 1000 / TICK_RATE
let lastTick = Date.now()

setInterval(() => {
  const now = Date.now()
  const delta = Math.min((now - lastTick) / 1000, 0.25)
  lastTick = now

  for (const p of online.values()) {
    p.attackTimer = Math.max(0, p.attackTimer - delta)

    // 死亡倒计时复活
    if (p.character.hp <= 0) {
      p.respawnTimer -= delta
      if (p.respawnTimer <= 0) respawnPlayer(p)
      continue
    }

    // 权威移动积分
    if (p.moving) {
      const map = MAPS[p.character.map]
      const spd = CLASSES[p.character.classId].base.spd
      p.character.pos = stepPosition(
        p.character.pos, p.dir, spd, delta, p.character.map, map.size,
      )
    }
  }

  if (!ioRef) return
  for (const mapId of Object.keys(MAPS)) {
    const players = playersInMap(mapId)
    // 无人地图跳过 AI 与广播, 省 CPU
    if (players.length === 0) continue

    // 怪物 AI
    const events = updateMonsters(mapId, players, delta)
    for (const ev of events) {
      if (ev.kind === 'monster_attack') {
        resolveMonsterAttack(ev.monster, ev.targetPlayer)
      }
      // respawn 通过快照的 dead 状态变化自然同步, 无需单独事件
    }

    // 广播快照(玩家 + 怪物)
    ioRef.to(mapId).emit(EVT.WORLD_SNAPSHOT, {
      t: now,
      players: players.map(publicState),
      monsters: getMonsters(mapId).map(monsterPublicState),
    })
  }
}, TICK_MS)

// 定时存档
setInterval(() => {
  for (const [username, p] of online) {
    saveCharacter(username, snapshotForSave(p))
  }
}, 60_000)
