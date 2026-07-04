// 远程玩家: 从 worldStore 快照缓冲插值渲染 + 动画切换
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { CLASSES } from '../../../shared/config.js'
import { worldStore } from '../net/worldStore.js'
import Nameplate from './Nameplate.jsx'

// 渲染延迟: 落后服务器 2 个快照(100ms), 保证总有两帧可插值
const RENDER_DELAY_MS = 100

export default function RemotePlayer({ id }) {
  const entry = worldStore.getRemote(id)
  const cls = CLASSES[entry?.info.classId ?? 'hero']
  const group = useRef()

  const { scene, animations } = useGLTF(cls.model)
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { actions } = useAnimations(animations, group)
  const animRef = useRef('')

  function playAnim(name) {
    if (animRef.current === name || !actions[name]) return
    const prev = actions[animRef.current]
    const action = actions[name].reset()
    // 死亡动画只播一次并定格在最后一帧, 避免循环反复倒地
    if (name === 'Death_A') {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = false
    }
    action.fadeIn(0.15).play()
    prev?.fadeOut(0.15)
    animRef.current = name
  }

  useFrame(() => {
    const r = worldStore.getRemote(id)
    if (!r || !group.current || r.buffer.length === 0) return

    // 死亡: 播死亡动画, 不再插值移动
    if (r.info.dead) {
      playAnim('Death_A')
      return
    }

    const renderT = Date.now() - RENDER_DELAY_MS
    const buf = r.buffer

    // 找到 renderT 两侧的快照做线性插值
    let a = buf[0]
    let b = buf[buf.length - 1]
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= renderT) {
        a = buf[i]
        b = buf[i + 1] ?? buf[i]
        break
      }
    }
    const span = b.t - a.t
    const k = span > 0 ? THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1) : 1

    group.current.position.x = THREE.MathUtils.lerp(a.x, b.x, k)
    group.current.position.z = THREE.MathUtils.lerp(a.z, b.z, k)

    // 朝向按最短弧插值
    let diff = b.facing - a.facing
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    group.current.rotation.y = a.facing + diff * k

    playAnim(b.moving ? 'Running_A' : 'Idle')
  })

  if (!entry) return null
  const { info } = entry

  return (
    <group ref={group} position={[info.x, 0, info.z]}>
      <primitive object={model} />
      <Nameplate
        nickname={info.nickname}
        level={info.level}
        hp={info.hp}
        maxHp={info.maxHp}
        getStats={() => worldStore.getRemote(id)?.info}
        color="#aee6ff"
      />
    </group>
  )
}
