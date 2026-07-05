// 世界管理(M5): 权威移动 + 怪物 AI + 战斗结算 + 经验升级 + 死亡复活
// M8: 技能施放 + Buff + 装备与掉落
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
import {
  ITEMS, EQUIP_SLOTS, INVENTORY_CAP, ensureEquipment, equipmentBonus, rollDrops,
} from '../systems/items.js'
import { SKILLS, handleCastSkill, cancelCast, tickCasting } from '../systems/skills.js'
import { handleShopBuy, handleShopSell, handleInnRest } from '../systems/npcs.js'
import {
  ensureQuests, pushQuests, handleQuestAccept, handleQuestComplete, onMonsterKilled,
} from '../systems/quests.js'

// username -> player 运行时实体
const online = new Map()
let ioRef = null

const RESPAWN_DELAY = 3 // 玩家死亡后复活秒数

// 全局属性口径: 基础(等级) + 装备加成 + Buff 加成
function playerStats(p) {
  const s = { ...statsForLevel(p.character.classId, p.character.level) }
  const bonus = equipmentBonus(p.character.equipment)
  s.atk += bonus.atk
  s.def += bonus.def
  if (p.buffs?.blessing) {
    s.atk = Math.floor(s.atk * SKILLS.blessing.buff.atkMul)
  }
  return s
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
    buffs: Object.keys(p.buffs ?? {}),
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
    buffs: Object.entries(p.buffs ?? {}).map(([id, b]) => ({ id, remain: b.remain })),
    equipment: p.character.equipment,
  })
}

