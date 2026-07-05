// M8 职业技能与装备自动化测试:
// 1. 新角色自带职业初始装备, atk = 基础 + 武器
// 2. 卸下/穿上装备, atk 同步变化(装备影响实际属性口径)
// 3. 火球全流程: cast 吟唱 -> hit 结算 -> combat_result(skillId) + MP 扣减 + 一击秒杀获得经验
// 4. 冷却中二发被拒(fail reason=cd)
// 5. 群疗/治疗自愈 + MP 不足被拒(fail reason=mp)
// 6. 冰冻减速: 快照 slowed=true, 4 秒后恢复
// 7. 吟唱被移动打断(fail reason=interrupted, 不结算)
// 8. 挑衅拉仇恨: 怪物改打勇者
// 9. 旋风斩近身 AOE: 一次命中 >=2 只
// 10. 闪电直线 AOE 命中
// 11. 治疗术自动选血量比例最低者(勇者)
// 12. 强化术: 全队 atk +25%, 20 秒后回落
// 13. 击杀掉落: 刷史莱姆获得装备(概率性, 失败可重跑)
// 运行: 先启动服务器, 再 node test-server/test-skills.js
import { io } from 'socket.io-client'

const BASE = 'http://localhost:62002'
const results = []
const TAG = `sk${Date.now() % 1000000}` // 每次运行用全新账号, 保证初始状态干净

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
  const socket = io(BASE, { auth: { token: login.token }, transports: ['websocket'] })
  const c = {
    username, socket,
    welcome: null, snapshots: [], combats: [], updates: [], skills: [], invs: [],
    self: () => c.snapshots.at(-1)?.players.find((p) => p.id === username),
    monster: (id) => c.snapshots.at(-1)?.monsters.find((m) => m.id === id),
    aliveNear: (x, z, r) =>
      (c.snapshots.at(-1)?.monsters ?? []).filter(
        (m) => !m.dead && Math.hypot(m.x - x, m.z - z) <= r,
      ),
    lastAtk: () => c.updates.at(-1)?.atk,
  }
  socket.on('welcome', (d) => (c.welcome = d))
  socket.on('world_snapshot', (s) => {
    c.snapshots.push(s)
    if (c.snapshots.length > 300) c.snapshots.shift()
  })
  socket.on('combat_result', (ev) => c.combats.push(ev))
  socket.on('player_update', (u) => c.updates.push(u))
  socket.on('skill_result', (ev) => c.skills.push(ev))
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

// 走近某只怪物的实时位置(怪会巡逻/移动, 按快照追踪), 到 maxD 米内停下并面向它
async function approach(c, monsterId, maxD, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const m = c.monster(monsterId)
    const me = c.self()
    if (!m || !me) {
      await sleep(100)
      continue
    }
    const dx = m.x - me.x
    const dz = m.z - me.z
    const d = Math.hypot(dx, dz)
    if (d <= maxD) {
      c.socket.emit('move', { dx: 0, dz: 0, facing: Math.atan2(dx, dz) })
      return true
    }
    c.socket.emit('move', { dx: dx / d, dz: dz / d, facing: Math.atan2(dx, dz) })
    await sleep(100)
  }
  c.socket.emit('move', { dx: 0, dz: 0, facing: 0 })
  return false
}

// 面向某点(不移动): move 零向量但带 facing
function faceTo(c, tx, tz) {
  const me = c.self()
  c.socket.emit('move', { dx: 0, dz: 0, facing: Math.atan2(tx - me.x, tz - me.z) })
}

// 王城出生点 -> 绕过喷泉 -> 北门传送到起始平原
async function goPlain(c) {
  await walkPath(c, [[5, 8], [5, 24], [0, 27.2]])
  const arrived = new Promise((res) => c.socket.once('map_changed', (d) => res(d)))
  c.socket.emit('change_map')
  const d = await Promise.race([arrived, sleep(3000)])
  return d?.map === 'novice_plain'
}

console.log(`== M8 技能与装备测试 (账号组 ${TAG}) ==`)

const H = await makeClient(`${TAG}h`, `勇者${TAG}`, 'hero')
const M = await makeClient(`${TAG}m`, `法师${TAG}`, 'mage')
const P = await makeClient(`${TAG}p`, `僧侣${TAG}`, 'priest')
await sleep(500)

