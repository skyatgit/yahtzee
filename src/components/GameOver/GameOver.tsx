/**
 * 游戏结束组件
 * 显示游戏结果和排名
 * 支持手柄导航
 * 
 * 行为说明：
 * - 本地模式：再来一局重新开始，返回主菜单退出
 * - 联机房主：再来一局回到房间等待页面，返回主菜单解散房间
 * - 联机客户端：再来一局重新加入房间，返回主菜单正常退出
 */

import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { calculateTotalScore } from '../../utils/scoring';
import { useLayoutNavigation, useGamepadConnection } from '../../hooks';
import type { Player } from '../../types/game';
import styles from './GameOver.module.css';

interface GameOverProps {
  /** 最终玩家数据（用于显示排名） */
  players: Player[];
  /** 再来一局回调 */
  onPlayAgain: () => void;
  /** 返回主菜单回调 */
  onBackToMenu: () => void;
  /** 是否为房主 */
  isHost?: boolean;
  /** 是否为联机模式 */
  isOnline?: boolean;
}

export function GameOver({ 
  players, 
  onPlayAgain, 
  onBackToMenu,
  isHost = false,
  isOnline = false,
}: GameOverProps) {
  const { t } = useTranslation();
  const { hasGamepad } = useGamepadConnection();
  
  // 计算排名
  const rankings = useMemo(() => {
    return players
      .map((player, index) => ({
        ...player,
        originalIndex: index,
        totalScore: calculateTotalScore(player.scoreCard)
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [players]);
  
  const winner = rankings[0];
  const isTie = rankings.length > 1 && rankings[0].totalScore === rankings[1].totalScore;
  
  // 处理选择
  const handleSelect = useCallback((itemId: string) => {
    if (itemId === 'playAgain') {
      onPlayAgain();
    } else if (itemId === 'backToMenu') {
      onBackToMenu();
    }
  }, [onPlayAgain, onBackToMenu]);
  
  // 布局：两个按钮水平排列
  const rows = useMemo(() => [
    ['playAgain', 'backToMenu'],
  ], []);
  
  // 使用布局导航
  const { isFocused } = useLayoutNavigation({
    rows,
    onSelect: handleSelect,
    enabled: hasGamepad,
    horizontalLoop: true,
  });
  
  // 根据模式决定按钮文本
  const getPlayAgainText = () => {
    if (isOnline && isHost) {
      // 房主：回到房间等待
      return t('game.playAgain');
    }
    return t('game.playAgain');
  };
  
  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className={styles.modal}
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 15 }}
      >
        <div className={styles.header}>
          <motion.div
            className={styles.trophy}
            animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            🏆
          </motion.div>
          <h2 className={styles.title}>{t('game.gameOver')}</h2>
        </div>
        
        <div className={styles.result}>
          {isTie ? (
            <div className={styles.tie}>
              <span className={styles.tieText}>{t('game.tie')}</span>
              <span className={styles.tieScore}>{winner?.totalScore ?? 0} {t('score.grandTotal')}</span>
            </div>
          ) : winner ? (
            <div className={styles.winner}>
              <span className={styles.winnerLabel}>{t('game.winner')}</span>
              <span className={styles.winnerName}>{winner.name}</span>
              <span className={styles.winnerScore}>{winner.totalScore} {t('common.points')}</span>
            </div>
          ) : null}
        </div>
        
        <div className={styles.rankings}>
          {rankings.map((player, index) => (
            <motion.div
              key={player.id}
              className={`${styles.rankItem} ${index === 0 ? styles.first : ''}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              <span className={styles.rank}>
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
              </span>
              <span className={styles.playerName}>{player.name}</span>
              <span className={styles.playerScore}>{player.totalScore}</span>
            </motion.div>
          ))}
        </div>
        
        <div className={styles.actions}>
          <motion.button
            className={`btn btn-primary btn-large ${isFocused('playAgain') ? styles.focused : ''}`}
            onClick={onPlayAgain}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {getPlayAgainText()}
          </motion.button>
          <motion.button
            className={`btn btn-secondary btn-large ${isFocused('backToMenu') ? styles.focused : ''}`}
            onClick={onBackToMenu}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {t('game.backToMenu')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
