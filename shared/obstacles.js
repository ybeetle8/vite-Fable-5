// 全地图障碍物配置(圆形碰撞体), 前后端共享:
// 客户端用于渲染与本地预测, 服务器用于权威移动结算
export const OBSTACLES = {
  novice_plain: [
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
  ],
}
