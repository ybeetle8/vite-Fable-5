// 任务系统(M9): 主线任务链 接取/交付/击杀进度钩子
// ctx 由 world.js 注入: { gainExpGold, pushSelfUpdate, pushInventory }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVT } from '../../shared/events.js'
import { INVENTORY_CAP } from './items.js'
import { npcInRange } from './npcs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const QUESTS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/quests.json'), 'utf-8'))

// 老角色兼容: 无 quests 字段则补空结构, 返回是否修改
export function ensureQuests(character) {
  if (character.quests) return false
  character.quests = { active: {}, completed: [] }
  return true
}

function questPayload(character) {
  return {
    active: Object.entries(character.quests.active).map(([id, q]) => ({
      id,
      progress: q.progress,
    })),
    completed: character.quests.completed,
  }
}

// 推送任务全量状态; extra.toast 供客户端弹进度提示
export function pushQuests(player, extra = {}) {
  player.socket.emit(EVT.QUEST_UPDATE, { ...questPayload(player.character), ...extra })
}

function result(player, payload) {
  player.socket.emit(EVT.NPC_RESULT, payload)
}

// 接取: 校验 NPC 距离/归属/前置/未接未完
export function handleQuestAccept(ctx, player, data) {
  const quest = QUESTS[data?.questId]
  if (!quest) return
  if (!npcInRange(player, quest.npc)) {
    return result(player, { action: 'accept', ok: false, reason: 'range' })
  }
  const qs = player.character.quests
  if (qs.active[quest.id] || qs.completed.includes(quest.id)) return
  if (quest.prereq && !qs.completed.includes(quest.prereq)) {
    return result(player, { action: 'accept', ok: false, reason: 'prereq' })
  }

  qs.active[quest.id] = { progress: 0 }
  pushQuests(player)
  result(player, { action: 'accept', ok: true, questId: quest.id })
}

// 按职业解析装备奖励(itemsByClass 值可为 null 表示该职业无装备)
function rewardItems(quest, classId) {
  const items = [...(quest.reward.items ?? [])]
  const byClass = quest.reward.itemsByClass?.[classId]
  if (byClass) items.push(byClass)
  return items
}

// 交付: 校验距离/达标/背包容量, 发放经验/金币/装备
export function handleQuestComplete(ctx, player, data) {
  const quest = QUESTS[data?.questId]
  if (!quest) return
  if (!npcInRange(player, quest.npc)) {
    return result(player, { action: 'complete', ok: false, reason: 'range' })
  }
  const qs = player.character.quests
  const state = qs.active[quest.id]
  if (!state || state.progress < quest.goal) {
    return result(player, { action: 'complete', ok: false, reason: 'unfinished' })
  }
  const items = rewardItems(quest, player.character.classId)
  if (player.character.inventory.length + items.length > INVENTORY_CAP) {
    return result(player, { action: 'complete', ok: false, reason: 'bag_full' })
  }

  delete qs.active[quest.id]
  qs.completed.push(quest.id)
  const extraGold = quest.reward.goldByClass?.[player.character.classId] ?? 0
  for (const itemId of items) player.character.inventory.push(itemId)
  if (items.length > 0) ctx.pushInventory(player)
  ctx.gainExpGold(player, quest.reward.exp, quest.reward.gold + extraGold)
  pushQuests(player)
  result(player, {
    action: 'complete',
    ok: true,
    questId: quest.id,
    exp: quest.reward.exp,
    gold: quest.reward.gold + extraGold,
    items,
  })
}

// 击杀钩子: 由 grantReward 调用, kill 直接计数, collect 按概率计数
export function onMonsterKilled(player, monsterCfg) {
  const qs = player.character.quests
  if (!qs) return
  for (const [id, state] of Object.entries(qs.active)) {
    const quest = QUESTS[id]
    if (!quest || quest.target !== monsterCfg.id) continue
    if (state.progress >= quest.goal) continue
    if (quest.type === 'collect' && Math.random() >= quest.chance) continue
    state.progress += 1
    pushQuests(player, {
      toast: {
        questId: id,
        progress: state.progress,
        goal: quest.goal,
        done: state.progress >= quest.goal,
      },
    })
  }
}
