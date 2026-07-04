// 键盘输入状态(WASD/方向键)
import { useEffect, useRef } from 'react'

export function useKeyboard() {
  const keys = useRef({ forward: false, back: false, left: false, right: false })

  useEffect(() => {
    const map = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
    }
    function down(e) {
      // 输入框聚焦时不响应移动键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const k = map[e.code]
      if (k) keys.current[k] = true
    }
    function up(e) {
      const k = map[e.code]
      if (k) keys.current[k] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return keys
}
