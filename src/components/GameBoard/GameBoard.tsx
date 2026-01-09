/**
 * 游戏板组件
 * 单屏布局：骰子区域 + 统一记分板
 */

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { DiceContainer } from '../Dice';
import { ScoreBoard } from '../ScoreCard';
import { OnlineSync } from '../OnlineSync';
import { useGameStore } from '../../store/gameStore';
import styles from './GameBoard.module.css';

export function GameBoard() {
  const { t } = useTranslation();
  const { 
    players, 
    currentPlayerIndex, 
    currentRound, 
    mode,
    isLocalPlayerTurn,
  } = useGameStore();
  
  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = isLocalPlayerTurn();
  
  return (
    <div className={styles.container}>
      {/* 联机同步组件 - 始终渲染 */}
      <OnlineSync />
      
      {/* 顶部信息栏 */}
      <header className={styles.header}>
        <div className={styles.roundInfo}>
          <span className={styles.roundLabel}>{t('game.round')}</span>
          <span className={styles.roundNumber}>{currentRound}/13</span>
        </div>
        
        {currentPlayer && (
          <motion.div 
            className={`${styles.turnInfo} ${isMyTurn ? styles.myTurn : styles.otherTurn}`}
            key={currentPlayerIndex}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {mode === 'local' ? (
              // 本地模式
              currentPlayer.type === 'human' ? (
                <span>🎯 {t('game.yourTurn')}</span>
              ) : (
                <span>🤖 {t('game.aiTurn', { name: currentPlayer.name })}</span>
              )
            ) : (
              // 联机模式
              isMyTurn ? (
                <span>🎯 {t('game.yourTurn')}</span>
              ) : (
                <span>⏳ {currentPlayer.name} 的回合</span>
              )
            )}
          </motion.div>
        )}
      </header>
      
      {/* 主游戏区域 - 计分板在左 */}
      <main className={styles.mainArea}>
        {/* 左侧：记分板 */}
        <section className={styles.scoreSection}>
          <ScoreBoard />
        </section>

        {/* 右侧：骰子区域 */}
        <section className={styles.diceSection}>
          <DiceContainer />
        </section>
      </main>
    </div>
  );
}
