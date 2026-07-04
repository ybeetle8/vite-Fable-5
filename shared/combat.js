// 战斗公式, 前后端共享(客户端仅用于表现预估, 结算以服务器为准)
export const ATTACK_RANGE = 2.2      // 普攻射程(米)
export const ATTACK_COOLDOWN = 0.8   // 普攻冷却(秒)

// 基础伤害公式: 攻击 - 防御/2, 带 ±15% 浮动, 至少 1 点
export function computeDamage(atk, def, rand = Math.random()) {
  const base = Math.max(1, atk - def / 2)
  const factor = 0.85 + rand * 0.3
  return Math.max(1, Math.round(base * factor))
}