// ---------- 1. 初始装备 ----------
const eqH = H.welcome.character.equipment
const eqM = M.welcome.character.equipment
check('勇者初始装备三件套', eqH?.weapon === 'copper_sword' && eqH?.armor === 'leather_armor' && eqH?.shield === 'wooden_shield',
  JSON.stringify(eqH))
check('法师初始武器为橡木杖', eqM?.weapon === 'oak_staff')
check('连接时收到 inventory_update', H.invs.length >= 1 && Array.isArray(H.invs[0].inventory))
check('勇者 atk = 基础12 + 铜之剑4 = 16', H.lastAtk() === 16, `实际 ${H.lastAtk()}`)
check('法师 atk = 基础16 + 橡木杖5 = 21', M.lastAtk() === 21, `实际 ${M.lastAtk()}`)

// ---------- 2. 卸下/穿上装备 ----------
H.socket.emit('unequip_item', { slot: 'weapon' })
await sleep(400)
check('卸下武器后 atk 回落到 12', H.lastAtk() === 12, `实际 ${H.lastAtk()}`)
check('卸下的武器进入背包', H.invs.at(-1)?.inventory.includes('copper_sword'))
H.socket.emit('equip_item', { itemId: 'copper_sword' })
await sleep(400)
check('重新穿上后 atk 恢复 16', H.lastAtk() === 16, `实际 ${H.lastAtk()}`)
check('背包清空', H.invs.at(-1)?.inventory.length === 0)

// ---------- 走到起始平原怪区 ----------
console.log('-- 三人前往起始平原史莱姆刷新区 (约 30 秒) --')
const [okH, okM, okP] = await Promise.all([goPlain(H), goPlain(M), goPlain(P)])
check('三人传送到起始平原', okH && okM && okP)
// 法师/僧侣站 (10,9): 距史莱姆A(15,15)约7.8米, 在火球射程内且不进怪物索敌圈
await Promise.all([
  walkPath(H, [[12, -20], [9, 7]]),
  walkPath(M, [[12, -20], [10, 9]]),
  walkPath(P, [[12, -20], [10.5, 8]]),
])

// ---------- 3. 群疗/治疗自愈 + MP 不足 ----------
P.combats.length = 0
P.skills.length = 0
P.socket.emit('cast_skill', { skillId: 'mass_heal' }) // mp 50-25=25, 吟唱1秒
await sleep(1600)
const mh = P.combats.find((e) => e.kind === 'player_heal' && e.casterId === P.username && e.targetId === P.username)
check('群体治疗对自己生效(player_heal)', !!mh, mh ? `回复 ${mh.amount}` : '')
P.socket.emit('cast_skill', { skillId: 'heal' }) // mp 25-12=13, 吟唱0.5秒
await sleep(900)
P.socket.emit('cast_skill', { skillId: 'blessing' }) // 需 20, 只剩 ~15 -> 拒绝
await sleep(400)
check('MP 不足被拒绝(fail reason=mp)',
  P.skills.some((e) => e.phase === 'fail' && e.skillId === 'blessing' && e.reason === 'mp'))

// ---------- 4. 火球全流程(秒杀史莱姆A) ----------
const slimeA = M.aliveNear(15, 15, 6)[0]
check('找到史莱姆A', !!slimeA, slimeA?.id ?? '')
await approach(M, slimeA.id, 7) // 怪物会巡逻, 走近到射程内再施法
await sleep(300)
M.combats.length = 0
M.skills.length = 0
M.updates.length = 0
M.socket.emit('cast_skill', { skillId: 'fireball', targetId: slimeA.id })
await sleep(1200) // 吟唱 0.5s + 结算
const fbCast = M.skills.find((e) => e.phase === 'cast' && e.skillId === 'fireball')
const fbHit = M.skills.find((e) => e.phase === 'hit' && e.skillId === 'fireball')
const fbDmg = M.combats.find((e) => e.kind === 'player_hit_monster' && e.skillId === 'fireball')
check('火球吟唱事件(phase=cast)', !!fbCast)
check('火球命中事件(phase=hit)', !!fbHit)
check('火球伤害走 combat_result 且带 skillId', !!fbDmg, fbDmg ? `伤害 ${fbDmg.dmg}` : '')
check('火球一击秒杀史莱姆(260%攻)', fbDmg?.killed === true)
check('击杀获得经验', M.updates.some((u) => u.exp >= 8 || u.level > 1))
const mpAfterFb = M.updates.find((u) => u.mp <= 50)
check('MP 扣减 10', !!mpAfterFb, `mp=${M.updates.at(-1)?.mp}`)

