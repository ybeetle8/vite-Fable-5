// 前端技能/装备配置: 直接引用服务器配置表(Vite 支持 JSON import), 一份数据两端共用
import SKILLS_RAW from '../../server/data/skills.json'
import ITEMS_RAW from '../../server/data/items.json'

export const SKILLS = SKILLS_RAW
export const ITEMS = ITEMS_RAW

// classId -> [slot1 技能, slot2 技能, slot3 技能]
export const SKILLS_BY_CLASS = {}
for (const skill of Object.values(SKILLS)) {
  SKILLS_BY_CLASS[skill.classId] ??= []
  SKILLS_BY_CLASS[skill.classId][skill.slot - 1] = skill
}
