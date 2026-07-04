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

// 地图配置: 五张地图, portals 为传送点(双向门)
// portal: { x, z, to: 目标地图, tx, tz: 目标出现坐标, label: 显示名 }
export const MAPS = {
  castle_town: {
    id: 'castle_town',
    name: '阿雷夫王城',
    size: 60,
    spawn: { x: 0, z: 0 },
    safe: true, // 全图安全区: 无怪物
    theme: 'town',
    portals: [
      { x: 0, z: 28, to: 'novice_plain', tx: 0, tz: -44, label: '➡ 起始平原' },
    ],
  },
  novice_plain: {
    id: 'novice_plain',
    name: '起始平原',
    size: 100,
    spawn: { x: 0, z: -40 },
    safeRadius: 8, // 出生点局部安全区
    theme: 'plain',
    portals: [
      { x: 0, z: -48, to: 'castle_town', tx: 0, tz: 24, label: '⬅ 阿雷夫王城' },
      { x: 0, z: 48, to: 'mist_forest', tx: 0, tz: -40, label: '➡ 迷雾森林' },
    ],
  },
  mist_forest: {
    id: 'mist_forest',
    name: '迷雾森林',
    size: 90,
    spawn: { x: 0, z: -38 },
    theme: 'forest',
    portals: [
      { x: 0, z: -43, to: 'novice_plain', tx: 0, tz: 44, label: '⬅ 起始平原' },
      { x: 0, z: 43, to: 'rock_cavern', tx: 0, tz: -32, label: '➡ 岩石洞窟' },
    ],
  },
  rock_cavern: {
    id: 'rock_cavern',
    name: '岩石洞窟',
    size: 70,
    spawn: { x: 0, z: -30 },
    theme: 'cavern',
    portals: [
      { x: 0, z: -33, to: 'mist_forest', tx: 0, tz: 39, label: '⬅ 迷雾森林' },
      { x: 0, z: 33, to: 'demon_castle', tx: 0, tz: -26, label: '➡ 魔王城' },
    ],
  },
  demon_castle: {
    id: 'demon_castle',
    name: '魔王城',
    size: 60,
    spawn: { x: 0, z: -24 },
    theme: 'demon',
    portals: [
      { x: 0, z: -28, to: 'rock_cavern', tx: 0, tz: 29, label: '⬅ 岩石洞窟' },
    ],
  },
}

export const DEFAULT_MAP = 'castle_town'
// 死亡复活地图(教会所在地)
export const RESPAWN_MAP = 'castle_town'
// 传送门交互距离
export const PORTAL_RANGE = 2.5