// 把玩家移到指定地图指定位置: 换 Room + 双向 enter/leave + 下发新图状态
function movePlayerToMap(p, mapId, x, z) {
  const oldMap = p.character.map
  cancelCast(p)
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

  // 老角色兼容: 无装备字段则补发职业初始装备; 无任务字段则补空结构
  const needSaveEquip = ensureEquipment(character)
  const needSaveQuests = ensureQuests(character)
  if (needSaveEquip || needSaveQuests) {
    saveCharacter(username, {
      equipment: character.equipment,
      inventory: character.inventory,
      quests: character.quests,
    })
  }

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
    buffs: {},           // { blessing: { remain } }
    skillReadyAt: {},    // skillId -> 冷却结束时间戳(ms)
    casting: null,       // { skillId, targetId, remain }
    mpRegenAcc: 0,       // MP 自然回复累计器(秒)
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
  pushInventory(player)
  pushQuests(player)
  socket.to(character.map).emit(EVT.ENTITY_ENTER, publicState(player))
  console.log(`[world] ${character.nickname} 进入世界 (在线 ${online.size})`)

  // 移动意图
  socket.on(EVT.MOVE, (data) => {
    if (player.character.hp <= 0) return // 死亡不能动
    player.dir = sanitizeDir(data?.dx, data?.dz)
    player.moving = player.dir.x !== 0 || player.dir.z !== 0
    if (player.moving) cancelCast(player) // 移动打断吟唱
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

  // 技能施放(M8): 校验/吟唱/结算全在 systems/skills.js
  socket.on(EVT.CAST_SKILL, (data) => {
    handleCastSkill(skillCtx, player, data)
  })

  // 穿戴装备: 从背包穿上, 同槽旧件回背包
  socket.on(EVT.EQUIP_ITEM, (data) => {
    const item = ITEMS[data?.itemId]
    const inv = player.character.inventory
    const idx = inv.indexOf(data?.itemId)
    if (!item || idx === -1) return
    if (!item.classes.includes(player.character.classId)) return

    inv.splice(idx, 1)
    const old = player.character.equipment[item.slot]
    if (old) inv.push(old)
    player.character.equipment[item.slot] = item.id

    pushSelfUpdate(player)
    pushInventory(player)
    saveCharacter(username, snapshotForSave(player))
  })

  // 卸下装备到背包
  socket.on(EVT.UNEQUIP_ITEM, (data) => {
    const slot = data?.slot
    if (!EQUIP_SLOTS.includes(slot)) return
    const itemId = player.character.equipment[slot]
    if (!itemId || player.character.inventory.length >= INVENTORY_CAP) return

    player.character.equipment[slot] = null
    player.character.inventory.push(itemId)

    pushSelfUpdate(player)
    pushInventory(player)
    saveCharacter(username, snapshotForSave(player))
  })

  // NPC 交互(M9): 任务接取/交付、商店买卖、旅馆休息, 校验全在 systems/
  socket.on(EVT.QUEST_ACCEPT, (data) => {
    if (player.character.hp <= 0) return
    handleQuestAccept(npcCtx, player, data)
  })
  socket.on(EVT.QUEST_COMPLETE, (data) => {
    if (player.character.hp <= 0) return
    handleQuestComplete(npcCtx, player, data)
    saveCharacter(username, snapshotForSave(player))
  })
  socket.on(EVT.SHOP_BUY, (data) => {
    if (player.character.hp <= 0) return
    handleShopBuy(npcCtx, player, data)
    saveCharacter(username, snapshotForSave(player))
  })
  socket.on(EVT.SHOP_SELL, (data) => {
    if (player.character.hp <= 0) return
    handleShopSell(npcCtx, player, data)
    saveCharacter(username, snapshotForSave(player))
  })
  socket.on(EVT.INN_REST, (data) => {
    if (player.character.hp <= 0) return
    handleInnRest(npcCtx, player, data)
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
    equipment: p.character.equipment,
    inventory: p.character.inventory,
    quests: p.character.quests,
  }
}

// 推送装备与背包全量状态; gained 为本次新获得的装备(掉落提示)
function pushInventory(p, extra = {}) {
  p.socket.emit(EVT.INVENTORY_UPDATE, {
    equipment: p.character.equipment,
    inventory: p.character.inventory,
    ...extra,
  })
}

// 注入 systems/skills.js 的世界能力
const skillCtx = {
  get io() {
    return ioRef
  },
  playersInMap,
  playerStats,
  grantReward,
  pushSelfUpdate,
}

// 注入 systems/npcs.js 与 quests.js 的世界能力
const npcCtx = {
  playerStats,
  pushSelfUpdate,
  pushInventory,
  gainExpGold,
}

// 经验金币入账 + 升级(可连升, 回满并广播), 击杀奖励与任务奖励共用
function gainExpGold(p, exp, gold) {
  p.character.exp += exp
  p.character.gold += gold

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

// 击杀奖励: 经验 + 金币 + 概率掉落装备 + 任务进度
function grantReward(p, monsterCfg) {
  // 装备掉落(M8): 直接进入装备列表, 背包满则仅提示
  const itemId = rollDrops(monsterCfg.id, p.character.classId)
  if (itemId) {
    if (p.character.inventory.length >= INVENTORY_CAP) {
      pushInventory(p, { full: true })
    } else {
      p.character.inventory.push(itemId)
      pushInventory(p, { gained: itemId, gainedFrom: monsterCfg.name })
      console.log(`[world] ${p.character.nickname} 获得掉落: ${ITEMS[itemId].name}`)
    }
  }

  gainExpGold(p, monsterCfg.exp, monsterCfg.gold)
  onMonsterKilled(p, monsterCfg) // 任务击杀/收集进度(M9)
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
    cancelCast(target)
    target.buffs = {}
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

    // Buff 计时递减, 到期移除并同步属性
    for (const id of Object.keys(p.buffs)) {
      p.buffs[id].remain -= delta
      if (p.buffs[id].remain <= 0) {
        delete p.buffs[id]
        pushSelfUpdate(p)
      }
    }

    // 死亡倒计时复活
    if (p.character.hp <= 0) {
      p.respawnTimer -= delta
      if (p.respawnTimer <= 0) respawnPlayer(p)
      continue
    }

    // 吟唱进度, 归零结算
    tickCasting(skillCtx, p, delta)

    // MP 自然回复: 每满 1 秒回 1 + 2% maxMp
    const maxMp = playerStats(p).maxMp
    if (p.character.mp < maxMp) {
      p.mpRegenAcc += delta
      if (p.mpRegenAcc >= 1) {
        p.mpRegenAcc -= 1
        p.character.mp = Math.min(maxMp, p.character.mp + 1 + Math.ceil(maxMp * 0.02))
        pushSelfUpdate(p)
      }
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
