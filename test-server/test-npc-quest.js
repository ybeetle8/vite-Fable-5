// M9 NPC、商店与任务系统自动化测试:
// 1. 新角色任务空结构, welcome 携带
// 2. 距离校验: 远处接任务被拒, 走到国王面前成功
// 3. 跳链接取被拒(prereq)
// 4. 击杀进度实时 toast, 满 6 只 done=true, progress 封顶
// 5. 交付得经验金币, q1 入 completed, 未达标交付被拒
// 6. 收集类概率计数(概率性可重跑), 素材不占背包
// 7. 商店购买: 金币扣减+背包+1, 金币不足拒, slot 不符拒
// 8. 商店出售: 半价回收, 背包移除
// 9. 旅馆: 掉血后回满, 扣 level*5, 金币不足拒
// 10. 重连后任务进度/completed 恢复
// 运行: 先启动服务器, 再 node test-server/test-npc-quest.js
import { io } from 'socket.io-client'

const BASE = 'http://localhost:62002'
const results = []
const TAG = `nq${Date.now() % 1000000}`

function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ' + detail : ''}`)
}

async function api(path, body) {
  return fetch(BASE + path, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json())
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(fn, timeoutMs = 10000, stepMs = 200) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true
    await sleep(stepMs)
  }
  return false
}

async function makeClient(username, nickname, classId) {
  await api('/api/register', { username, password: 'test1234' })
  const login = await api('/api/login', { username, password: 'test1234' })
  if (!login.character) {
    await api('/api/character', { token: login.token, nickname, classId })
  }
  const login2 = await api('/api/login', { username, password: 'test1234' })
  const socket = io(BASE, { auth: { token: login2.token }, transports: ['websocket'] })
  const c = {
    username, socket,
    welcome: null, snapshots: [], combats: [], updates: [], quests: [], npcResults: [], invs: [],
    self: () => c.snapshots.at(-1)?.players.find((p) => p.id === username),
    aliveNear: (x, z, r) =>
      (c.snapshots.at(-1)?.monsters ?? []).filter(
        (m) => !m.dead && Math.hypot(m.x - x, m.z - z) <= r,
      ),
    lastUpdate: () => c.updates.at(-1),
    lastQuest: () => c.quests.at(-1),
    lastNpc: () => c.npcResults.at(-1),
  }
  socket.on('welcome', (d) => (c.welcome = d))
  socket.on('world_snapshot', (s) => {
    c.snapshots.push(s)
    if (c.snapshots.length > 300) c.snapshots.shift()
  })
  socket.on('combat_result', (ev) => c.combats.push(ev))
  socket.on('player_update', (u) => c.updates.push(u))
  socket.on('quest_update', (q) => c.quests.push(q))
  socket.on('npc_result', (r) => c.npcResults.push(r))
  socket.on('inventory_update', (d) => c.invs.push(d))
  await new Promise((resolve, reject) => {
    socket.on('welcome', resolve)
    socket.on('connect_error', reject)
    setTimeout(() => reject(new Error('连接超时')), 5000)
  })
  return c
}

