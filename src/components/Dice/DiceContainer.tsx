/**
 * 骰子容器组件
 * 显示所有5个骰子和摇骰子按钮
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Dice } from './Dice';
import { useGameStore } from '../../store/gameStore';
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
  
  // 检查是否可以操作
  const isMyTurn = isLocalPlayerTurn();
  const canRoll = rollsLeft > 0 && !isRolling && phase === 'rolling' && isMyTurn;
  const canHold = rollsLeft < 3 && !isRolling && isMyTurn;
  
  return (
    <div className={styles.container}>
      {/* 骰子区域 */}
      <div className={styles.diceArea}>
        <div className={styles.diceGrid}>
          {dice.map((d) => (
            <Dice
              key={d.id}
              dice={d}
              isRolling={isRolling}
              onClick={() => toggleHoldDice(d.id)}
              disabled={!canHold}
            />
          ))}
        </div>
      </div>
      
      {/* 控制区域 */}
      <div className={styles.controlArea}>
        <motion.button
          className={`${styles.rollButton} ${!canRoll ? styles.disabled : ''}`}
          onClick={() => rollDice()}
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
