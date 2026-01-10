/**
 * 游戏板组件
 * 单屏布局：骰子区域 + 统一记分板
 */

import { useEffect, useState, useMemo } from 'react';
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

/**
 * 自定义 Hook：检测屏幕是否为竖屏模式
 * 当宽度小于高度时为竖屏
 */
function useIsPortrait() {
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < window.innerHeight;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerWidth < window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    // 也监听屏幕方向变化
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return isPortrait;
}

export function GameBoard({ onBackToMenu }: GameBoardProps) {
  const { t } = useTranslation();
  const {
    mode,
    resetGame,
  } = useGameStore();

  // 检测屏幕方向
  const isPortrait = useIsPortrait();

  // 其他玩家已退出的提示状态
  const [showAllLeftAlert, setShowAllLeftAlert] = useState(false);

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

  // 根据屏幕方向计算样式
  const layoutStyles = useMemo(() => {
    if (isPortrait) {
      // 竖屏：上下布局，底部留出安全区域
      return {
        main: {
          display: 'flex',
          flexDirection: 'column' as const,
          width: '100%',
          height: '100%',
        },
        score: {
          flex: 1,
          width: '100%',
          minHeight: 0,
          overflow: 'auto',
          borderBottom: '1px solid var(--border)',
        },
        dice: {
          flex: 'none',
          width: '100%',
          maxHeight: '35vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(4px, 1.5vw, 12px)',
          paddingBottom: 'max(48px, env(safe-area-inset-bottom, 48px))',
        },
      };
    } else {
      // 横屏：左右布局
      return {
        main: {
          display: 'flex',
          flexDirection: 'row' as const,
          width: '100%',
          height: '100%',
        },
        score: {
          flex: 'none',
          width: 'clamp(240px, 35vw, 420px)',
          height: '100%',
          overflow: 'auto',
          borderRight: '1px solid var(--border)',
        },
        dice: {
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(8px, 2vw, 24px)',
        },
      };
    }
  }, [isPortrait]);

  return (
    <div 
      className={styles.container}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
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
      
      {/* 主游戏区域 */}
      <main style={layoutStyles.main}>
        {/* 记分板 */}
        <section style={layoutStyles.score}>
          <ScoreBoard />
        </section>

        {/* 骰子区域 */}
        <section style={layoutStyles.dice}>
          <DiceContainer />
        </section>
      </main>
    </div>
  );
}
