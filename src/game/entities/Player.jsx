// 玩家角色(M5): 本地预测移动 + 空格普攻 + 攻击/死亡动画 + 复活传送
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { CLASSES, MAPS } from '../../../shared/config.js'
import { stepPosition } from '../../../shared/movement.js'
import { ATTACK_RANGE, ATTACK_COOLDOWN } from '../../../shared/combat.js'
import { useKeyboard } from '../input/useKeyboard.js'
import { reportMove, sendAttack } from '../net/socket.js'
import { worldStore } from '../net/worldStore.js'
import Nameplate from './Nameplate.jsx'

const UP = new THREE.Vector3(0, 1, 0)
const SNAP_DIST = 3
const CORRECT_RATE = 4

// 职业 -> 攻击动画
const ATTACK_ANIM = {
  hero: '1H_Melee_Attack_Slice_Diagonal',
  mage: 'Spellcast_Shoot',
  priest: '2H_Melee_Attack_Spin',
}

export default function Player({ character, posRef }) {
  const cls = CLASSES[character.classId]
  const map = MAPS[character.map]
  const group = useRef()
  const keys = useKeyboard()
  const { camera, gl } = useThree()

  const { scene, animations } = useGLTF(cls.model)
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { actions } = useAnimations(animations, group)

  const state = useRef({
    pos: { x: character.pos.x, z: character.pos.z },
    facing: 0,
    anim: '',
    camYaw: Math.PI,
    camPitch: 0.45,
    camDist: 8,
    lastSent: { dx: 0, dz: 0, facing: 0 },
    sendCooldown: 0,
    attackCooldown: 0,
    attackAnimUntil: 0, // 攻击动画播放期间锁定动画切换
    dead: false,
  })

  // 空格普攻
  useEffect(() => {
    function onKey(e) {
      if (e.code !== 'Space' || e.repeat) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const s = state.current
      if (s.dead || s.attackCooldown > 0) return

      const target = worldStore.nearestAliveMonster(s.pos, ATTACK_RANGE + 0.3)
      if (!target) return

      s.attackCooldown = ATTACK_COOLDOWN
      // 面向目标
      s.facing = Math.atan2(target.x - s.pos.x, target.z - s.pos.z)
      // 播攻击动画(锁 0.5s)
      const animName = ATTACK_ANIM[character.classId]
      if (actions[animName]) {
        const prev = actions[s.anim]
        actions[animName].reset().setLoop(THREE.LoopOnce).fadeIn(0.05).play()
        prev?.fadeOut(0.05)
        s.anim = animName
        s.attackAnimUntil = performance.now() + 500
      }
      sendAttack(target.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, character.classId])

  // 鼠标右键旋转镜头 + 滚轮缩放
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    function onDown(e) {
      if (e.button === 2) dragging = true
    }
    function onUp(e) {
      if (e.button === 2) dragging = false
    }
    function onMove(e) {
      if (!dragging) return
      const s = state.current
      s.camYaw -= e.movementX * 0.005
      s.camPitch = THREE.MathUtils.clamp(s.camPitch + e.movementY * 0.005, 0.1, 1.2)
    }
    function onWheel(e) {
      const s = state.current
      s.camDist = THREE.MathUtils.clamp(s.camDist + e.deltaY * 0.01, 3, 16)
    }
    function onCtx(e) {
      e.preventDefault()
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('contextmenu', onCtx)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', onMove)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onCtx)
    }
  }, [gl])

  function playAnim(name) {
    const s = state.current
    if (s.anim === name || !actions[name]) return
    // 攻击动画播放中不被移动动画打断
    if (performance.now() < s.attackAnimUntil && name !== 'Death_A') return
    const prev = actions[s.anim]
    const action = actions[name].reset()
    // 死亡动画只播一次并定格在最后一帧(倒地姿势), 避免循环反复倒地
    if (name === 'Death_A') {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = false
    }
    action.fadeIn(0.15).play()
    prev?.fadeOut(0.15)
    s.anim = name
  }

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const s = state.current
    const k = keys.current
    s.attackCooldown = Math.max(0, s.attackCooldown - delta)

    // 死亡/复活状态来自服务器快照
    const server = worldStore.getSelfServerPos()
    const stats = worldStore.getSelfStats()
    const isDead = (stats?.hp ?? 1) <= 0
    if (isDead && !s.dead) {
      s.dead = true
      playAnim('Death_A')
    } else if (!isDead && s.dead) {
      // 复活: 吸附到服务器位置(出生点)
      s.dead = false
      if (server) s.pos = { x: server.x, z: server.z }
      playAnim('Idle')
    }

    let moving = false
    let dir = { x: 0, z: 0 }

    if (!s.dead) {
      let mx = 0
      let mz = 0
      if (k.forward) mz -= 1
      if (k.back) mz += 1
      if (k.left) mx -= 1
      if (k.right) mx += 1
      moving = mx !== 0 || mz !== 0

      if (moving) {
        const v = new THREE.Vector3(mx, 0, mz).normalize().applyAxisAngle(UP, s.camYaw)
        dir = { x: v.x, z: v.z }
        s.pos = stepPosition(s.pos, dir, cls.base.spd, delta, character.map, map.size)
        const targetFacing = Math.atan2(dir.x, dir.z)
        let diff = targetFacing - s.facing
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        s.facing += diff * Math.min(1, delta * 12)
        playAnim('Running_A')
      } else {
        playAnim('Idle')
      }

      // 服务器权威纠正
      if (server) {
        const ex = server.x - s.pos.x
        const ez = server.z - s.pos.z
        const err = Math.hypot(ex, ez)
        if (err > SNAP_DIST) {
          s.pos = { x: server.x, z: server.z }
        } else if (!moving && err > 0.02) {
          const t = Math.min(1, delta * CORRECT_RATE)
          s.pos = { x: s.pos.x + ex * t, z: s.pos.z + ez * t }
        }
      }
    }

    // 上报移动意图
    s.sendCooldown -= delta
    const last = s.lastSent
    const changed =
      Math.abs(dir.x - last.dx) > 0.01 ||
      Math.abs(dir.z - last.dz) > 0.01 ||
      (moving && Math.abs(s.facing - last.facing) > 0.05)
    if (changed || (moving && s.sendCooldown <= 0)) {
      reportMove(dir.x, dir.z, s.facing)
      s.lastSent = { dx: dir.x, dz: dir.z, facing: s.facing }
      s.sendCooldown = 0.1
    }

    if (group.current) {
      group.current.position.set(s.pos.x, 0, s.pos.z)
      group.current.rotation.y = s.facing
    }
    // 供 DamagePopups 等外部读取自身位置
    if (posRef) posRef.current = s.pos

    // 第三人称跟随镜头
    const offset = new THREE.Vector3(
      Math.sin(s.camYaw) * Math.cos(s.camPitch),
      Math.sin(s.camPitch),
      Math.cos(s.camYaw) * Math.cos(s.camPitch),
    ).multiplyScalar(s.camDist)
    camera.position.set(s.pos.x + offset.x, offset.y + 1.2, s.pos.z + offset.z)
    camera.lookAt(s.pos.x, 1.4, s.pos.z)
  })

  const stats = worldStore.getSelfStats()

  return (
    <group ref={group}>
      <primitive object={model} />
      <Nameplate
        nickname={character.nickname}
        level={stats?.level ?? character.level}
        hp={stats?.hp ?? character.hp}
        maxHp={stats?.maxHp ?? character.hp}
        color="#ffd75e"
      />
    </group>
  )
}

useGLTF.preload(CLASSES.hero.model)
useGLTF.preload(CLASSES.mage.model)
useGLTF.preload(CLASSES.priest.model)
