// 前端技能/装备/NPC/任务配置: 直接引用服务器配置表(Vite 支持 JSON import), 一份数据两端共用
import SKILLS_RAW from '../../server/data/skills.json'
import ITEMS_RAW from '../../server/data/items.json'
import NPCS_RAW from '../../server/data/npcs.json'
import QUESTS_RAW from '../../server/data/quests.json'

export const SKILLS = SKILLS_RAW
export const ITEMS = ITEMS_RAW
export const NPCS = NPCS_RAW
export const QUESTS = QUESTS_RAW

// classId -> [slot1 技能, slot2 技能, slot3 技能]
export const SKILLS_BY_CLASS = {}
for (const skill of Object.values(SKILLS)) {
  SKILLS_BY_CLASS[skill.classId] ??= []
  SKILLS_BY_CLASS[skill.classId][skill.slot - 1] = skill
}

// npcId -> 按主线顺序排列的任务列表
export const QUESTS_BY_NPC = {}
for (const quest of Object.values(QUESTS).sort((a, b) => a.chain - b.chain)) {
  QUESTS_BY_NPC[quest.npc] ??= []
  QUESTS_BY_NPC[quest.npc].push(quest)
}

export const QUEST_TOTAL = Object.keys(QUESTS).length
