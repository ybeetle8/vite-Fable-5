// M4 多人同步自动化测试:
// 两个模拟客户端 A/B 登录同一地图, 验证:
// 1. B 上线时 A 收到 entity_enter
// 2. A 移动, B 通过 world_snapshot 看到 A 位置持续变化, 且与服务器权威速度一致
// 3. A 停止后位置不再漂移
// 4. A 断线, B 收到 entity_leave
// 运行: 先启动服务器(npm run server), 再 node test-server/test-sync.js
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

async function makeClient(username, nickname, classId) {
  await api('/api/register', { username, password: 'test1234' })
  const login = await api('/api/login', { username, password: 'test1234' })
  if (!login.character) {
    await api('/api/character', { token: login.token, nickname, classId })
  }
  const socket = io(BASE, { auth: { token: login.token }, transports: ['websocket'] })
  const c = { socket, snapshots: [], enters: [], leaves: [], welcome: null }
  socket.on('welcome', (d) => (c.welcome = d))
  socket.on('world_snapshot', (s) => {
    c.snapshots.push(s)
    if (c.snapshots.length > 200) c.snapshots.shift()
  })
  socket.on('entity_enter', (p) => c.enters.push(p))
  socket.on('entity_leave', (p) => c.leaves.push(p))
  await new Promise((resolve, reject) => {
    socket.on('welcome', resolve)
    socket.on('connect_error', reject)
    setTimeout(() => reject(new Error(username + ' 连接超时')), 5000)
  })
  return c
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 开始 ----------
console.log('== M4 多人同步测试 ==')

const A = await makeClient('sync_test_a', '测试甲', 'hero')
await sleep(300)
const B = await makeClient('sync_test_b', '测试乙', 'mage')
await sleep(500)

// 1. 互相可见
check('B 的 welcome 中包含已在线的 A', B.welcome.players?.some((p) => p.nickname === '测试甲'))
check('A 收到 B 上线的 entity_enter', A.enters.some((p) => p.nickname === '测试乙'))

// 2. A 向 +x 移动 2 秒, B 应看到 A 的 x 持续增长
const findA = (snap) => snap.players.find((p) => p.id === 'sync_test_a')
B.snapshots.length = 0
A.socket.emit('move', { dx: 1, dz: 0, facing: Math.PI / 2 })
await sleep(2000)
A.socket.emit('move', { dx: 0, dz: 0, facing: Math.PI / 2 })
await sleep(300)

const seen = B.snapshots.map(findA).filter(Boolean)
check('B 收到快照(20TPS, 2秒应有约40个)', seen.length >= 30, `实际 ${B.snapshots.length} 个`)
const startX = seen[0]?.x ?? 0
const endX = seen[seen.length - 1]?.x ?? 0
const moved = endX - startX
// 勇者速度 5.0, 2 秒理论位移 10
check('B 看到 A 移动距离接近权威值(≈10)', Math.abs(moved - 10) < 1.5, `实际 ${moved.toFixed(2)}`)
const monotonic = seen.every((p, i) => i === 0 || p.x >= seen[i - 1].x - 0.01)
check('A 的位置单调平滑无回跳', monotonic)

// 3. 停止后不漂移
B.snapshots.length = 0
await sleep(600)
const stopped = B.snapshots.map(findA).filter(Boolean)
const drift = stopped.length >= 2
  ? Math.abs(stopped[stopped.length - 1].x - stopped[0].x)
  : 0
check('A 停止后位置不漂移', drift < 0.01, `漂移 ${drift.toFixed(4)}`)

// 4. 非法输入不导致异常移动
B.snapshots.length = 0
A.socket.emit('move', { dx: 999, dz: NaN, facing: 'bad' })
await sleep(500)
const afterBad = B.snapshots.map(findA).filter(Boolean)
const badDrift = afterBad.length >= 2
  ? Math.hypot(
      afterBad[afterBad.length - 1].x - afterBad[0].x,
      afterBad[afterBad.length - 1].z - afterBad[0].z,
    )
  : 0
check('非法 move 输入被拒绝(不产生移动)', badDrift < 0.01, `位移 ${badDrift.toFixed(4)}`)

// 5. A 断线, B 收到 entity_leave
A.socket.disconnect()
await sleep(500)
check('A 断线后 B 收到 entity_leave', B.leaves.some((p) => p.id === 'sync_test_a'))

B.socket.disconnect()

const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
