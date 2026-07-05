// 角色面板(M8): C 键开关, 属性总览 + 装备三栏(点击卸下) + 背包列表(点击穿戴)
import { useSyncExternalStore } from 'react'
import { CLASSES } from '../../shared/config.js'
import { ITEMS } from '../game/gameData.js'
import { sendEquip, sendUnequip } from '../game/net/socket.js'
import { worldStore } from '../game/net/worldStore.js'

const SLOT_LABELS = { weapon: '武器', armor: '盔甲', shield: '盾牌' }
const INVENTORY_CAP = 30

function useSelfStats() {
  return useSyncExternalStore(worldStore.subscribeStats, worldStore.getSelfStats)
}
function useSelfInventory() {
  return useSyncExternalStore(worldStore.subscribeInventory, worldStore.getSelfInventory)
}

function itemTip(item) {
  const parts = []
  if (item.atk) parts.push(`攻击 +${item.atk}`)
  if (item.def) parts.push(`防御 +${item.def}`)
  return `${item.name}(${SLOT_LABELS[item.slot]}) ${parts.join(' ')}`
}

export default function CharacterPanel({ character, onClose }) {
  const stats = useSelfStats()
  const inv = useSelfInventory()
  const cls = CLASSES[character.classId]

  const equipment = inv?.equipment ?? {}
  const inventory = inv?.inventory ?? []
  const hasBlessing = stats?.buffs?.some((b) => b.id === 'blessing')

  // 装备加成拆分显示
  let eqAtk = 0
  let eqDef = 0
  for (const slot of Object.keys(SLOT_LABELS)) {
    const item = ITEMS[equipment[slot]]
    if (item) {
      eqAtk += item.atk
      eqDef += item.def
    }
  }

  return (
    <div className="char-panel dq-panel">
      <div className="char-panel-head">
        <span>{character.nickname} 的角色面板</span>
        <button className="char-close" onClick={onClose}>✕ (C)</button>
      </div>

      <div className="char-panel-body">
        {/* 左: 属性 */}
        <div className="char-stats">
          <div className="char-row"><span>职业</span><b>{cls.name}</b></div>
          <div className="char-row"><span>等级</span><b>Lv.{stats?.level ?? 1}</b></div>
          <div className="char-row"><span>HP</span><b>{stats?.hp}/{stats?.maxHp}</b></div>
          <div className="char-row"><span>MP</span><b>{stats?.mp}/{stats?.maxMp}</b></div>
          <div className={`char-row${hasBlessing ? ' buffed' : ''}`}>
            <span>攻击</span>
            <b>{stats?.atk}{eqAtk > 0 && <i className="char-bonus">(+{eqAtk})</i>}{hasBlessing && ' ✨'}</b>
          </div>
          <div className="char-row">
            <span>防御</span>
            <b>{stats?.def}{eqDef > 0 && <i className="char-bonus">(+{eqDef})</i>}</b>
          </div>
          <div className="char-row"><span>经验</span><b>{stats?.exp}/{stats?.expNext}</b></div>
          <div className="char-row"><span>金币</span><b>{stats?.gold} G</b></div>
        </div>

        {/* 右: 装备三栏 */}
        <div className="char-equips">
          {Object.entries(SLOT_LABELS).map(([slot, label]) => {
            const item = ITEMS[equipment[slot]]
            return (
              <div
                key={slot}
                className={`equip-slot${item ? '' : ' empty'}`}
                title={item ? `${itemTip(item)} · 点击卸下` : `${label}(空)`}
                onClick={() => item && sendUnequip(slot)}
              >
                <span className="equip-icon">{item ? item.icon : '·'}</span>
                <span className="equip-info">
                  <span className="equip-label">{label}</span>
                  <span className="equip-name">{item ? item.name : '未装备'}</span>
                  {item && (
                    <span className="equip-stat">
                      {item.atk > 0 && `攻+${item.atk} `}
                      {item.def > 0 && `防+${item.def}`}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 下: 背包装备列表 */}
      <div className="char-inv-head">背包装备({inventory.length}/{INVENTORY_CAP})</div>
      <div className="char-inv">
        {inventory.length === 0 && <div className="char-inv-empty">击败怪物有几率获得装备</div>}
        {inventory.map((itemId, i) => {
          const item = ITEMS[itemId]
          if (!item) return null
          const usable = item.classes.includes(character.classId)
          return (
            <div
              key={`${itemId}-${i}`}
              className={`inv-item${usable ? '' : ' unusable'}`}
              title={usable ? `${itemTip(item)} · 点击穿戴` : `${itemTip(item)} · 职业不可用`}
              onClick={() => usable && sendEquip(itemId)}
            >
              <span className="inv-icon">{item.icon}</span>
              <span className="inv-name">{item.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
