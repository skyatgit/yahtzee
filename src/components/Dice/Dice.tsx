/**
 * 骰子组件
 * 显示单个骰子，支持滚动动画和锁定状态
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { Dice as DiceType, DiceValue } from '../../types/game';
import styles from './Dice.module.css';

interface DiceProps {
  dice: DiceType;
  isRolling: boolean;
  onClick: () => void;
  disabled: boolean;
}

// 骰子点数布局
const dotPatterns: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

// 生成随机点数
const randomValue = (): DiceValue => (Math.floor(Math.random() * 6) + 1) as DiceValue;

export function Dice({ dice, isRolling, onClick, disabled }: DiceProps) {
  // 显示的点数（动画过程中随机变化）
  const [displayValue, setDisplayValue] = useState<DiceValue>(dice.value);
  const intervalRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (isRolling && !dice.isHeld) {
      // 开始滚动：快速随机变化点数
      intervalRef.current = window.setInterval(() => {
        setDisplayValue(randomValue());
      }, 80); // 每80ms换一次点数
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      // 停止滚动：显示最终点数
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplayValue(dice.value);
    }
  }, [isRolling, dice.isHeld, dice.value]);
  
  const dots = dotPatterns[displayValue] || [];
  
  // 滚动动画
  const rollVariants = {
    rolling: {
      rotate: [0, 15, -15, 10, -10, 5, -5, 0],
      scale: [1, 1.1, 0.95, 1.05, 0.98, 1.02, 1],
      transition: {
        duration: 0.8,
        ease: "easeInOut" as const,
        repeat: Infinity,
        repeatType: "loop" as const
      }
    },
    idle: {
      rotate: 0,
      scale: 1,
      transition: {
        duration: 0.15
      }
    }
  };
  
  return (
    <motion.div
      className={`${styles.diceWrapper} ${dice.isHeld ? styles.held : ''} ${disabled ? styles.disabled : ''}`}
      onClick={() => !disabled && onClick()}
      whileHover={!disabled ? { y: -4 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      <motion.div
        className={styles.dice}
        variants={rollVariants}
        animate={isRolling && !dice.isHeld ? 'rolling' : 'idle'}
      >
        <div className={styles.diceFace}>
          {dots.map((pos, index) => (
            <motion.div
              key={`${displayValue}-${index}`}
              className={styles.dot}
              style={{
                gridRow: pos[0] + 1,
                gridColumn: pos[1] + 1
              }}
              initial={isRolling ? { scale: 0.5, opacity: 0.5 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.05 }}
            />
          ))}
        </div>
      </motion.div>
      {dice.isHeld && (
        <motion.div 
          className={styles.holdIndicator}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          锁定
        </motion.div>
      )}
    </motion.div>
  );
}
