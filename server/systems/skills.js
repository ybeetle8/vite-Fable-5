// 技能系统(M8): 配置加载 + 施法校验 + 按类型结算 + 吟唱
// ctx 由 world.js 注入: { io, playersInMap, playerStats, grantReward, pushSelfUpdate }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVT } from '../../shared/events.js'
import { getMonsters, findMonster, damageMonster } from './monsters.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SKILLS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/skills.json'), 'utf-8'))

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

function fail(player, skillId, reason) {
  player.socket.emit(EVT.SKILL_RESULT, { phase: 'fail', skillId, reason })
}

// C->S cast_skill 入口: 校验后立即结算或进入吟唱
export function handleCastSkill(ctx, player, data) {
  if (player.character.hp <= 0) return
  const skill = SKILLS[data?.skillId]
  if (!skill || skill.classId !== player.character.classId) return
  if (player.casting) return fail(player, skill.id, 'cd')
  if (Date.now() < (player.skillReadyAt[skill.id] ?? 0)) return fail(player, skill.id, 'cd')
  if (player.character.mp < skill.mp) return fail(player, skill.id, 'mp')

  const targetId = data?.targetId ?? null
  // 单体伤害技能施法前先验目标, 避免白吟唱
  if (skill.type === 'damage' && !validDamageTarget(player, skill, targetId)) {
    return fail(player, skill.id, 'target')
  }

  if (skill.castTime > 0) {
    player.casting = { skillId: skill.id, targetId, remain: skill.castTime }
    player.moving = false
    player.dir = { x: 0, z: 0 }
    ctx.io.to(player.character.map).emit(EVT.SKILL_RESULT, {
      phase: 'cast',
      casterId: player.username,
      skillId: skill.id,
      castTime: skill.castTime,
    })
    return
  }
  resolveSkill(ctx, player, skill, targetId)
}

// 吟唱打断(移动/死亡时由 world.js 调用)
export function cancelCast(player) {
  if (!player.casting) return
  fail(player, player.casting.skillId, 'interrupted')
  player.casting = null
}

// Tick 驱动吟唱进度, 归零结算
export function tickCasting(ctx, player, delta) {
  if (!player.casting) return
  player.casting.remain -= delta
  if (player.casting.remain > 0) return
  const { skillId, targetId } = player.casting
  player.casting = null
  resolveSkill(ctx, player, SKILLS[skillId], targetId)
}

function validDamageTarget(player, skill, targetId) {
  const m = findMonster(player.character.map, targetId)
  if (!m || m.state === 'dead') return false
  return dist(m.pos, player.character.pos) <= skill.range + 0.5
}

// 命中一只怪: 伤害 + 可选 debuff + 仇恨 + 广播 + 击杀奖励
function hitMonster(ctx, player, skill, m) {
  const atk = ctx.playerStats(player).atk * skill.mult
  const { dmg, killed } = damageMonster(m, atk)
  if (!killed && skill.debuff) {
    m.debuffs[skill.debuff.id] = { remain: skill.debuff.duration, factor: skill.debuff.factor }
  }
  if (m.state === 'chase' && !m.target) m.target = player.username
  ctx.io.to(player.character.map).emit(EVT.COMBAT_RESULT, {
    kind: 'player_hit_monster',
    attackerId: player.username,
    targetId: m.id,
    skillId: skill.id,
    dmg,
    hp: m.hp,
    killed,
  })
  if (killed) ctx.grantReward(player, m.cfg)
  return m.id
}

// 治疗一名玩家(含自己), 广播 player_heal
function healPlayer(ctx, caster, skill, target) {
  const stats = ctx.playerStats(target)
  const amount = Math.round(ctx.playerStats(caster).atk * skill.mult)
  target.character.hp = Math.min(stats.maxHp, target.character.hp + amount)
  ctx.io.to(caster.character.map).emit(EVT.COMBAT_RESULT, {
    kind: 'player_heal',
    casterId: caster.username,
    targetId: target.username,
    amount,
    hp: target.character.hp,
  })
  ctx.pushSelfUpdate(target)
  return target.username
}

// 按技能类型结算; 成功后扣 MP / 进冷却 / 广播 hit
function resolveSkill(ctx, player, skill, targetId) {
  if (player.character.hp <= 0) return
  const pos = player.character.pos
  const mapId = player.character.map
  const alivePlayers = () =>
    ctx.playersInMap(mapId).filter((p) => p.character.hp > 0)
  const aliveMonsters = () =>
    getMonsters(mapId).filter((m) => m.state !== 'dead')
  let targets = []

  switch (skill.type) {
    case 'damage': {
      const m = findMonster(mapId, targetId)
      if (!m || m.state === 'dead' || dist(m.pos, pos) > skill.range + 0.5) {
        return fail(player, skill.id, 'target')
      }
      targets = [hitMonster(ctx, player, skill, m)]
      break
    }

    case 'aoe_self': {
      for (const m of aliveMonsters()) {
        if (dist(m.pos, pos) <= skill.radius) targets.push(hitMonster(ctx, player, skill, m))
      }
      break
    }

    case 'line': {
      // 以服务器已知朝向为准, 投影在 [0, length] 且垂距 <= width/2 即命中
      const dir = { x: Math.sin(player.facing), z: Math.cos(player.facing) }
      for (const m of aliveMonsters()) {
        const rx = m.pos.x - pos.x
        const rz = m.pos.z - pos.z
        const t = rx * dir.x + rz * dir.z
        if (t < 0 || t > skill.length) continue
        const perp = Math.hypot(rx - t * dir.x, rz - t * dir.z)
        if (perp <= skill.width / 2) targets.push(hitMonster(ctx, player, skill, m))
      }
      break
    }

    case 'taunt': {
      for (const m of aliveMonsters()) {
        if (dist(m.pos, pos) > skill.radius) continue
        m.target = player.username
        if (m.state === 'idle' || m.state === 'patrol' || m.state === 'return') {
          m.state = 'chase'
        }
        targets.push(m.id)
      }
      break
    }

    case 'heal': {
      // 自动选范围内 HP 比例最低的活玩家(含自己)
      let best = player
      let bestRatio = player.character.hp / ctx.playerStats(player).maxHp
      for (const p of alivePlayers()) {
        if (p === player || dist(p.character.pos, pos) > skill.range) continue
        const ratio = p.character.hp / ctx.playerStats(p).maxHp
        if (ratio < bestRatio) {
          best = p
          bestRatio = ratio
        }
      }
      targets = [healPlayer(ctx, player, skill, best)]
      break
    }

    case 'heal_aoe': {
      for (const p of alivePlayers()) {
        if (p === player || dist(p.character.pos, pos) <= skill.radius) {
          targets.push(healPlayer(ctx, player, skill, p))
        }
      }
      break
    }

    case 'buff': {
      for (const p of alivePlayers()) {
        if (p !== player && dist(p.character.pos, pos) > skill.radius) continue
        p.buffs[skill.buff.id] = { remain: skill.buff.duration }
        targets.push(p.username)
        ctx.pushSelfUpdate(p)
      }
      break
    }
  }

  player.character.mp -= skill.mp
  player.skillReadyAt[skill.id] = Date.now() + skill.cd * 1000
  ctx.pushSelfUpdate(player)
  ctx.io.to(mapId).emit(EVT.SKILL_RESULT, {
    phase: 'hit',
    casterId: player.username,
    skillId: skill.id,
    x: pos.x,
    z: pos.z,
    facing: player.facing,
    targetId: skill.type === 'damage' ? targetId : null,
    targets,
  })
}
