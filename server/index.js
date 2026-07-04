// 游戏服务器入口: HTTP API(注册/登录/角色) + Socket.IO(游戏实时通信)
import http from 'node:http'
import { Server } from 'socket.io'
import { SERVER_PORT } from '../shared/events.js'
import { CLASSES } from '../shared/config.js'
import { register, verifyLogin, getAccount, createCharacter } from './auth/accounts.js'
import { createSession, verifyToken } from './auth/sessions.js'
import { onPlayerConnect } from './world/world.js'

// ---------- HTTP API ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 10_000) req.destroy() // 防超大 body
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('bad json')) }
    })
    req.on('error', reject)
  })
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

const routes = {
  'GET /api/health': async (req, res) => {
    send(res, 200, { ok: true, ts: Date.now() })
  },

  'POST /api/register': async (req, res) => {
    const { username, password } = await readBody(req)
    const r = register(username, password)
    send(res, r.ok ? 200 : 400, r)
  },

  'POST /api/login': async (req, res) => {
    const { username, password } = await readBody(req)
    const r = verifyLogin(username, password)
    if (!r.ok) return send(res, 401, r)
    const token = createSession(username)
    send(res, 200, {
      ok: true,
      token,
      character: r.account.character, // null 表示还没建角色
      classes: CLASSES,
    })
  },

  'POST /api/character': async (req, res) => {
    const { token, nickname, classId } = await readBody(req)
    const username = verifyToken(token)
    if (!username) return send(res, 401, { ok: false, error: '会话已失效，请重新登录' })
    const r = createCharacter(username, nickname, classId)
    send(res, r.ok ? 200 : 400, r)
  },
}

const httpServer = http.createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`
  const handler = routes[key]
  if (!handler) return send(res, 404, { ok: false, error: 'not found' })
  try {
    await handler(req, res)
  } catch (err) {
    console.error(`[http] ${key} 处理出错:`, err.message)
    send(res, 400, { ok: false, error: '请求格式错误' })
  }
})

// ---------- Socket.IO ----------
const io = new Server(httpServer, {
  // 开发期通过 Vite 代理访问为同源; 直连时放开跨域
  cors: { origin: true },
})

// 握手鉴权中间件
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  const username = verifyToken(token)
  if (!username) return next(new Error('unauthorized'))
  const acc = getAccount(username)
  if (!acc?.character) return next(new Error('no character'))
  socket.data.username = username
  next()
})

io.on('connection', (socket) => {
  const username = socket.data.username
  const character = getAccount(username).character
  onPlayerConnect(io, socket, username, character)
})

httpServer.listen(SERVER_PORT, () => {
  console.log(`[server] 游戏服务器已启动: http://localhost:${SERVER_PORT}`)
})
