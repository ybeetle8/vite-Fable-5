// M6 聊天/安全区/存档测试:
// 1. 聊天全服广播(双客户端互见)
// 2. 超长消息被拒绝
// 3. 刷屏限频(1 秒 > 2 条丢弃)
// 4. 出生点安全区: 站在安全区内不被怪索敌
// 5. 存档闭环: 打怪获得的经验/金币在重新登录后保留
// 运行: 先启动服务器, 再 node test-server/test-chat-save.js
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
  await new Promise((resolve, reject) => {
    socket.on('welcome', resolve)
    socket.on('connect_error', reject)
    setTimeout(() => reject(new Error('连接超时')), 5000)
  })
  return c
}

async function walkTo(c, username, tx, tz, timeoutMs = 25000) {
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

console.log('== M6 聊天/安全区/存档测试 ==')

const A = await makeClient('m6_test_a', '聊天甲', 'hero')
const B = await makeClient('m6_test_b', '聊天乙', 'priest')
await sleep(400)

// 1. 聊天广播
A.socket.emit('chat', { text: '你好，世界！' })
await sleep(400)
check('A 发消息 B 收到', B.chats.some((m) => m.from === '聊天甲' && m.text === '你好，世界！'))
check('发送者自己也收到', A.chats.some((m) => m.from === '聊天甲'))

// 2. 超长消息被拒
B.chats.length = 0
A.socket.emit('chat', { text: 'x'.repeat(101) })
await sleep(400)
check('超长消息(101字)被拒绝', B.chats.length === 0)

// 3. 刷屏限频: 快速发 5 条, 只应通过 2 条(先等前面消息滑出 1 秒窗口)
await sleep(1100)
B.chats.length = 0
for (let i = 0; i < 5; i++) A.socket.emit('chat', { text: `刷屏${i}` })
await sleep(600)
check('1 秒内 5 条只通过 2 条', B.chats.length === 2, `实际 ${B.chats.length} 条`)

// 4. 安全区: A 站出生点(安全区内), 怪不应索敌
//    出生点(0,0)半径 8 内没有刷新点, 最近怪堆 (15,15) 距离 21, 本来就够不到;
//    所以直接验证: A 在安全区边缘引怪后退回安全区, 怪应放弃回归
const target = A.welcome.monsters.find((m) => m.id === 'm1') // (15,15)
await walkTo(A, 'm6_test_a', target.x, target.z) // 走到怪旁
A.socket.emit('attack', { targetId: target.id })  // 打一下拉仇恨
await sleep(500)
await walkTo(A, 'm6_test_a', 0, 0)                // 跑回安全区
await sleep(3000)                                  // 等怪放弃并回归
const mNow = A.snapshots.at(-1)?.monsters.find((m) => m.id === target.id)
const distHome = Math.hypot(mNow.x - target.x, mNow.z - target.z)
check('拉怪回安全区后怪物放弃回归(不进安全区)', distHome < 6, `怪距家 ${distHome.toFixed(1)} 米`)
A.combats.length = 0
await sleep(2500)
const hitInSafe = A.combats.some((ev) => ev.kind === 'monster_hit_player' && ev.targetId === 'm6_test_a')
check('安全区内不再被攻击', !hitInSafe)

// 5. 存档闭环: 打死一只怪拿奖励, 断线重新登录后数据保留
await walkTo(A, 'm6_test_a', target.x, target.z)
let killed = false
for (let i = 0; i < 12 && !killed; i++) {
  A.socket.emit('attack', { targetId: target.id })
  await sleep(900)
  killed = A.combats.some((ev) => ev.kind === 'player_hit_monster' && ev.killed)
}
const before = A.updates.at(-1)
check('击杀成功待存档', killed && before, `exp=${before?.exp} gold=${before?.gold}`)

A.socket.disconnect()
await sleep(800)

const relogin = await api('/api/login', { username: 'm6_test_a', password: 'test1234' })
const saved = relogin.character
check('重新登录后经验/金币保留', saved.exp === before.exp && saved.gold === before.gold,
  `存档 exp=${saved.exp} gold=${saved.gold}`)
check('重新登录后位置保留(在怪堆附近)', Math.hypot(saved.pos.x - target.x, saved.pos.z - target.z) < 5,
  `位置 (${saved.pos.x.toFixed(1)}, ${saved.pos.z.toFixed(1)})`)

B.socket.disconnect()

const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
