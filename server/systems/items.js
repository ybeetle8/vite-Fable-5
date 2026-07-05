// 装备系统(M8): 装备表加载 / 初始装备 / 掉落表 / 属性加成
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ITEMS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf-8'))

export const EQUIP_SLOTS = ['weapon', 'armor', 'shield']
export const INVENTORY_CAP = 30

// 从 items.json 的 starter 字段解析每职业初始三件套: classId -> { weapon, armor, shield }
export const STARTER_GEAR = {}
for (const item of Object.values(ITEMS)) {
  for (const classId of item.starter ?? []) {
    STARTER_GEAR[classId] ??= { weapon: null, armor: null, shield: null }
    STARTER_GEAR[classId][item.slot] = item.id
  }
}

// 反向掉落表: monsterType -> [{ itemId, chance }]
const DROP_TABLE = {}
for (const item of Object.values(ITEMS)) {
  if (!item.drop) continue
  DROP_TABLE[item.drop.monster] ??= []
  DROP_TABLE[item.drop.monster].push({ itemId: item.id, chance: item.drop.chance })
}

// 老角色兼容: 无 equipment 字段则补发职业初始装备, 返回是否有修改
export function ensureEquipment(character) {
  if (character.equipment) return false
  character.equipment = { ...STARTER_GEAR[character.classId] }
  character.inventory = character.inventory ?? []
  return true
}

// 已穿戴装备的攻防加成
export function equipmentBonus(equipment) {
  const bonus = { atk: 0, def: 0 }
  if (!equipment) return bonus
  for (const slot of EQUIP_SLOTS) {
    const item = ITEMS[equipment[slot]]
    if (item) {
      bonus.atk += item.atk
      bonus.def += item.def
    }
  }
  return bonus
}

// 击杀掉落: 逐条独立 roll, 只掉该玩家职业可用的装备; 命中返回 itemId, 否则 null
export function rollDrops(monsterType, classId) {
  for (const entry of DROP_TABLE[monsterType] ?? []) {
    if (!ITEMS[entry.itemId].classes.includes(classId)) continue
    if (Math.random() < entry.chance) return entry.itemId
  }
  return null
}
