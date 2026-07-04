// M7 地图与传送测试:
// 1. 新角色出生在王城, 王城无怪物
// 2. 走到传送门按 E(change_map) 切到平原, 收到 map_changed 带新图实体
// 3. 远离传送门时 change_map 被拒绝
// 4. 不同图玩家互不可见, 聊天仍互通
// 5. 切图后旧图玩家收到 entity_leave, 新图玩家收到 entity_enter
// 6. 一路传送: 王城->平原->森林->洞窟->魔王城, 各图怪物配置正确
// 7. 在野外死亡后复活回王城
// 运行: 先启动服务器, 再 node test-server/test-map.js
import { io } from 'socket.io-client'

const BASE = 'http://localhost:3001'
const results = []

function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ' + detail : ''}`)
}

async function api(path, body) {
  return fetch(BASE + path, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json())
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function makeClient(username, nickname, classId) {
  await api('/api/register', { username, password: 'test1234' })
  const login = await api('/api/login', { username, password: 'test1234' })
  if (!login.character) {
    await api('/api/character', { token: login.token, nickname, classId })
  }
  const socket = io(BASE, { auth: { token: login.token }, transports: ['websocket'] })
  const c = {
    socket, welcome: null, snapshots: [], chats: [], combats: [], updates: [],
    enters: [], leaves: [], mapChanges: [],
    self: () => c.snapshots.at(-1)?.players.find((p) => p.id === username),
  }
  socket.on('welcome', (d) => (c.welcome = d))
  socket.on('world_snapshot', (s) => {
    c.snapshots.push(s)
    if (c.snapshots.length > 300) c.snapshots.shift()
  })
  socket.on('chat_broadcast', (m) => c.chats.push(m))
  socket.on('combat_result', (ev) => c.combats.push(ev))
  socket.on('player_update', (u) => c.updates.push(u))
  socket.on('entity_enter', (p) => c.enters.push(p))
  socket.on('entity_leave', (p) => c.leaves.push(p))
  socket.on('map_changed', (d) => {
    c.mapChanges.push(d)
    c.snapshots.length = 0 // 切图后旧快照作废
  })
  await new Promise((resolve, reject) => {
    socket.on('welcome', resolve)
    socket.on('connect_error', reject)
    setTimeout(() => reject(new Error('连接超时')), 5000)
  })
  return c
}

async function walkTo(c, username, tx, tz, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const me = c.snapshots.at(-1)?.players.find((p) => p.id === username)
    if (!me) {
      await sleep(100)
      continue
    }
    const dx = tx - me.x
    const dz = tz - me.z
    const d = Math.hypot(dx, dz)
    if (d < 1.0) {
      c.socket.emit('move', { dx: 0, dz: 0, facing: 0 })
      return true
    }
    c.socket.emit('move', { dx: dx / d, dz: dz / d, facing: Math.atan2(dx, dz) })
    await sleep(100)
  }
  c.socket.emit('move', { dx: 0, dz: 0, facing: 0 })
  return false
}

// 走到传送门并传送(可带绕行路径点), 返回 map_changed 数据
async function teleport(c, username, px, pz, waypoints = []) {
  for (const [wx, wz] of waypoints) {
    await walkTo(c, username, wx, wz)
  }
  await walkTo(c, username, px, pz)
  const before = c.mapChanges.length
  c.socket.emit('change_map')
  await sleep(600)
  return c.mapChanges.length > before ? c.mapChanges.at(-1) : null
}

console.log('== M7 地图与传送测试 ==')

const A = await makeClient('map_test_a', '旅人甲', 'hero')
await sleep(400)

// 1. 出生在王城, 无怪物
check('新角色出生在王城', A.welcome.character.map === 'castle_town', A.welcome.character.map)
check('王城无怪物', (A.welcome.monsters ?? []).length === 0)

