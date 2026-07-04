// Socket.IO 客户端封装
import { io } from 'socket.io-client'
import { EVT } from '../../../shared/events.js'
import { worldStore } from './worldStore.js'

let socket = null

export function connectGame(token, handlers = {}) {
  socket = io('/', {
    auth: { token },
    // 通过 Vite 代理同源连接
    transports: ['websocket'],
  })

  socket.on(EVT.WELCOME, (d) => {
    worldStore.setSelfId(d.selfId)
    for (const p of d.players ?? []) worldStore.addRemote(p)
    worldStore.setInitialMonsters(d.monsters ?? [])
    handlers.onWelcome?.(d)
  })
  socket.on(EVT.WORLD_SNAPSHOT, (snap) => worldStore.applySnapshot(snap))
  socket.on(EVT.ENTITY_ENTER, (p) => worldStore.addRemote(p))
  socket.on(EVT.ENTITY_LEAVE, ({ id }) => worldStore.removeRemote(id))
  socket.on(EVT.COMBAT_RESULT, (ev) => worldStore.applyCombat(ev))
  socket.on(EVT.PLAYER_UPDATE, (stats) => worldStore.setSelfStats(stats))
  socket.on(EVT.CHAT_BROADCAST, (msg) => handlers.onChat?.(msg))
  socket.on(EVT.MAP_CHANGED, (d) => {
    // 清空旧图实体, 装入新图初始状态
    worldStore.resetEntities(d.players ?? [], d.monsters ?? [])
    handlers.onMapChanged?.(d)
  })
  socket.on(EVT.KICKED, (d) => handlers.onKicked?.(d))
  socket.on('connect_error', (e) => handlers.onError?.(e))
  socket.on('disconnect', (reason) => handlers.onDisconnect?.(reason))

  return socket
}

export function getSocket() {
  return socket
}

// 上报移动意图: 方向单位向量 + 朝向
export function reportMove(dx, dz, facing) {
  socket?.emit(EVT.MOVE, { dx, dz, facing })
}

// 请求攻击目标
export function sendAttack(targetId) {
  socket?.emit(EVT.ATTACK, { targetId })
}

// 发送聊天
export function sendChat(text) {
  socket?.emit(EVT.CHAT, { text })
}

// 请求传送(需站在传送点附近, 服务器校验)
export function requestChangeMap() {
  socket?.emit(EVT.CHANGE_MAP)
}

export function disconnectGame() {
  socket?.disconnect()
  socket = null
  worldStore.clear()
}
