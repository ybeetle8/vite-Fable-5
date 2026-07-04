// 起始平原障碍物(树干/石头)的圆形碰撞体
// 独立文件: 场景渲染与玩家碰撞共用, 未来也便于与服务器共享
export const OBSTACLES = [
  { x: 10, z: -8, r: 0.8, type: 'tree' },
  { x: -14, z: 12, r: 0.8, type: 'tree' },
  { x: 22, z: 18, r: 0.8, type: 'tree' },
  { x: -25, z: -20, r: 0.8, type: 'tree' },
  { x: 35, z: -30, r: 0.8, type: 'tree' },
  { x: -38, z: 28, r: 0.8, type: 'tree' },
  { x: 18, z: 36, r: 0.8, type: 'tree' },
  { x: -8, z: -35, r: 0.8, type: 'tree' },
  { x: 30, z: 5, r: 1.2, type: 'rock' },
  { x: -20, z: -5, r: 1.0, type: 'rock' },
  { x: 5, z: 25, r: 1.4, type: 'rock' },
  { x: -35, z: -32, r: 1.1, type: 'rock' },
]
