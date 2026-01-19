/**
 * 骰子容器组件
 * 显示所有5个骰子和摇骰子按钮
 * 手柄操作：A键确认（锁定骰子/摇骰子）
 */

import { useCallback, useContext } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Dice } from './Dice';
import { useGameStore } from '../../store/gameStore';
import { GameFocusContext } from '../../hooks';
import styles from './DiceContainer.module.css';

export function DiceContainer() {
  const { t } = useTranslation();
  const {
    dice,
    rollsLeft,
    isRolling,
    rollDice,
    toggleHoldDice,
    phase,
    mode,
    isLocalPlayerTurn,
  } = useGameStore();

  // 获取游戏焦点状态（可能为 null）
  const gameFocus = useContext(GameFocusContext);

  // 检查是否可以操作
  const isMyTurn = isLocalPlayerTurn();
  const canRoll = rollsLeft > 0 && !isRolling && phase === 'playing' && isMyTurn;
  const canHold = rollsLeft < 3 && !isRolling && isMyTurn;

  // 处理骰子点击
  const handleDiceClick = useCallback((diceId: number) => {
    if (canHold) {
      toggleHoldDice(diceId);
    }
  }, [canHold, toggleHoldDice]);

  // 处理摇骰子
  const handleRoll = useCallback(() => {
    if (canRoll) {
      rollDice();
    }
  }, [canRoll, rollDice]);

  return (
    <div className={styles.container}>
      {/* 骰子区域 */}
      <div className={styles.diceArea}>
        <div className={styles.diceGrid}>
          {dice.map((d, index) => (
            <Dice
              key={d.id}
              dice={d}
              isRolling={isRolling}
              onClick={() => handleDiceClick(d.id)}
              disabled={!canHold}
              focused={gameFocus?.isDiceFocused(index) ?? false}
            />
          ))}
        </div>
      </div>
      
      {/* 控制区域 */}
      <div className={styles.controlArea}>
        <motion.button
          className={`
            ${styles.rollButton} 
            ${!canRoll ? styles.disabled : ''} 
            ${gameFocus?.isRollButtonFocused() ? styles.focused : ''}
          `}
          onClick={handleRoll}
          disabled={!canRoll}
          whileHover={canRoll ? { scale: 1.05 } : {}}
          whileTap={canRoll ? { scale: 0.95 } : {}}
        >
          <span className={isRolling ? styles.rollingIcon : styles.rollIcon}>🎲</span>
          <span className={styles.rollText}>{t('game.roll')}</span>
        </motion.button>
        
        <div className={styles.rollsIndicator}>
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`${styles.rollDot} ${i <= rollsLeft ? styles.active : ''}`}
            />
          ))}
        </div>
        
        {/* 联机模式显示等待提示 */}
        {mode === 'online' && !isMyTurn && (
          <div className={styles.waitingHint}>
            {t('online.waitingForOpponent')}
          </div>
        )}
      </div>
    </div>
  );
}
