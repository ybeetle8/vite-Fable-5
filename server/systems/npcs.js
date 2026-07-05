// NPC 系统(M9): NPC 表加载 / 距离校验 / 商店买卖 / 旅馆
// ctx 由 world.js 注入: { pushSelfUpdate, pushInventory }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVT } from '../../shared/events.js'
import { NPC_RANGE } from '../../shared/config.js'
import { ITEMS, INVENTORY_CAP } from './items.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const NPCS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/npcs.json'), 'utf-8'))

// 玩家是否在 NPC 交互范围内(同图 + 距离容差 0.5 抵消延迟)
export function npcInRange(player, npcId) {
  const npc = NPCS[npcId]
  if (!npc || npc.map !== player.character.map) return null
  const d = Math.hypot(npc.x - player.character.pos.x, npc.z - player.character.pos.z)
  return d <= NPC_RANGE + 0.5 ? npc : null
}

export function sellPrice(item) {
  return Math.floor(item.price / 2)
}

// 旅馆费用: 与等级线性同步, 约等于 2~3 只当前等级怪的金币
export function innCost(level) {
  return level * 5
}

function result(player, payload) {
  player.socket.emit(EVT.NPC_RESULT, payload)
}

// 购买: 校验 NPC 类型/货架/金币/背包容量
export function handleShopBuy(ctx, player, data) {
  const npc = npcInRange(player, data?.npcId)
  if (!npc || npc.type !== 'shop') return
  const item = ITEMS[data?.itemId]
  if (!item || !npc.sells.includes(item.slot)) return
  if (player.character.gold < item.price) {
    return result(player, { action: 'buy', ok: false, reason: 'gold', itemId: item.id })
  }
  if (player.character.inventory.length >= INVENTORY_CAP) {
    return result(player, { action: 'buy', ok: false, reason: 'bag_full', itemId: item.id })
  }

  player.character.gold -= item.price
  player.character.inventory.push(item.id)
  ctx.pushSelfUpdate(player)
  ctx.pushInventory(player)
  result(player, { action: 'buy', ok: true, itemId: item.id, cost: item.price })
}

// 出售: 按背包下标(同名装备可重复), 半价回收
export function handleShopSell(ctx, player, data) {
  const npc = npcInRange(player, data?.npcId)
  if (!npc || npc.type !== 'shop') return
  const index = data?.index
  const itemId = Number.isInteger(index) ? player.character.inventory[index] : undefined
  const item = ITEMS[itemId]
  if (!item) return

  player.character.inventory.splice(index, 1)
  const gain = sellPrice(item)
  player.character.gold += gain
  ctx.pushSelfUpdate(player)
  ctx.pushInventory(player)
  result(player, { action: 'sell', ok: true, itemId, gold: gain })
}

// 旅馆: 付费回满 HP/MP
export function handleInnRest(ctx, player, data) {
  const npc = npcInRange(player, data?.npcId)
  if (!npc || npc.type !== 'inn') return
  const cost = innCost(player.character.level)
  if (player.character.gold < cost) {
    return result(player, { action: 'inn', ok: false, reason: 'gold', cost })
  }

  player.character.gold -= cost
  const stats = ctx.playerStats(player)
  player.character.hp = stats.maxHp
  player.character.mp = stats.maxMp
  ctx.pushSelfUpdate(player)
  result(player, { action: 'inn', ok: true, cost })
}