// 2. 远离传送门 change_map 被拒(出生点 0,0 距门 0,28 有 28 米)
A.socket.emit('change_map')
await sleep(400)
check('远离传送门时传送被拒绝', A.mapChanges.length === 0)

// 3. 走到传送门传送到平原(绕开中央喷泉)
const change = await teleport(A, 'map_test_a', 0, 28, [[6, 8]])
check('传送到起始平原', change?.map === 'novice_plain', change?.map)
check('map_changed 带新图怪物(14 只)', (change?.monsters ?? []).length === 14, `实际 ${change?.monsters?.length}`)
check('出现在平原入口(0,-44)附近', change && Math.hypot(change.x - 0, change.z + 44) < 2,
  change ? `(${change.x}, ${change.z})` : '')

// 4. 跨图不可见 + 聊天互通
const B = await makeClient('map_test_b', '旅人乙', 'mage')
await sleep(600)
check('B(王城)的 welcome 不含 A(平原)', !(B.welcome.players ?? []).some((p) => p.id === 'map_test_a'))
const aSeesB = A.snapshots.at(-1)?.players.some((p) => p.id === 'map_test_b')
check('A(平原)快照中无 B(王城)', !aSeesB)
A.socket.emit('chat', { text: '跨图喊话' })
await sleep(400)
check('跨图聊天互通', B.chats.some((m) => m.from === '旅人甲' && m.text === '跨图喊话'))

// 5. B 传送到平原, A 收到 entity_enter
A.enters.length = 0
const bChange = await teleport(B, 'map_test_b', 0, 28, [[6, 8]])
check('B 也传送到平原', bChange?.map === 'novice_plain')
await sleep(400)
check('A 收到 B 的 entity_enter', A.enters.some((p) => p.id === 'map_test_b'))

// B 回王城, A 应收到 entity_leave
A.leaves.length = 0
const bBack = await teleport(B, 'map_test_b', 0, -48)
check('B 传送回王城', bBack?.map === 'castle_town')
await sleep(400)
check('A 收到 B 的 entity_leave', A.leaves.some((p) => p.id === 'map_test_b'))

// 6. A 一路传送到魔王城, 验证各图怪物(洞窟绕开中央巨岩)
const route = [
  { portal: [0, 48], expect: 'mist_forest', monsters: 10, waypoints: [] },
  { portal: [0, 43], expect: 'rock_cavern', monsters: 9, waypoints: [] },
  { portal: [0, 33], expect: 'demon_castle', monsters: 6, waypoints: [[6, 0]] },
]
for (const leg of route) {
  const ch = await teleport(A, 'map_test_a', leg.portal[0], leg.portal[1], leg.waypoints)
  check(`传送到 ${leg.expect}`, ch?.map === leg.expect, ch?.map)
  check(`${leg.expect} 怪物数量 ${leg.monsters}`, (ch?.monsters ?? []).length === leg.monsters,
    `实际 ${ch?.monsters?.length}`)
}

// 7. 在魔王城送死, 复活应回王城
console.log('-- 死亡回城测试(站恶魔堆里挨打) --')
await walkTo(A, 'map_test_a', -14, -5) // 恶魔卫兵位置
A.socket.emit('attack', { targetId: A.mapChanges.at(-1).monsters[0].id })
const deadline = Date.now() + 60000
let died = false
while (Date.now() < deadline && !died) {
  died = A.combats.some((ev) => ev.kind === 'monster_hit_player' && ev.targetId === 'map_test_a' && ev.killed)
  await sleep(500)
}
check('玩家被恶魔击倒', died)
if (died) {
  await sleep(3800)
  const respawnChange = A.mapChanges.at(-1)
  check('复活切图回王城', respawnChange?.map === 'castle_town', respawnChange?.map)
  const lastUpdate = A.updates.at(-1)
  check('复活满血', lastUpdate && lastUpdate.hp === lastUpdate.maxHp)
}

A.socket.disconnect()
B.socket.disconnect()

const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
