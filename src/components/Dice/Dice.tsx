/**
 * 骰子组件
 * 显示单个骰子，支持滚动动画和锁定状态
 */

import { useState, useEffect, useRef, useMemo } from 'react';
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
  // 动画显示的点数（仅在滚动时随机变化）
  const [animationValue, setAnimationValue] = useState<DiceValue>(dice.value);
  const intervalRef = useRef<number | null>(null);
  
  // 判断是否处于滚动状态（未锁定且正在滚动）
  const isActuallyRolling = isRolling && !dice.isHeld;
  
  // 计算实际显示的值：滚动时显示动画值，否则显示实际值
  const displayValue = useMemo(() => {
    return isActuallyRolling ? animationValue : dice.value;
  }, [isActuallyRolling, animationValue, dice.value]);
  
  // 处理滚动动画
  useEffect(() => {
    if (isActuallyRolling) {
      // 开始滚动：快速随机变化点数
      intervalRef.current = window.setInterval(() => {
        setAnimationValue(randomValue());
      }, 80); // 每80ms换一次点数
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // 停止滚动：清除定时器
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isActuallyRolling]);
  
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
    </motion.div>
  );
}
