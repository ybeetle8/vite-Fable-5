// 世界管理(第一期 M1-M3 精简版):
// 维护在线玩家, 接受移动上报并记录位置(用于存档);
// 完整的 Tick 广播与多人同步在 M4 实现。
import { EVT } from '../../shared/events.js'
import { MAPS } from '../../shared/config.js'
import { saveCharacter } from '../auth/accounts.js'

// username -> { socket, character }
const online = new Map()

export function onPlayerConnect(io, socket, username, character) {
  // 顶号: 同账号旧连接踢下线
  const prev = online.get(username)
  if (prev) {
    prev.socket.emit(EVT.KICKED, { reason: '账号在其他地方登录' })
    prev.socket.disconnect(true)
  }

  online.set(username, { socket, character })
  socket.join(character.map)

  socket.emit(EVT.WELCOME, { character, online: online.size })
  console.log(`[world] ${character.nickname} 进入世界 (在线 ${online.size})`)

  socket.on(EVT.MOVE, (data) => {
    // M3 阶段仅记录位置用于存档, 做边界钳制; M4 起改为服务器权威计算
    if (typeof data?.x !== 'number' || typeof data?.z !== 'number') return
    const half = MAPS[character.map].size / 2
    character.pos = {
      x: Math.max(-half, Math.min(half, data.x)),
      z: Math.max(-half, Math.min(half, data.z)),
    }
  })

  socket.on('disconnect', () => {
    // 顶号时旧 entry 已被新连接覆盖, 不要误删
    if (online.get(username)?.socket === socket) {
      online.delete(username)
      saveCharacter(username, { pos: character.pos, map: character.map })
      console.log(`[world] ${character.nickname} 离开世界 (在线 ${online.size})`)
    }
  })
}

// 定时存档在线玩家位置
setInterval(() => {
  for (const [username, { character }] of online) {
    saveCharacter(username, { pos: character.pos, map: character.map })
  }
}, 60_000)