// ---------- 5. 冷却拒绝 ----------
M.skills.length = 0
M.socket.emit('cast_skill', { skillId: 'fireball', targetId: slimeA.id })
await sleep(400)
check('冷却中二发被拒(fail reason=cd)',
  M.skills.some((e) => e.phase === 'fail' && e.skillId === 'fireball' && e.reason === 'cd'))

// ---------- 6. 冰冻减速史莱姆B ----------
const slimeB = M.aliveNear(18, 12, 6).filter((m) => m.id !== slimeA.id)[0]
check('找到史莱姆B', !!slimeB, slimeB?.id ?? '')
await approach(M, slimeB.id, 7)
await sleep(300)
M.combats.length = 0
M.socket.emit('cast_skill', { skillId: 'frost', targetId: slimeB.id })
await sleep(500)
const frostDmg = M.combats.find((e) => e.kind === 'player_hit_monster' && e.skillId === 'frost')
check('冰冻造成伤害且不致死(120%攻)', !!frostDmg && !frostDmg.killed, frostDmg ? `伤害 ${frostDmg.dmg}` : '')
check('快照中怪物 slowed=true', M.monster(slimeB.id)?.slowed === true)
const slowGone = await until(() => M.monster(slimeB.id)?.slowed === false, 6000)
check('4 秒后减速解除', slowGone)

// ---------- 7. 吟唱被移动打断 ----------
await sleep(2500) // 等火球冷却(4s)转好
await approach(M, slimeB.id, 7) // 怪在追打法师, 保持射程内
M.skills.length = 0
M.combats.length = 0
M.socket.emit('cast_skill', { skillId: 'fireball', targetId: slimeB.id })
await sleep(150) // 吟唱中
M.socket.emit('move', { dx: 0.5, dz: 0, facing: 0 })
await sleep(300)
M.socket.emit('move', { dx: 0, dz: 0, facing: 0 })
await sleep(600)
check('移动打断吟唱(fail reason=interrupted)',
  M.skills.some((e) => e.phase === 'fail' && e.skillId === 'fireball' && e.reason === 'interrupted'))
check('被打断的技能未结算', !M.combats.some((e) => e.skillId === 'fireball'))

// ---------- 8. 挑衅拉仇恨 ----------
// 史莱姆B被冰冻拉了法师仇恨, 正在追打法师; 勇者主动贴近它后挑衅
console.log('-- 勇者接近史莱姆B放挑衅 --')
await approach(H, slimeB.id, 4, 20000)
H.combats.length = 0
H.skills.length = 0
H.socket.emit('cast_skill', { skillId: 'taunt' })
await sleep(400)
const tauntHit = H.skills.find((e) => e.phase === 'hit' && e.skillId === 'taunt')
check('挑衅命中(targets 含史莱姆B)', !!tauntHit && tauntHit.targets.includes(slimeB.id))
const tauntPull = await until(
  () => H.combats.some((e) => e.kind === 'monster_hit_player' && e.attackerId === slimeB.id && e.targetId === H.username),
  10000,
)
check('挑衅后怪物改打勇者', tauntPull)

// ---------- 9. 旋风斩近身 AOE ----------
// 勇者拖着B走到史莱姆A重生点, 等A重生索敌勇者, 两只都贴身后放旋风斩
console.log('-- 勇者聚怪测试旋风斩 --')
await walkTo(H, 15.5, 13.8)
const gathered = await until(() => {
  const me = H.self()
  return me && H.aliveNear(me.x, me.z, 3.2).length >= 2
}, 20000)
check('两只史莱姆聚到勇者身边', gathered)
H.combats.length = 0
H.socket.emit('cast_skill', { skillId: 'whirlwind' })
await sleep(500)
const whirlHits = H.combats.filter((e) => e.kind === 'player_hit_monster' && e.skillId === 'whirlwind')
check('旋风斩一次命中 >=2 只', whirlHits.length >= 2, `命中 ${whirlHits.length} 只`)

// ---------- 10. 闪电直线 AOE ----------
// 找法师附近任意活怪(旋风斩可能清场, 找 20 米内的), 贴近到 8 米内正对施放
const mePos = M.self()
const anyAlive = M.aliveNear(mePos.x, mePos.z, 20)[0]
if (anyAlive) {
  await approach(M, anyAlive.id, 8, 20000)
  const t = M.monster(anyAlive.id)
  faceTo(M, t.x, t.z)
  await sleep(200)
  M.combats.length = 0
  M.socket.emit('cast_skill', { skillId: 'lightning' })
  await sleep(1500) // 吟唱 0.8s
  const lHit = M.combats.filter((e) => e.kind === 'player_hit_monster' && e.skillId === 'lightning')
  check('闪电直线命中 >=1 只', lHit.length >= 1, `命中 ${lHit.length} 只`)
} else {
  check('闪电直线命中 >=1 只', false, '没有可用目标(前序击杀过多)')
}

