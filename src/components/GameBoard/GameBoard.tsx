/**
 * 游戏板组件
 * 单屏布局：骰子区域 + 统一记分板
 * 手柄操作：方向键导航，A确认，B返回
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { DiceContainer } from '../Dice';
import { ScoreBoard } from '../ScoreCard';
import { OnlineSync, onAllPlayersLeft, onConnectionStatusChange, type DisconnectReasonExtended } from '../OnlineSync';
import { useGameStore } from '../../store/gameStore';
import { peerService, type ConnectionStatus } from '../../services/peerService';
import { useGamepadConnection, useGameFocusProvider, GameFocusProvider, useGamepadVibration } from '../../hooks';
import type { ScoreCategory } from '../../types/game';
import styles from './GameBoard.module.css';

interface GameBoardProps {
  onBackToMenu?: () => void;
}

// 所有计分项（按顺序）
const ALL_SCORE_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'chance',
  'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee'
];

/**
 * 自定义 Hook：检测屏幕是否为竖屏模式
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
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return isPortrait;
}

// 获取断开原因的提示文字
function getDisconnectMessage(t: (key: string, options?: Record<string, unknown>) => string, reason?: DisconnectReasonExtended): string {
  switch (reason) {
    case 'self_network':
      return t('online.disconnectSelfNetwork');
    case 'peer_network':
      return t('online.disconnectPeerNetwork');
    case 'peer_left':
      return t('online.disconnectPeerLeft');
    case 'host_network':
      return t('online.disconnectHostNetwork');
    case 'host_left':
      return t('online.hostLeft');
    case 'kicked':
      return t('online.kicked');
    default:
      return t('online.allPlayersLeft');
  }
}

export function GameBoard({ onBackToMenu }: GameBoardProps) {
  const { t } = useTranslation();
  const {
    mode,
    resetGame,
    dice,
    rollsLeft,
    isRolling,
    rollDice,
    toggleHoldDice,
    selectScore,
    phase,
    players,
    currentPlayerIndex,
    isLocalPlayerTurn,
  } = useGameStore();

  const { hasGamepad } = useGamepadConnection();
  const { vibrateMedium, vibrateStrong } = useGamepadVibration();

  // 检测屏幕方向
  const isPortrait = useIsPortrait();

  // 断开提示状态
  const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState<DisconnectReasonExtended | undefined>();
  
  // 自己断网重连中
  const [showReconnectingBar, setShowReconnectingBar] = useState(false);

  // 计算可选的计分项
  const availableCategories = useMemo(() => {
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer) return [];
    return ALL_SCORE_CATEGORIES.filter(cat => currentPlayer.scoreCard[cat] === null);
  }, [players, currentPlayerIndex]);

  const isMyTurn = isLocalPlayerTurn();
  const canRoll = rollsLeft > 0 && !isRolling && phase === 'rolling' && isMyTurn;
  const canHold = rollsLeft < 3 && !isRolling && isMyTurn;
  const canSelect = rollsLeft < 3 && phase === 'rolling' && isMyTurn;

  // 处理骰子区域确认
  const handleDiceConfirm = useCallback((index: number) => {
    if (index >= 0 && index < 5) {
      // 锁定/解锁骰子
      if (canHold) {
        toggleHoldDice(dice[index].id);
        vibrateMedium();
      }
    } else if (index === 5) {
      // 摇骰子
      if (canRoll) {
        rollDice();
        vibrateStrong();
      }
    }
  }, [canHold, canRoll, dice, toggleHoldDice, rollDice, vibrateMedium, vibrateStrong]);

  // 处理计分板确认
  const handleScoreConfirm = useCallback((index: number) => {
    if (canSelect && availableCategories[index]) {
      selectScore(availableCategories[index]);
      vibrateMedium();
    }
  }, [canSelect, availableCategories, selectScore, vibrateMedium]);

  // 游戏焦点管理
  const gameFocus = useGameFocusProvider({
    availableScoreCount: availableCategories.length,
    rollsLeft,
    canHoldDice: canHold,
    enabled: hasGamepad && isMyTurn,
    onDiceConfirm: handleDiceConfirm,
    onScoreConfirm: handleScoreConfirm,
  });

  // 监听所有其他玩家退出事件
  useEffect(() => {
    if (mode !== 'online') return;

    return onAllPlayersLeft((reason) => {
      setDisconnectReason(reason);
      setShowDisconnectAlert(true);
      setShowReconnectingBar(false);
    });
  }, [mode]);
  
  // 监听连接状态变化 - 只处理自己的断网
  useEffect(() => {
    if (mode !== 'online') return;
    
    return onConnectionStatusChange((peerId, status: ConnectionStatus) => {
      const isHostMode = peerService.getIsHost();
      const isSelfDisconnect = !isHostMode && peerId.startsWith('yahtzee-');
      
      if (isSelfDisconnect) {
        if (status === 'unstable' || status === 'reconnecting') {
          setShowReconnectingBar(true);
        } else if (status === 'connected') {
          setShowReconnectingBar(false);
        }
      }
    });
  }, [mode]);

  // 处理退出游戏
  const handleExitGame = () => {
    setShowDisconnectAlert(false);
    setShowReconnectingBar(false);
    peerService.disconnect();
    resetGame();
    if (onBackToMenu) {
      onBackToMenu();
    }
  };

  // 根据屏幕方向计算样式
  const layoutStyles = useMemo(() => {
    if (isPortrait) {
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
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'clamp(4px, 0.8vw, 8px)',
          boxSizing: 'border-box' as const,
        },
        diceWrapper: {
          flex: 'none',
          width: '100%',
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          gap: 'clamp(4px, 0.8vh, 8px)',
          marginTop: 'clamp(6px, 1vh, 12px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        },
        dice: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      };
    } else {
      return {
        main: {
          display: 'flex',
          flexDirection: 'row' as const,
          width: '100%',
          height: '100%',
        },
        score: {
          flex: 1,
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'clamp(4px, 0.8vw, 8px)',
          boxSizing: 'border-box' as const,
        },
        diceWrapper: {
          flex: 'none',
          height: '100%',
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(4px, 0.8vh, 8px)',
          marginLeft: 'clamp(6px, 1vw, 12px)',
        },
        dice: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      };
    }
  }, [isPortrait]);

  return (
    <GameFocusProvider value={gameFocus}>
      <div 
        className={styles.container}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          overflow: 'hidden',
          background: 'var(--bg)',
          padding: 'clamp(12px, min(2.5vw, 3.5vh), 32px)',
          boxSizing: 'border-box',
        }}
      >
        {/* 联机同步组件 */}
        <OnlineSync />
        
        {/* 自己断网重连中 - 顶部loading条 */}
        <AnimatePresence>
          {showReconnectingBar && (
            <motion.div
              className={styles.reconnectingBar}
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.2 }}
            >
              <div className={styles.reconnectingSpinner} />
              <span className={styles.reconnectingText}>
                {t('online.reconnecting')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 断开连接提示弹窗 */}
        {showDisconnectAlert && (
          <div className={styles.alertOverlay}>
            <motion.div
              className={styles.alertBox}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <p className={styles.alertText}>
                {getDisconnectMessage(t, disconnectReason)}
              </p>
              <button className={styles.alertButton} onClick={handleExitGame}>
                {t('common.ok')}
              </button>
            </motion.div>
          </div>
        )}
        
        {/* 主游戏区域 */}
        <main style={layoutStyles.main}>
          <section style={layoutStyles.score}>
            <ScoreBoard availableCategories={availableCategories} />
          </section>
          <section style={layoutStyles.diceWrapper}>
            <div style={layoutStyles.dice}>
              <DiceContainer />
            </div>
          </section>
        </main>
      </div>
    </GameFocusProvider>
  );
}
