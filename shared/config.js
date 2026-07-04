// 前后端共享的游戏配置与公式
export const CLASSES = {
  hero: {
    id: 'hero',
    name: '勇者',
    desc: '近战坦克，高血量高防御',
    base: { hp: 120, mp: 30, atk: 12, def: 8, spd: 5.0 },
    growth: { hp: 18, mp: 4, atk: 2.5, def: 2.0 },
    model: '/models/knight.glb',
  },
  mage: {
    id: 'mage',
    name: '魔法师',
    desc: '远程输出，攻击魔法强力但脆皮',
    base: { hp: 80, mp: 60, atk: 16, def: 4, spd: 5.0 },
    growth: { hp: 10, mp: 8, atk: 3.5, def: 1.0 },
    model: '/models/mage.glb',
  },
  priest: {
    id: 'priest',
    name: '僧侣',
    desc: '治疗辅助，让队伍立于不败',
    base: { hp: 95, mp: 50, atk: 10, def: 6, spd: 5.0 },
    growth: { hp: 13, mp: 7, atk: 2.0, def: 1.5 },
    model: '/models/priest.glb',
  },
}

// 升到 level+1 级所需经验
export function expToNext(level) {
  return Math.floor(20 * Math.pow(level, 1.6))
}

// 按职业与等级计算基础属性
export function statsForLevel(classId, level) {
  const c = CLASSES[classId]
  const lv = level - 1
  return {
    maxHp: Math.floor(c.base.hp + c.growth.hp * lv),
    maxMp: Math.floor(c.base.mp + c.growth.mp * lv),
    atk: Math.floor(c.base.atk + c.growth.atk * lv),
    def: Math.floor(c.base.def + c.growth.def * lv),
    spd: c.base.spd,
  }
}

// 地图配置(第一期只有起始平原, 王城安全区暂用平原出生点代替)
export const MAPS = {
  novice_plain: {
    id: 'novice_plain',
    name: '起始平原',
    size: 100,            // 正方形边长(米), 以原点为中心 [-50, 50]
    spawn: { x: 0, z: 0 }, // 出生点
    safeRadius: 8,         // 出生点安全区半径: 怪物不进入/不索敌
  },
}

export const DEFAULT_MAP = 'novice_plain'
