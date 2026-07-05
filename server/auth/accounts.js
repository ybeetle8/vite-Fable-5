// 账号服务: 注册 / 登录 / 角色创建, 数据存 JSON
import bcrypt from 'bcryptjs'
import { loadJson, saveJson } from '../store/jsonStore.js'
import { CLASSES, DEFAULT_MAP, MAPS, statsForLevel } from '../../shared/config.js'
import { STARTER_GEAR } from '../systems/items.js'

const FILE = 'accounts.json'

// accounts: { [username]: { username, passwordHash, createdAt, character: null | {...} } }
const accounts = loadJson(FILE, {})

function persist() {
  saveJson(FILE, accounts)
}

const USERNAME_RE = /^[a-zA-Z0-9_一-龥]{2,16}$/

export function register(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return { ok: false, error: '用户名需为 2-16 位字母/数字/下划线/中文' }
  }
  if (typeof password !== 'string' || password.length < 4 || password.length > 32) {
    return { ok: false, error: '密码长度需为 4-32 位' }
  }
  if (accounts[username]) {
    return { ok: false, error: '用户名已存在' }
  }
  accounts[username] = {
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
    character: null,
  }
  persist()
  console.log(`[auth] 新账号注册: ${username}`)
  return { ok: true }
}

export function verifyLogin(username, password) {
  const acc = accounts[username]
  if (!acc || !bcrypt.compareSync(password ?? '', acc.passwordHash)) {
    return { ok: false, error: '用户名或密码错误' }
  }
  return { ok: true, account: acc }
}

export function getAccount(username) {
  return accounts[username] ?? null
}

const NICKNAME_RE = /^[a-zA-Z0-9_一-龥]{1,12}$/

export function createCharacter(username, nickname, classId) {
  const acc = accounts[username]
  if (!acc) return { ok: false, error: '账号不存在' }
  if (acc.character) return { ok: false, error: '该账号已有角色' }
  if (typeof nickname !== 'string' || !NICKNAME_RE.test(nickname)) {
    return { ok: false, error: '昵称需为 1-12 位字母/数字/下划线/中文' }
  }
  if (!CLASSES[classId]) return { ok: false, error: '无效的职业' }
  if (Object.values(accounts).some((a) => a.character?.nickname === nickname)) {
    return { ok: false, error: '昵称已被占用' }
  }

  const stats = statsForLevel(classId, 1)
  acc.character = {
    nickname,
    classId,
    level: 1,
    exp: 0,
    gold: 0,
    hp: stats.maxHp,
    mp: stats.maxMp,
    map: DEFAULT_MAP,
    pos: { ...MAPS[DEFAULT_MAP].spawn },
    equipment: { ...STARTER_GEAR[classId] }, // 初始装备直接穿上
    inventory: [],
  }
  persist()
  console.log(`[auth] ${username} 创建角色: ${nickname}(${CLASSES[classId].name})`)
  return { ok: true, character: acc.character }
}

// 保存角色运行时状态(位置等), 供世界层调用
export function saveCharacter(username, patch) {
  const acc = accounts[username]
  if (!acc?.character) return
  Object.assign(acc.character, patch)
  persist()
}
