// 世界状态存储(非 React state, 供 useFrame 每帧读取):
// - 远程玩家/怪物快照缓冲(用于插值)
// - 自身服务器权威位置与属性
// - 战斗事件(飘字/受击闪红等一次性表现)
const remotes = new Map()  // id -> { info, buffer }
const monsters = new Map() // id -> { info, buffer }
let selfServerPos = null
let selfId = null
let selfStats = null       // player_update 推送的自身属性
const entityListeners = new Set() // 实体增删
const statsListeners = new Set()  // 自身属性变化
const combatListeners = new Set() // 战斗事件(每条转发)

const BUFFER_MAX = 10

function pushBuffer(map, p, t) {
  let e = map.get(p.id)
  let created = false
  if (!e) {
    e = { info: p, buffer: [] }
    map.set(p.id, e)
    created = true
  }
  e.info = p
  e.buffer.push({ t, x: p.x, z: p.z, facing: p.facing, moving: p.moving })
  if (e.buffer.length > BUFFER_MAX) e.buffer.shift()
  return created
}

export const worldStore = {
  setSelfId(id) {
    selfId = id
  },

  applySnapshot(snap) {
    let changed = false
    for (const p of snap.players) {
      if (p.id === selfId) {
        selfServerPos = { t: snap.t, x: p.x, z: p.z, dead: p.dead }
        continue
      }
      if (pushBuffer(remotes, p, snap.t)) changed = true
    }
    const seen = new Set()
    for (const m of snap.monsters ?? []) {
      seen.add(m.id)
      if (pushBuffer(monsters, m, snap.t)) changed = true
    }
    // 快照中消失的怪物(不应发生, 防御性清理)
    if (snap.monsters) {
      for (const id of monsters.keys()) {
        if (!seen.has(id)) {
          monsters.delete(id)
          changed = true
        }
      }
    }
    if (changed) notify(entityListeners)
  },

  addRemote(p) {
    if (p.id === selfId || remotes.has(p.id)) return
    remotes.set(p.id, {
      info: p,
      buffer: [{ t: Date.now(), x: p.x, z: p.z, facing: p.facing, moving: false }],
    })
    notify(entityListeners)
  },

  removeRemote(id) {
    if (remotes.delete(id)) notify(entityListeners)
  },

  setInitialMonsters(list) {
    monsters.clear()
    const t = Date.now()
    for (const m of list) pushBuffer(monsters, m, t)
    notify(entityListeners)
  },

  // 切图: 清空旧图实体并装入新图初始状态
  resetEntities(playerList, monsterList) {
    remotes.clear()
    monsters.clear()
    selfServerPos = null
    const t = Date.now()
    for (const p of playerList) {
      if (p.id !== selfId) pushBuffer(remotes, p, t)
    }
    for (const m of monsterList) pushBuffer(monsters, m, t)
    notify(entityListeners)
  },

  applyCombat(ev) {
    // 即时修正实体血量(不等下一个快照)
    if (ev.kind === 'player_hit_monster') {
      const m = monsters.get(ev.targetId)
      if (m) {
        m.info = { ...m.info, hp: ev.hp, dead: ev.killed }
      }
    } else if (ev.kind === 'monster_hit_player') {
      const r = remotes.get(ev.targetId)
      if (r) r.info = { ...r.info, hp: ev.hp, dead: ev.killed }
    }
    notify(combatListeners, ev)
  },

  setSelfStats(stats) {
    selfStats = stats
    notify(statsListeners)
  },

  getSelfStats: () => selfStats,
  getRemote: (id) => remotes.get(id),
  remoteIds: () => [...remotes.keys()],
  getMonster: (id) => monsters.get(id),
  monsterIds: () => [...monsters.keys()],
  getSelfServerPos: () => selfServerPos,

  // 攻击目标选择: 面前范围内最近的活怪
  nearestAliveMonster(pos, range) {
    let best = null
    let bestD = range
    for (const { info } of monsters.values()) {
      if (info.dead) continue
      const d = Math.hypot(info.x - pos.x, info.z - pos.z)
      if (d < bestD) {
        best = info
        bestD = d
      }
    }
    return best
  },

  clear() {
    remotes.clear()
    monsters.clear()
    selfServerPos = null
    selfStats = null
    notify(entityListeners)
  },

  subscribe(fn) {
    entityListeners.add(fn)
    return () => entityListeners.delete(fn)
  },
  subscribeStats(fn) {
    statsListeners.add(fn)
    return () => statsListeners.delete(fn)
  },
  subscribeCombat(fn) {
    combatListeners.add(fn)
    return () => combatListeners.delete(fn)
  },
}

function notify(listeners, arg) {
  for (const fn of listeners) fn(arg)
}
