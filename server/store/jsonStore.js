// 简单 JSON 文件持久化: 原子写入(临时文件 + rename)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

export function loadJson(name, fallback) {
  const file = path.join(DATA_DIR, name)
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    console.error(`[store] 读取 ${name} 失败:`, err.message)
    return fallback
  }
}

export function saveJson(name, data) {
  const file = path.join(DATA_DIR, name)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}
