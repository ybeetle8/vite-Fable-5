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
  // Windows 下目标文件被杀毒/编辑器短暂占用时 rename 会抛 EPERM, 重试几次后降级为直接覆盖
  for (let i = 0; i < 3; i++) {
    try {
      fs.renameSync(tmp, file)
      return
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err
    }
  }
  try {
    fs.copyFileSync(tmp, file)
    fs.unlinkSync(tmp)
  } catch (err) {
    console.error(`[store] 写入 ${name} 失败(已保留 ${name}.tmp):`, err.message)
  }
}