// ---------- 11. 治疗术自动选最低血量者 ----------
// 勇者一直在挨打; 法师先撤出治疗范围, 保证范围内只有勇者与僧侣
console.log('-- 法师撤离, 测试治疗选目标 --')
await walkTo(M, 0, -5)
await until(() => P.updates.at(-1)?.mp >= 12, 15000) // 等 MP 回复够
P.combats.length = 0
P.socket.emit('cast_skill', { skillId: 'heal' })
await sleep(1000)
const healEv = P.combats.find((e) => e.kind === 'player_heal' && e.casterId === P.username)
check('治疗术自动选中残血勇者', healEv?.targetId === H.username, `目标 ${healEv?.targetId}`)

// ---------- 12. 强化术全队加攻 + 到期回落 ----------
await until(() => P.updates.at(-1)?.mp >= 20, 20000)
await walkTo(P, 13, 11.5) // 靠近勇者保证在 8 米半径内
H.updates.length = 0
P.socket.emit('cast_skill', { skillId: 'blessing' })
await sleep(600)
check('强化术后勇者 atk 16->20 (+25%)', H.lastAtk() === 20, `实际 ${H.lastAtk()}`)
check('勇者 player_update 带 blessing buff', H.updates.at(-1)?.buffs?.some((b) => b.id === 'blessing'))
console.log('-- 等待 20 秒 Buff 到期 --')
const buffGone = await until(() => H.lastAtk() === 16, 25000, 500)
check('20 秒后 Buff 到期 atk 回落 16', buffGone, `实际 ${H.lastAtk()}`)

// ---------- 13. 击杀掉落(概率性: 史莱姆 10% 掉布衣) ----------
console.log('-- 刷史莱姆测掉落 (最长 150 秒, 概率性) --')
const gainedAlready = () =>
  H.invs.some((d) => d.gained) || M.invs.some((d) => d.gained)
const farmDeadline = Date.now() + 150000
let kills = 0
while (!gainedAlready() && Date.now() < farmDeadline && kills < 40) {
  const me = H.self()
  if (!me) {
    await sleep(300)
    continue
  }
  const targets = H.aliveNear(me.x, me.z, 14)
  if (targets.length === 0) {
    await sleep(600) // 等重生
    continue
  }
  const t = targets[0]
  const d = Math.hypot(t.x - me.x, t.z - me.z)
  if (d > 2.4) {
    await walkTo(H, t.x, t.z, 6000)
    continue
  }
  const before = H.combats.filter((e) => e.killed && e.kind === 'player_hit_monster').length
  H.socket.emit('attack', { targetId: t.id })
  await sleep(900)
  const after = H.combats.filter((e) => e.killed && e.kind === 'player_hit_monster').length
  kills += after - before
}
const gainedEv = [...H.invs, ...M.invs].find((d) => d.gained)
check('击杀掉落装备(inventory_update.gained)', !!gainedEv,
  gainedEv ? `获得 ${gainedEv.gained} 来自 ${gainedEv.gainedFrom}` : `击杀 ${kills} 只未掉落(10%/只, 可重跑)`)
if (gainedEv) {
  check('掉落为史莱姆掉落表物品(布衣)', gainedEv.gained === 'cloth_armor')
}

// ---------- 14. 装备与背包存档(重连不丢) ----------
const heroGainCount = H.invs.filter((d) => d.gained).length
H.socket.disconnect()
await sleep(500)
const H2 = await makeClient(`${TAG}h`, `勇者${TAG}`, 'hero')
await sleep(400)
const eq2 = H2.welcome.character.equipment
check('重连后装备仍在(存档)', eq2?.weapon === 'copper_sword')
check('重连后背包仍在(存档)', Array.isArray(H2.welcome.character.inventory) &&
  H2.welcome.character.inventory.length === heroGainCount,
  `背包 ${JSON.stringify(H2.welcome.character.inventory)}`)
H2.socket.disconnect()

M.socket.disconnect()
P.socket.disconnect()

const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
