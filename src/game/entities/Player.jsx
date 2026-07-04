// 玩家角色: GLB 模型 + Idle/Run 动画切换 + WASD 移动(相对镜头朝向) + 第三人称跟随镜头
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { CLASSES, MAPS } from '../../../shared/config.js'
import { useKeyboard } from '../input/useKeyboard.js'
import { reportPosition } from '../net/socket.js'
import { OBSTACLES } from '../scenes/obstacles.js'

const UP = new THREE.Vector3(0, 1, 0)

export default function Player({ character }) {
  const cls = CLASSES[character.classId]
  const map = MAPS[character.map]
  const group = useRef()
  const keys = useKeyboard()
  const { camera, gl } = useThree()

  const { scene, animations } = useGLTF(cls.model)
  // SkeletonUtils.clone 保证蒙皮骨骼正确克隆(后续多人共用同一模型必需)
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { actions } = useAnimations(animations, group)

  // 运行时状态(不进 React state, 每帧更新)
  const state = useRef({
    pos: new THREE.Vector3(character.pos.x, 0, character.pos.z),
    facing: 0,               // 角色朝向(弧度)
    anim: '',
    camYaw: Math.PI,          // 镜头水平角
    camPitch: 0.45,           // 镜头俯仰角
    camDist: 8,               // 镜头距离
    lastReport: 0,
  })

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
    const prev = actions[s.anim]
    actions[name].reset().fadeIn(0.15).play()
    prev?.fadeOut(0.15)
    s.anim = name
  }

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1) // 切后台回来防大步跳跃
    const s = state.current
    const k = keys.current

    // 相对镜头朝向的移动向量
    let mx = 0
    let mz = 0
    if (k.forward) mz -= 1
    if (k.back) mz += 1
    if (k.left) mx -= 1
    if (k.right) mx += 1
    const moving = mx !== 0 || mz !== 0

    if (moving) {
      const dir = new THREE.Vector3(mx, 0, mz)
        .normalize()
        .applyAxisAngle(UP, s.camYaw)
      const next = s.pos.clone().addScaledVector(dir, cls.base.spd * delta)

      // 地图边界钳制
      const half = map.size / 2 - 1
      next.x = THREE.MathUtils.clamp(next.x, -half, half)
      next.z = THREE.MathUtils.clamp(next.z, -half, half)

      // 简单圆形障碍碰撞: 推出重叠
      for (const ob of OBSTACLES) {
        const dx = next.x - ob.x
        const dz = next.z - ob.z
        const distSq = dx * dx + dz * dz
        const minDist = ob.r + 0.5
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const d = Math.sqrt(distSq)
          next.x = ob.x + (dx / d) * minDist
          next.z = ob.z + (dz / d) * minDist
        }
      }

      s.pos.copy(next)
      // 平滑转身到移动方向
      const targetFacing = Math.atan2(dir.x, dir.z)
      let diff = targetFacing - s.facing
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      s.facing += diff * Math.min(1, delta * 12)
      playAnim('Running_A')
    } else {
      playAnim('Idle')
    }

    if (group.current) {
      group.current.position.copy(s.pos)
      group.current.rotation.y = s.facing
    }

    // 第三人称跟随镜头(球面坐标)
    const offset = new THREE.Vector3(
      Math.sin(s.camYaw) * Math.cos(s.camPitch),
      Math.sin(s.camPitch),
      Math.cos(s.camYaw) * Math.cos(s.camPitch),
    ).multiplyScalar(s.camDist)
    camera.position.copy(s.pos).add(offset).add(new THREE.Vector3(0, 1.2, 0))
    camera.lookAt(s.pos.x, s.pos.y + 1.4, s.pos.z)

    // 每 200ms 上报一次位置(存档用)
    s.lastReport += delta
    if (s.lastReport > 0.2) {
      s.lastReport = 0
      reportPosition(s.pos.x, s.pos.z)
    }
  })

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(CLASSES.hero.model)
useGLTF.preload(CLASSES.mage.model)
useGLTF.preload(CLASSES.priest.model)