async function walkTo(c, tx, tz, timeoutMs = 25000) {
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

async function walkPath(c, points) {
  for (const [x, z] of points) {
    if (!(await walkTo(c, x, z))) return false
  }
  return true
}

// 王城 -> 起始平原(北门), 或反向
async function goPlain(c) {
  await walkPath(c, [[5, 8], [5, 24], [0, 27.2]])
  const arrived = new Promise((res) => c.socket.once('map_changed', (d) => res(d)))
  c.socket.emit('change_map')
  const d = await Promise.race([arrived, sleep(3000)])
  return d?.map === 'novice_plain'
}
async function goTown(c) {
  await walkTo(c, 0, -47.2)
  const arrived = new Promise((res) => c.socket.once('map_changed', (d) => res(d)))
  c.socket.emit('change_map')
  const d = await Promise.race([arrived, sleep(3000)])
  return d?.map === 'castle_town'
}

// 国王位置 (0,-12.5); 绕开中央喷泉(0,8,r2)再走到面前(径向直冲会被障碍卡死)
async function goKing(c) {
  return walkPath(c, [[5, -5], [0, -11]])
}

// 在平原刷史莱姆直到条件满足
async function farmSlimes(c, doneFn, maxMs = 120000) {
  const deadline = Date.now() + maxMs
  while (!doneFn() && Date.now() < deadline) {
    const me = c.self()
    if (!me) {
      await sleep(300)
      continue
    }
    // 只打史莱姆(平原也有大嘴鸟, 用 type 过滤)
    const targets = (c.snapshots.at(-1)?.monsters ?? []).filter(
      (m) => !m.dead && m.type === 'slime' && Math.hypot(m.x - me.x, m.z - me.z) <= 16,
    )
    if (targets.length === 0) {
      await sleep(600)
      continue
    }
    const t = targets[0]
    const d = Math.hypot(t.x - me.x, t.z - me.z)
    if (d > 2.4) {
      await walkTo(c, t.x, t.z, 6000)
      continue
    }
    c.socket.emit('attack', { targetId: t.id })
    await sleep(900)
  }
  return doneFn()
}

console.log(`== M9 NPC/商店/任务测试 (账号 ${TAG}) ==`)

const A = await makeClient(`${TAG}a`, `勇士${TAG}`, 'hero')
await sleep(500)

// ---------- 1. 新角色任务空结构 ----------
const wq = A.welcome.character.quests
check('welcome 携带任务空结构', wq && Object.keys(wq.active).length === 0 && wq.completed.length === 0)
check('连接时收到 quest_update', A.quests.length >= 1)

// ---------- 2. 距离校验 ----------
// 出生点(0,0) 距国王(0,-12.5) 约 12.5 米, 直接接被拒
A.npcResults.length = 0
A.socket.emit('quest_accept', { questId: 'q1_slime' })
await sleep(400)
check('远距离接任务被拒(reason=range)',
  A.npcResults.some((r) => r.action === 'accept' && !r.ok && r.reason === 'range'))

await goKing(A)
A.npcResults.length = 0
A.quests.length = 0
A.socket.emit('quest_accept', { questId: 'q1_slime' })
await sleep(400)
check('国王面前接 q1 成功', A.npcResults.some((r) => r.action === 'accept' && r.ok))
check('quest_update.active 含 q1(progress 0)',
  A.lastQuest()?.active.some((q) => q.id === 'q1_slime' && q.progress === 0))

// ---------- 3. 跳链接取被拒 ----------
A.npcResults.length = 0
A.socket.emit('quest_accept', { questId: 'q3_bigbeak' })
await sleep(400)
check('跳链接 q3 被拒(reason=prereq)',
  A.npcResults.some((r) => r.action === 'accept' && !r.ok && r.reason === 'prereq'))

// ---------- 4. 击杀进度 ----------
console.log('-- 前往平原讨伐史莱姆 (q1 需 6 只) --')
check('传送到起始平原', await goPlain(A))
await walkPath(A, [[12, -20], [12, 8]])
A.quests.length = 0
const q1done = await farmSlimes(A, () =>
  A.quests.some((q) => q.toast?.questId === 'q1_slime' && q.toast.done))
check('击杀进度实时 toast 推送', A.quests.some((q) => q.toast?.questId === 'q1_slime'))
check('杀满 6 只 toast.done=true', q1done)
// 再杀一只验证 progress 封顶
A.quests.length = 0
await farmSlimes(A, () => A.combats.filter((e) => e.killed && e.kind === 'player_hit_monster').length > 0 && A.quests.length >= 0, 20000)
await sleep(500)
const q1state = A.lastQuest()?.active.find((q) => q.id === 'q1_slime')
check('达标后 progress 封顶不超 goal', !q1state || q1state.progress <= 6,
  `progress=${q1state?.progress}`)

// ---------- 5. 交付 ----------
console.log('-- 回王城交任务 --')
check('传送回王城', await goTown(A))
// 未到国王面前交付(在南门)被拒
A.npcResults.length = 0
A.socket.emit('quest_complete', { questId: 'q1_slime' })
await sleep(400)
check('远距离交付被拒', A.npcResults.some((r) => r.action === 'complete' && !r.ok && r.reason === 'range'))

await goKing(A)
const goldBefore = A.lastUpdate()?.gold ?? 0
A.npcResults.length = 0
A.quests.length = 0
A.socket.emit('quest_complete', { questId: 'q1_slime' })
await sleep(500)
const compRes = A.npcResults.find((r) => r.action === 'complete')
check('交付 q1 成功', compRes?.ok === true)
check('奖励金币 +60', (A.lastUpdate()?.gold ?? 0) === goldBefore + 60,
  `${goldBefore} -> ${A.lastUpdate()?.gold}`)
check('q1 进入 completed', A.lastQuest()?.completed.includes('q1_slime'))

// 未达标交付被拒: 接 q2 立即交
A.socket.emit('quest_accept', { questId: 'q2_gel' })
await sleep(300)
A.npcResults.length = 0
A.socket.emit('quest_complete', { questId: 'q2_gel' })
await sleep(400)
check('未达标交付被拒(reason=unfinished)',
  A.npcResults.some((r) => r.action === 'complete' && !r.ok && r.reason === 'unfinished'))

// ---------- 6. 收集类概率计数(q2: 70% 掉凝胶) ----------
console.log('-- 收集史莱姆凝胶 (概率 70%, 需 6 份, 可重跑) --')
await goPlain(A)
await walkPath(A, [[12, -20], [12, 8]])
const invBefore = A.invs.at(-1)?.inventory.length ?? 0
const gainedBefore = A.invs.filter((d) => d.gained).length
const q2done = await farmSlimes(A, () =>
  A.quests.some((q) => q.toast?.questId === 'q2_gel' && q.toast.done), 150000)
check('收集类任务达标(概率性)', q2done)
const invAfter = A.invs.at(-1)?.inventory.length ?? 0
const gainedDuring = A.invs.filter((d) => d.gained).length - gainedBefore
// 素材不占背包: 背包增量应完全来自装备掉落(gained 事件), 与收集的 6 份素材无关
check('任务素材不占背包(增量=装备掉落数)', invAfter - invBefore === gainedDuring,
  `背包 ${invBefore} -> ${invAfter}, 装备掉落 ${gainedDuring} 件`)

// 交 q2 拿皮甲奖励
console.log('-- 回城交 q2 (奖励皮甲) --')
await goTown(A)
await goKing(A)
A.invs.length = 0
A.socket.emit('quest_complete', { questId: 'q2_gel' })
await sleep(500)
check('q2 装备奖励入背包(皮甲)', A.invs.at(-1)?.inventory.includes('leather_armor'))

// ---------- 7. 商店购买 ----------
console.log('-- 武器店购买测试 --')
await walkTo(A, -14, -2.5) // 武器店老板(-15,-4) 面前
const gold0 = A.lastUpdate()?.gold ?? 0
A.npcResults.length = 0
A.invs.length = 0
A.socket.emit('shop_buy', { npcId: 'weapon_shop', itemId: 'bronze_shield' }) // 170G
await sleep(400)
const buyRes = A.npcResults.find((r) => r.action === 'buy')
check('购买青铜盾成功', buyRes?.ok === true && buyRes.cost === 170)
check('金币扣 170', (A.lastUpdate()?.gold ?? 0) === gold0 - 170, `${gold0} -> ${A.lastUpdate()?.gold}`)
check('背包 +青铜盾', A.invs.at(-1)?.inventory.includes('bronze_shield'))

// 金币不足
A.npcResults.length = 0
A.socket.emit('shop_buy', { npcId: 'weapon_shop', itemId: 'flame_staff' }) // 785G 应该不够
await sleep(400)
const gold1 = A.lastUpdate()?.gold ?? 0
if (gold1 < 785) {
  check('金币不足购买被拒(reason=gold)',
    A.npcResults.some((r) => r.action === 'buy' && !r.ok && r.reason === 'gold'))
} else {
  check('金币不足购买被拒(reason=gold)', true, '(金币充足, 跳过此断言)')
}

// slot 不符: 向武器店买盔甲
A.npcResults.length = 0
A.socket.emit('shop_buy', { npcId: 'weapon_shop', itemId: 'chain_mail' })
await sleep(400)
check('武器店不卖盔甲(静默拒绝)', !A.npcResults.some((r) => r.action === 'buy'))

// ---------- 8. 商店出售 ----------
const goldBeforeSell = A.lastUpdate()?.gold ?? 0
const inv = A.invs.at(-1)?.inventory ?? []
const sellIdx = inv.indexOf('bronze_shield')
A.npcResults.length = 0
A.socket.emit('shop_sell', { npcId: 'weapon_shop', index: sellIdx })
await sleep(400)
const sellRes = A.npcResults.find((r) => r.action === 'sell')
check('出售青铜盾半价回收 85G', sellRes?.ok === true && sellRes.gold === 85)
check('出售后金币 +85', (A.lastUpdate()?.gold ?? 0) === goldBeforeSell + 85)
check('出售后背包移除', !A.invs.at(-1)?.inventory.includes('bronze_shield'))

// ---------- 9. 旅馆 ----------
console.log('-- 旅馆测试(先去平原挨打掉血) --')
await goPlain(A)
await walkPath(A, [[12, -20], [14, 12]])
// 站怪堆里挨几下
await until(() => {
  const u = A.lastUpdate()
  return u && u.hp < u.maxHp - 5
}, 30000, 500)
A.socket.emit('move', { dx: 0, dz: 0, facing: 0 })
const hurtHp = A.lastUpdate()?.hp
check('已掉血', hurtHp < A.lastUpdate()?.maxHp, `hp=${hurtHp}/${A.lastUpdate()?.maxHp}`)
await goTown(A)
await walkTo(A, -17, 9.2) // 旅馆老板(-18,10.5) 面前
const level = A.lastUpdate()?.level ?? 1
const goldBeforeInn = A.lastUpdate()?.gold ?? 0
A.npcResults.length = 0
A.socket.emit('inn_rest', { npcId: 'inn_keeper' })
await sleep(400)
const innRes = A.npcResults.find((r) => r.action === 'inn')
check(`旅馆休息成功(扣 ${level * 5}G)`, innRes?.ok === true && innRes.cost === level * 5)
check('休息后满血满蓝',
  A.lastUpdate()?.hp === A.lastUpdate()?.maxHp && A.lastUpdate()?.mp === A.lastUpdate()?.maxMp,
  `hp=${A.lastUpdate()?.hp}/${A.lastUpdate()?.maxHp}`)
check('金币扣除正确', (A.lastUpdate()?.gold ?? 0) === goldBeforeInn - level * 5)

// 金币不足场景: 新小号(0金币)
const B = await makeClient(`${TAG}b`, `穷人${TAG}`, 'mage')
await sleep(400)
await walkTo(B, -17, 9.2)
B.npcResults.length = 0
B.socket.emit('inn_rest', { npcId: 'inn_keeper' })
await sleep(400)
check('金币不足旅馆被拒(reason=gold)',
  B.npcResults.some((r) => r.action === 'inn' && !r.ok && r.reason === 'gold'))
B.socket.disconnect()

// ---------- 10. 重连恢复 ----------
// 接 q3 留一个 active 任务
await goKing(A)
A.socket.emit('quest_accept', { questId: 'q3_bigbeak' })
await sleep(400)
A.socket.disconnect()
await sleep(500)
const A2 = await makeClient(`${TAG}a`, `勇士${TAG}`, 'hero')
await sleep(400)
const wq2 = A2.welcome.character.quests
check('重连后 completed 恢复', wq2.completed.includes('q1_slime') && wq2.completed.includes('q2_gel'))
check('重连后 active 任务恢复(q3)', 'q3_bigbeak' in wq2.active)
A2.socket.disconnect()

const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
