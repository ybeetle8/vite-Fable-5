// M5 战斗系统自动化测试:
// 1. welcome 携带怪物列表
// 2. 攻击结算: 走到怪物旁攻击, 收到 combat_result 且怪物掉血
// 3. 攻击冷却: 连发两次只结算一次
// 4. 超距攻击被拒绝
// 5. 怪物 AI: 靠近后被仇恨追击并被攻击(收到 monster_hit_player)
// 6. 击杀怪物获得经验金币(player_update), 怪物 dead 并按时重生
// 7. 玩家死亡后 3 秒复活回出生点满血
// 运行: 先启动服务器, 再 node test-server/test-combat.js
import { io } from 'socket.io-client'

const BASE = 'http://localhost:62002'
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
    socket, welcome: null, snapshots: [], combats: [], updates: [],
    self: () => c.snapshots.at(-1)?.players.find((p) => p.id === username),
    monster: (id) => c.snapshots.at(-1)?.monsters.find((m) => m.id === id),
  }
  socket.on('welcome', (d) => (c.welcome = d))
  socket.on('world_snapshot', (s) => {
    c.snapshots.push(s)
    if (c.snapshots.length > 300) c.snapshots.shift()
  })
  socket.on('combat_result', (ev) => c.combats.push(ev))
  socket.on('player_update', (u) => c.updates.push(u))
  await new Promise((resolve, reject) => {
    socket.on('welcome', resolve)
    socket.on('connect_error', reject)
    setTimeout(() => reject(new Error('连接超时')), 5000)
  })
  return c
}

// 让客户端权威移动到目标点附近(粗略导航, 直线走)
async function walkTo(c, tx, tz, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const me = c.self()
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

console.log('== M5 战斗系统测试 ==')

const A = await makeClient('combat_test_a', '战士甲', 'hero')
await sleep(400)

// 1. welcome 带怪物
const monsters = A.welcome.monsters ?? []
check('welcome 携带怪物列表(10 只)', monsters.length === 10, `实际 ${monsters.length}`)

// 2. 超距攻击被拒绝(出生点离最近怪物 > 20 米)
const target = monsters[0]
A.combats.length = 0
A.socket.emit('attack', { targetId: target.id })
await sleep(400)
check('超距攻击被拒绝(无 combat_result)', A.combats.length === 0)

// 3. 走到怪物旁攻击
const arrived = await walkTo(A, target.x, target.z)
check('权威移动导航到怪物刷新点', arrived)

A.combats.length = 0
A.socket.emit('attack', { targetId: target.id })
await sleep(300)
const hit = A.combats.find((ev) => ev.kind === 'player_hit_monster' && ev.targetId === target.id)
check('攻击命中收到 combat_result', !!hit, hit ? `伤害 ${hit.dmg}` : '')
check('怪物血量下降', hit && hit.hp < target.maxHp, hit ? `${hit.hp}/${target.maxHp}` : '')

// 4. 冷却期连发只结算一次(先等上一击冷却转好)
await sleep(900)
A.combats.length = 0
A.socket.emit('attack', { targetId: target.id })
await sleep(50)
A.socket.emit('attack', { targetId: target.id })
await sleep(300)
const hits = A.combats.filter((ev) => ev.kind === 'player_hit_monster')
check('冷却内连发两次只结算一次', hits.length === 1, `实际 ${hits.length} 次`)

// 5. 怪物仇恨反击: 站在旁边等它打(此时怪物已被打, 应在追击/攻击)
A.combats.length = 0
await sleep(3500)
const counter = A.combats.find((ev) => ev.kind === 'monster_hit_player' && ev.targetId === 'combat_test_a')
check('怪物反击玩家(monster_hit_player)', !!counter, counter ? `伤害 ${counter.dmg}` : '')

// 6. 击杀: 持续攻击到死(勇者攻12 vs 史莱姆防2血30, 约3刀)
A.updates.length = 0
A.combats.length = 0
let killed = false
for (let i = 0; i < 12 && !killed; i++) {
  A.socket.emit('attack', { targetId: target.id })
  await sleep(900)
  killed = A.combats.some((ev) => ev.kind === 'player_hit_monster' && ev.killed)
}
check('怪物被击杀', killed)
await sleep(300)
const rewardUpdate = A.updates.at(-1)
check('击杀获得经验/金币(player_update)', rewardUpdate && (rewardUpdate.exp > 0 || rewardUpdate.level > 1 || rewardUpdate.gold > 0),
  rewardUpdate ? `exp=${rewardUpdate.exp} gold=${rewardUpdate.gold} lv=${rewardUpdate.level}` : '')
check('快照中怪物标记 dead', A.monster(target.id)?.dead === true)

// 7. 重生(配置 8 秒)
await sleep(9000)
const respawned = A.monster(target.id)
check('怪物 8 秒后重生满血', respawned && !respawned.dead && respawned.hp === respawned.maxHp,
  respawned ? `hp=${respawned.hp}` : '')

// 8. 玩家死亡与复活: 站着让怪打死(僧侣乙, 血 95, 史莱姆攻 6, 慢; 直接用甲挨打太久,
//    改为用低级号乙站怪堆里, 两只怪同时打)
console.log('-- 玩家死亡测试(约 60-90 秒, 站怪堆挨打) --')
const B = await makeClient('combat_test_b', '法师乙', 'mage')
await sleep(400)
// 走到两只怪中间聚仇恨
await walkTo(B, 16.5, 13.5)
// 打一下两只怪拉双仇恨
for (const mid of ['m1', 'm2']) {
  B.socket.emit('attack', { targetId: mid })
  await sleep(900)
}
const deadline = Date.now() + 90000
let died = false
while (Date.now() < deadline && !died) {
  died = B.combats.some((ev) => ev.kind === 'monster_hit_player' && ev.targetId === 'combat_test_b' && ev.killed)
  await sleep(500)
}
check('玩家被怪物击倒', died)

if (died) {
  await sleep(3600) // 复活延迟 3 秒 + 余量
  const me = B.self()
  const lastUpdate = B.updates.at(-1)
  check('玩家 3 秒后复活回出生点', me && Math.hypot(me.x, me.z) < 2, me ? `位置 (${me.x.toFixed(1)}, ${me.z.toFixed(1)})` : '')
  check('复活后满血', lastUpdate && lastUpdate.hp === lastUpdate.maxHp, lastUpdate ? `hp=${lastUpdate.hp}/${lastUpdate.maxHp}` : '')
}

A.socket.disconnect()
B.socket.disconnect()

const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
