// Socket.IO 客户端封装
import { io } from 'socket.io-client'
import { EVT } from '../../../shared/events.js'

let socket = null

export function connectGame(token, handlers = {}) {
  socket = io('/', {
    auth: { token },
    // 通过 Vite 代理同源连接
    transports: ['websocket'],
  })

  socket.on(EVT.WELCOME, (d) => handlers.onWelcome?.(d))
  socket.on(EVT.KICKED, (d) => handlers.onKicked?.(d))
  socket.on('connect_error', (e) => handlers.onError?.(e))
  socket.on('disconnect', (reason) => handlers.onDisconnect?.(reason))

  return socket
}

export function getSocket() {
  return socket
}

// M3 阶段: 客户端定时上报自身位置(供服务器存档), M4 改为输入上报 + 服务器权威
export function reportPosition(x, z) {
  socket?.emit(EVT.MOVE, { x, z })
}

export function disconnectGame() {
  socket?.disconnect()
  socket = null
}
