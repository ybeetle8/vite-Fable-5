// 前后端共享的 Socket.IO 事件名常量
export const EVT = {
  // C -> S
  MOVE: 'move',
  ATTACK: 'attack',
  CAST_SKILL: 'cast_skill',         // { skillId, targetId? }
  EQUIP_ITEM: 'equip_item',         // { itemId } 从背包穿上
  UNEQUIP_ITEM: 'unequip_item',     // { slot } 卸下到背包
  CHAT: 'chat',
  CHANGE_MAP: 'change_map',

  // S -> C
  WELCOME: 'welcome',               // 连接成功, 下发自身角色与世界初始状态
  WORLD_SNAPSHOT: 'world_snapshot', // Tick 广播: 本图实体状态
  ENTITY_ENTER: 'entity_enter',
  ENTITY_LEAVE: 'entity_leave',
  COMBAT_RESULT: 'combat_result',
  CHAT_BROADCAST: 'chat_broadcast',
  PLAYER_UPDATE: 'player_update',
  SKILL_RESULT: 'skill_result',         // 施法表现: { phase: 'cast'|'hit'|'fail', ... }
  INVENTORY_UPDATE: 'inventory_update', // { equipment, inventory, gained?, gainedFrom?, full? }
  MAP_CHANGED: 'map_changed',       // 切图完成: 下发新图初始状态
  KICKED: 'kicked',                 // 顶号/被踢下线
}

export const SERVER_PORT = 62002
export const TICK_RATE = 20 // 每秒 Tick 次数
