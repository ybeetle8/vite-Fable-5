// 内存会话: 登录成功后签发 Token, Socket.IO 握手时校验
import crypto from 'node:crypto'

// token -> { username, createdAt }
const sessions = new Map()
// username -> token (一个账号只保留最新一个会话)
const byUser = new Map()

const SESSION_TTL = 1000 * 60 * 60 * 12 // 12 小时

export function createSession(username) {
  // 同账号旧会话作废(顶号的第一步, socket 层还会踢旧连接)
  const old = byUser.get(username)
  if (old) sessions.delete(old)

  const token = crypto.randomBytes(24).toString('hex')
  sessions.set(token, { username, createdAt: Date.now() })
  byUser.set(username, token)
  return token
}

export function verifyToken(token) {
  const s = sessions.get(token)
  if (!s) return null
  if (Date.now() - s.createdAt > SESSION_TTL) {
    sessions.delete(token)
    byUser.delete(s.username)
    return null
  }
  return s.username
}
