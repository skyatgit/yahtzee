/**
 * 本地游戏设置页面
 */

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PlayerType } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { 
  useLayoutNavigation, 
  useGamepadConnection,
  useResponsiveColumns,
  generateGridRows,
  LOCAL_SETUP_BREAKPOINTS,
} from '../../hooks';
import styles from './LocalSetup.module.css';

interface PlayerSlot {
  active: boolean;  // 是否有玩家
  type: PlayerType;
}

interface LocalSetupProps {
  onBack: () => void;
  onStart: () => void;
}

export function LocalSetup({ onBack, onStart }: LocalSetupProps) {
  const { t } = useTranslation();
  const { initLocalGame, startGame } = useGameStore();
  const { hasGamepad } = useGamepadConnection();

  // 8个固定位置，默认P1玩家，P2电脑，其余空
  const [slots, setSlots] = useState<PlayerSlot[]>([
    { active: true, type: 'human' },
    { active: true, type: 'ai' },
    { active: false, type: 'ai' },
    { active: false, type: 'ai' },
    { active: false, type: 'ai' },
    { active: false, type: 'ai' },
    { active: false, type: 'ai' },
    { active: false, type: 'ai' }
  ]);

  // 计算活跃玩家数
  const activeCount = slots.filter(s => s.active).length;
  
  // 响应式列数检测（默认4列，小屏幕2列）
  const gridColumns = useResponsiveColumns(4, LOCAL_SETUP_BREAKPOINTS);

  // 切换玩家类型
  const togglePlayerType = useCallback((index: number) => {
    if (!slots[index].active) return;

    const currentType = slots[index].type;
    const newType: PlayerType = currentType === 'human' ? 'ai' : 'human';

    // 检查是否已有一个人类玩家
    const humanCount = slots.filter((s, i) => i !== index && s.active && s.type === 'human').length;
    if (newType === 'human' && humanCount >= 1) {
      return;
    }

    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], type: newType };
    setSlots(newSlots);
  }, [slots]);

  // 添加玩家到指定位置
  const addPlayer = useCallback((index: number) => {
    if (slots[index].active) return;

    const newSlots = [...slots];
    newSlots[index] = { active: true, type: 'ai' };
    setSlots(newSlots);
  }, [slots]);

  // 移除玩家
  const removePlayer = useCallback((index: number) => {
    if (!slots[index].active) return;
    if (activeCount <= 2) return; // 至少保留2个玩家

    const newSlots = [...slots];
    newSlots[index] = { active: false, type: 'ai' };
    setSlots(newSlots);
  }, [slots, activeCount]);

  // 开始游戏
  const handleStart = useCallback(() => {
    // 只收集活跃玩家
    const players = slots
      .map((slot, index) => ({ name: `P${index + 1}`, type: slot.type, active: slot.active }))
      .filter(p => p.active)
      .map(p => ({ name: p.name, type: p.type }));

    initLocalGame(players);
    startGame();
    onStart();
  }, [slots, initLocalGame, startGame, onStart]);

  // 处理项目选择
  const handleSelect = useCallback((itemId: string) => {
    if (itemId === 'back') {
      onBack();
    } else if (itemId === 'start') {
      handleStart();
    } else if (itemId.startsWith('slot-')) {
      const index = parseInt(itemId.replace('slot-', ''));
      if (slots[index].active) {
        togglePlayerType(index);
      } else {
        addPlayer(index);
      }
    }
  }, [onBack, handleStart, slots, togglePlayerType, addPlayer]);

  // 处理踢人（手柄 X 键）
  const handleKick = useCallback((itemId: string) => {
    if (itemId.startsWith('slot-')) {
      const index = parseInt(itemId.replace('slot-', ''));
      if (slots[index].active && activeCount > 2) {
        removePlayer(index);
      }
    }
  }, [slots, activeCount, removePlayer]);

  // 根据响应式列数动态生成导航行
  const rows = useMemo(() => {
    // 8个槽位的 ID
    const slotIds = Array.from({ length: 8 }, (_, i) => `slot-${i}`);
    // 按当前列数生成网格行
    const slotRows = generateGridRows(slotIds, gridColumns);
    
    // 完整布局：返回按钮 + 槽位网格 + 开始按钮
    return [
      ['back'],
      ...slotRows,
      ['start'],
    ];
  }, [gridColumns]);

  // 使用布局导航
  const { isFocused } = useLayoutNavigation({
    rows,
    onSelect: handleSelect,
    onCancel: onBack,
    onKick: handleKick,
    enabled: hasGamepad,
  });

  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <button
            className={`btn btn-secondary ${isFocused('back') ? styles.focused : ''}`}
            onClick={onBack}
          >
            ← {t('menu.back')}
          </button>
          <h2 className={styles.title}>{t('menu.localGame')}</h2>
        </div>

        <div className={styles.card}>
          {/* 玩家列表 */}
          <div className={styles.section}>
            <label className={styles.label}>{t('setup.players')} ({activeCount}/8)</label>
            <div className={styles.playerGrid}>
              {slots.map((slot, index) => (
                slot.active ? (
                  // 有玩家的位置
                  <motion.div
                    key={index}
                    className={`${styles.playerCard} ${isFocused(`slot-${index}`) ? styles.focused : ''}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    {/* 移除按钮（至少保留2人） */}
                    {activeCount > 2 && (
                      <button
                        className={styles.removeButton}
                        onClick={() => removePlayer(index)}
                        title={t('online.kick')}
                        aria-label={t('online.kick')}
                      />
                    )}
                    <div className={styles.playerBadge} data-player={index + 1}>
                      P{index + 1}
                    </div>
                    <div className={styles.playerMeta}>
                      <motion.button
                        className={`${styles.typeToggle} ${slot.type === 'human' ? styles.human : styles.ai}`}
                        onClick={() => togglePlayerType(index)}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className={styles.typeIcon}>{slot.type === 'human' ? '👤' : '🤖'}</span>
                        <span className={styles.typeText}>{t(`setup.${slot.type}`)}</span>
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  // 空位 - 可点击添加
                  <motion.div
                    key={index}
                    className={`${styles.playerCardEmpty} ${isFocused(`slot-${index}`) ? styles.focused : ''}`}
                    onClick={() => addPlayer(index)}
                    whileHover={{ scale: 1.02, opacity: 0.8 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={styles.emptySlot}>+</div>
                    <span className={styles.addText}>{t('setup.addPlayer')}</span>
                  </motion.div>
                )
              ))}
            </div>
          </div>
        </div>

        {/* 开始按钮 */}
        <motion.button
          className={`btn btn-primary btn-large btn-full ${isFocused('start') ? styles.focused : ''}`}
          onClick={handleStart}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {t('menu.start')}
        </motion.button>
      </motion.div>
    </div>
  );
}
