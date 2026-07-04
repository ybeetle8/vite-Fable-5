// 全地图障碍物配置(圆形碰撞体), 前后端共享:
// 客户端用于渲染与本地预测, 服务器用于权威移动结算
export const OBSTACLES = {
  castle_town: [
    // 城堡主楼(北侧)
    { x: 0, z: -20, r: 6, type: 'castle' },
    // 两侧房屋
    { x: -15, z: -8, r: 3, type: 'house' },
    { x: 15, z: -8, r: 3, type: 'house' },
    { x: -18, z: 6, r: 3, type: 'house' },
    { x: 18, z: 6, r: 3, type: 'house' },
    // 中央喷泉
    { x: 0, z: 8, r: 2, type: 'fountain' },
    // 树木点缀
    { x: -8, z: 18, r: 0.8, type: 'tree' },
    { x: 8, z: 18, r: 0.8, type: 'tree' },
    { x: -24, z: -18, r: 0.8, type: 'tree' },
    { x: 24, z: -18, r: 0.8, type: 'tree' },
  ],
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
  mist_forest: [
    // 森林: 密集树木
    { x: -12, z: -20, r: 0.9, type: 'tree' },
    { x: 14, z: -18, r: 0.9, type: 'tree' },
    { x: -22, z: -8, r: 0.9, type: 'tree' },
    { x: 25, z: -5, r: 0.9, type: 'tree' },
    { x: -8, z: 0, r: 0.9, type: 'tree' },
    { x: 10, z: 5, r: 0.9, type: 'tree' },
    { x: -28, z: 10, r: 0.9, type: 'tree' },
    { x: 30, z: 12, r: 0.9, type: 'tree' },
    { x: -15, z: 22, r: 0.9, type: 'tree' },
    { x: 18, z: 25, r: 0.9, type: 'tree' },
    { x: -32, z: 30, r: 0.9, type: 'tree' },
    { x: 6, z: 33, r: 0.9, type: 'tree' },
    { x: 33, z: -25, r: 0.9, type: 'tree' },
    { x: -35, z: -28, r: 0.9, type: 'tree' },
    { x: 3, z: -12, r: 1.1, type: 'rock' },
    { x: -25, z: 20, r: 1.0, type: 'rock' },
  ],
  rock_cavern: [
    // 洞窟: 石柱与巨岩
    { x: -10, z: -15, r: 1.6, type: 'pillar' },
    { x: 12, z: -12, r: 1.6, type: 'pillar' },
    { x: -18, z: 0, r: 1.6, type: 'pillar' },
    { x: 20, z: 3, r: 1.6, type: 'pillar' },
    { x: -8, z: 15, r: 1.6, type: 'pillar' },
    { x: 10, z: 18, r: 1.6, type: 'pillar' },
    { x: 0, z: 0, r: 2.0, type: 'rock' },
    { x: -25, z: -22, r: 1.8, type: 'rock' },
    { x: 26, z: 22, r: 1.8, type: 'rock' },
    { x: 25, z: -20, r: 1.4, type: 'rock' },
    { x: -26, z: 20, r: 1.4, type: 'rock' },
  ],
  demon_castle: [
    // 魔王城: 尖刺石柱阵
    { x: -12, z: -12, r: 1.4, type: 'spike' },
    { x: 12, z: -12, r: 1.4, type: 'spike' },
    { x: -18, z: 2, r: 1.4, type: 'spike' },
    { x: 18, z: 2, r: 1.4, type: 'spike' },
    { x: -10, z: 14, r: 1.4, type: 'spike' },
    { x: 10, z: 14, r: 1.4, type: 'spike' },
    // 王座台(最深处, BOSS 位)
    { x: 0, z: 20, r: 3, type: 'throne' },
  ],
}
