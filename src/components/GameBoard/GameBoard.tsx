/**
 * 游戏板组件
 * 单屏布局：骰子区域 + 统一记分板
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { DiceContainer } from '../Dice';
import { ScoreBoard } from '../ScoreCard';
import { OnlineSync, onAllPlayersLeft } from '../OnlineSync';
import { useGameStore } from '../../store/gameStore';
import { peerService } from '../../services/peerService';
import styles from './GameBoard.module.css';

interface GameBoardProps {
  onBackToMenu?: () => void;
}

export function GameBoard({ onBackToMenu }: GameBoardProps) {
  const { t } = useTranslation();
  const {
    players,
    currentPlayerIndex,
    currentRound,
    mode,
    isLocalPlayerTurn,
    resetGame,
  } = useGameStore();

  // 其他玩家已退出的提示状态
  const [showAllLeftAlert, setShowAllLeftAlert] = useState(false);

  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = isLocalPlayerTurn();

  // 监听所有其他玩家退出事件
  useEffect(() => {
    if (mode !== 'online') return;

    return onAllPlayersLeft(() => {
      setShowAllLeftAlert(true);
    });
  }, [mode]);

  // 处理退出游戏
  const handleExitGame = () => {
    setShowAllLeftAlert(false);
    peerService.disconnect();
    resetGame();
    // 通知父组件返回主菜单
    if (onBackToMenu) {
      onBackToMenu();
    }
  };

  return (
    <div className={styles.container}>
      {/* 联机同步组件 - 始终渲染 */}
      <OnlineSync />

      {/* 其他玩家已退出提示弹窗 */}
      {showAllLeftAlert && (
        <div className={styles.alertOverlay}>
          <motion.div
            className={styles.alertBox}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <p className={styles.alertText}>{t('online.allPlayersLeft')}</p>
            <button className={styles.alertButton} onClick={handleExitGame}>
              {t('common.ok')}
            </button>
          </motion.div>
        </div>
      )}
      
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
