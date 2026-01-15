/**
 * 本地游戏设置页面
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PlayerType } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
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

  // 4个固定位置，默认P1玩家，P2电脑，P3/P4空
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

  // 切换玩家类型
  const togglePlayerType = (index: number) => {
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
  };

  // 添加玩家到指定位置
  const addPlayer = (index: number) => {
    if (slots[index].active) return;
    
    const newSlots = [...slots];
    newSlots[index] = { active: true, type: 'ai' };
    setSlots(newSlots);
  };

  // 移除玩家
  const removePlayer = (index: number) => {
    if (!slots[index].active) return;
    if (activeCount <= 2) return; // 至少保留2个玩家
    
    const newSlots = [...slots];
    newSlots[index] = { active: false, type: 'ai' };
    setSlots(newSlots);
  };

  // 开始游戏
  const handleStart = () => {
    // 只收集活跃玩家
    const players = slots
      .map((slot, index) => ({ name: `P${index + 1}`, type: slot.type, active: slot.active }))
      .filter(p => p.active)
      .map(p => ({ name: p.name, type: p.type }));
    
    initLocalGame(players);
    startGame();
    onStart();
  };

  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <button className="btn btn-secondary" onClick={onBack}>
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
                    className={styles.playerCard}
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
                    className={styles.playerCardEmpty}
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
          className="btn btn-primary btn-large btn-full" 
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
