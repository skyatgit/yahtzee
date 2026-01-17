/**
 * 统一记分板组件
 * 在一个表格中显示所有玩家（2~8人）的分数
 * 布局参考 Switch 版快艇骰子
 *
 * 特性：
 * - 本地玩家的列始终显示在第一列
 * - 移动端支持全屏滑动选择记分项
 * - 滑动到第一列（类别名）区域可取消选择
 * - 点击只在自己列有效，其他位置视为误触
 * - 支持手柄导航选择记分项（通过 GameFocusProvider）
 */

import { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScoreCard as ScoreCardType, ScoreCategory, Player } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { peerService, type ConnectionStatus } from '../../services/peerService';
import { GameFocusContext } from '../../hooks/GameFocusContext';
import {
  calculateScore,
  calculateUpperTotal,
  calculateUpperBonus,
  calculateTotalScore,
  UPPER_BONUS_THRESHOLD
} from '../../utils/scoring';
import styles from './ScoreCard.module.css';

// 上半区类别（1~6点）
const upperCategories: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'
];

// 下半区类别（不含全选）
const lowerCategoriesWithoutChance: ScoreCategory[] = [
  'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee'
];

// 所有可选记分项（按显示顺序，用于滑动选择）
const ALL_SCORE_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'chance',
  'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee'
];

// 玩家颜色配置
const PLAYER_COLORS = ['#5a9a6a', '#d4a850', '#6a8cca', '#ca6a8c'];

interface ScoreBoardProps {
  /** 可选的计分项列表（由 GameBoard 传入） */
  availableCategories?: ScoreCategory[];
}

export function ScoreBoard({ availableCategories: propAvailableCategories }: ScoreBoardProps) {
  const { t } = useTranslation();
  const { 
    dice, 
    selectScore, 
    rollsLeft, 
    phase, 
    players, 
    currentPlayerIndex,
    currentRound,
    isLocalPlayerTurn,
    localPlayerId,
    mode,
    isHost,
    roomId,
  } = useGameStore();
  
  const [latencies, setLatencies] = useState<Map<string, number>>(new Map());
  const [connectionStatuses, setConnectionStatuses] = useState<Map<string, ConnectionStatus>>(new Map());
  
  // 滑动选择状态
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<ScoreCategory | null>(null);
  const [isInCancelZone, setIsInCancelZone] = useState(false);
  const lastVibrationCategory = useRef<ScoreCategory | null>(null);
  const lastWasInCancelZone = useRef(false);
  const cellRefs = useRef<Map<ScoreCategory, HTMLTableCellElement>>(new Map());
  const boardRef = useRef<HTMLDivElement>(null);
  const touchStarted = useRef(false);
  const hasMoved = useRef(false);
  
  // 获取游戏焦点状态（可能为 null）
  const gameFocus = useContext(GameFocusContext);
  
  // 震动反馈
  const vibrate = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);
  
  // 获取本地玩家索引
  const getLocalPlayerIndex = useCallback((): number => {
    if (mode === 'local') {
      return players.findIndex(p => p.type === 'human');
    }
    return players.findIndex(p => p.id === localPlayerId);
  }, [mode, players, localPlayerId]);
  
  // 重新排列玩家顺序，把本地玩家放在第一位
  const sortedPlayers = useMemo(() => {
    const localIndex = getLocalPlayerIndex();
    if (localIndex <= 0) return players;
    
    const result: Player[] = [];
    result.push(players[localIndex]);
    for (let i = 0; i < players.length; i++) {
      if (i !== localIndex) {
        result.push(players[i]);
      }
    }
    return result;
  }, [players, getLocalPlayerIndex]);
  
  // 获取玩家在原始数组中的索引
  const getOriginalIndex = useCallback((player: Player): number => {
    return players.findIndex(p => p.id === player.id);
  }, [players]);
  
  // 获取排序后的玩家在显示中的索引
  const getSortedIndex = useCallback((player: Player): number => {
    return sortedPlayers.findIndex(p => p.id === player.id);
  }, [sortedPlayers]);
  
  // 计算可选的计分项（如果没有通过 props 传入）
  const availableCategories = useMemo(() => {
    if (propAvailableCategories) return propAvailableCategories;
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer) return [];
    return ALL_SCORE_CATEGORIES.filter(cat => currentPlayer.scoreCard[cat] === null);
  }, [propAvailableCategories, players, currentPlayerIndex]);
  
  // 监听延迟更新（仅联机模式）
  useEffect(() => {
    if (mode !== 'online') return;
    
    return peerService.onLatencyUpdate((newLatencies) => {
      setLatencies(newLatencies);
    });
  }, [mode]);
  
  // 监听连接状态变化（仅联机模式）
  useEffect(() => {
    if (mode !== 'online') return;
    
    return peerService.onStatusChange((peerId, status) => {
      setConnectionStatuses(prev => {
        const next = new Map(prev);
        if (status === 'disconnected') {
          next.delete(peerId);
        } else {
          next.set(peerId, status);
        }
        return next;
      });
    });
  }, [mode]);
  
  const isMyTurn = isLocalPlayerTurn();
  const canSelect = rollsLeft < 3 && phase === 'rolling' && isMyTurn;
  const canShowPreview = rollsLeft < 3 && phase === 'rolling';

  // 计算预览分数
  const getPreviewScore = (category: ScoreCategory, scoreCard: ScoreCardType): number | null => {
    if (!canShowPreview || scoreCard[category] !== null) return null;
    return calculateScore(category, dice);
  };
  
  // 处理点击记分项
  const handleScoreClick = (category: ScoreCategory, player: Player) => {
    if (!canSelect) return;
    
    const originalIndex = getOriginalIndex(player);
    if (originalIndex !== currentPlayerIndex) return;
    
    const sortedIndex = getSortedIndex(player);
    if (sortedIndex !== 0) return;
    
    if (player.scoreCard[category] !== null) return;
    
    selectScore(category);
  };
  
  // 根据触摸位置获取对应的记分项
  const getCategoryFromPoint = useCallback((clientY: number): ScoreCategory | null => {
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer) return null;
    
    for (const category of ALL_SCORE_CATEGORIES) {
      if (currentPlayer.scoreCard[category] !== null) continue;
      
      const cell = cellRefs.current.get(category);
      if (cell) {
        const rect = cell.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return category;
        }
      }
    }
    return null;
  }, [players, currentPlayerIndex]);
  
  // 全屏触摸开始
  const handleBoardTouchStart = useCallback((e: React.TouchEvent) => {
    if (!canSelect) return;
    
    touchStarted.current = true;
    hasMoved.current = false;
    setIsDragging(true);
    setIsInCancelZone(false);
    lastWasInCancelZone.current = false;
    
    const touch = e.touches[0];
    const category = getCategoryFromPoint(touch.clientY);
    
    if (category) {
      setHoveredCategory(category);
      lastVibrationCategory.current = category;
      vibrate();
    } else {
      setIsInCancelZone(true);
      setHoveredCategory(null);
      lastWasInCancelZone.current = true;
    }
  }, [canSelect, getCategoryFromPoint, vibrate]);
  
  // 全屏触摸移动
  const handleBoardTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !canSelect || !touchStarted.current) return;
    
    hasMoved.current = true;
    
    const touch = e.touches[0];
    const category = getCategoryFromPoint(touch.clientY);
    
    if (category) {
      if (lastWasInCancelZone.current) {
        lastWasInCancelZone.current = false;
        setIsInCancelZone(false);
      }
      
      if (category !== hoveredCategory) {
        setHoveredCategory(category);
        if (category !== lastVibrationCategory.current) {
          vibrate();
          lastVibrationCategory.current = category;
        }
      }
    } else {
      if (!lastWasInCancelZone.current) {
        vibrate();
        lastWasInCancelZone.current = true;
      }
      setIsInCancelZone(true);
      setHoveredCategory(null);
    }
  }, [isDragging, canSelect, getCategoryFromPoint, hoveredCategory, vibrate]);
  
  // 全屏触摸结束
  const handleBoardTouchEnd = useCallback(() => {
    if (!touchStarted.current) return;
    touchStarted.current = false;
    
    if (!hasMoved.current) {
      setIsDragging(false);
      setHoveredCategory(null);
      setIsInCancelZone(false);
      return;
    }
    
    if (isInCancelZone) {
      setIsDragging(false);
      setHoveredCategory(null);
      setIsInCancelZone(false);
      lastVibrationCategory.current = null;
      lastWasInCancelZone.current = false;
      return;
    }
    
    if (hoveredCategory && canSelect) {
      const currentPlayer = players[currentPlayerIndex];
      if (currentPlayer && currentPlayer.scoreCard[hoveredCategory] === null) {
        selectScore(hoveredCategory);
      }
    }
    
    setIsDragging(false);
    setHoveredCategory(null);
    setIsInCancelZone(false);
    lastVibrationCategory.current = null;
    lastWasInCancelZone.current = false;
  }, [hoveredCategory, canSelect, players, currentPlayerIndex, selectScore, isInCancelZone]);
  
  // 全屏触摸取消
  const handleBoardTouchCancel = useCallback(() => {
    touchStarted.current = false;
    hasMoved.current = false;
    setIsDragging(false);
    setHoveredCategory(null);
    setIsInCancelZone(false);
    lastVibrationCategory.current = null;
    lastWasInCancelZone.current = false;
  }, []);
  
  // 保存单元格引用
  const setCellRef = useCallback((category: ScoreCategory, el: HTMLTableCellElement | null) => {
    if (el) {
      cellRefs.current.set(category, el);
    } else {
      cellRefs.current.delete(category);
    }
  }, []);
  
  // 检查是否是本地玩家
  const isLocalPlayer = (player: Player) => {
    if (mode === 'local') return player.type === 'human';
    return player.id === localPlayerId;
  };
  
  // 检查玩家是否正在重连
  const isPlayerReconnecting = (player: Player): boolean => {
    if (mode !== 'online') return false;
    if (player.id === localPlayerId) return false;
    
    const status = connectionStatuses.get(player.id);
    return status === 'unstable' || status === 'reconnecting';
  };
  
  // 获取玩家的延迟（联机模式）
  const getPlayerLatency = (player: Player, index: number): string | null => {
    if (mode !== 'online') return null;
    
    const myPeerId = peerService.getMyPeerId();
    if (player.id === myPeerId) return null;
    
    if (isHost) {
      if (index === 0) return null;
      const latency = latencies.get(player.id);
      return latency !== undefined ? `${latency}ms` : null;
    }
    
    if (index === 0 && roomId) {
      const hostPeerId = `yahtzee-${roomId}`;
      const latency = latencies.get(hostPeerId);
      return latency !== undefined ? `${latency}ms` : null;
    } else {
      const latency = latencies.get(player.id);
      return latency !== undefined ? `${latency}ms` : null;
    }
  };
  
  // 渲染玩家分数单元格
  const renderScoreCell = (category: ScoreCategory, player: Player) => {
    const originalIndex = getOriginalIndex(player);
    const score = player.scoreCard[category];
    const isCurrentPlayer = originalIndex === currentPlayerIndex;
    const isLocal = isLocalPlayer(player);
    const previewScore = isCurrentPlayer ? getPreviewScore(category, player.scoreCard) : null;
    const isAvailable = canSelect && isCurrentPlayer && score === null;
    const isZero = score === 0;
    const isHovered = isDragging && hoveredCategory === category && isCurrentPlayer;
    
    // 手柄焦点：通过 availableCategories 索引判断
    const categoryIndex = availableCategories.indexOf(category);
    const isGamepadFocused = gameFocus?.enabled && 
                             gameFocus.currentArea === 'scorecard' && 
                             isCurrentPlayer && 
                             categoryIndex !== -1 && 
                             gameFocus.scoreFocusIndex === categoryIndex;
    
    return (
      <td
        key={player.id}
        ref={(el) => isCurrentPlayer ? setCellRef(category, el) : undefined}
        className={`
          ${styles.scoreCell}
          ${isCurrentPlayer ? styles.currentPlayer : ''}
          ${isLocal ? styles.localPlayer : ''}
          ${isAvailable ? styles.available : ''}
          ${score !== null ? styles.filled : ''}
          ${isZero ? styles.zero : ''}
          ${isHovered ? styles.hovered : ''}
          ${isGamepadFocused ? styles.gamepadFocused : ''}
        `}
        onClick={() => handleScoreClick(category, player)}
      >
        {score !== null ? (
          <span className={isZero ? styles.zeroScore : ''}>{score}</span>
        ) : previewScore !== null ? (
          <span className={styles.previewScore}>{previewScore}</span>
        ) : (
          <span className={styles.emptyScore}>-</span>
        )}
      </td>
    );
  };
  
  return (
    <div 
      ref={boardRef}
      className={`${styles.board} ${isDragging ? styles.dragging : ''}`}
      onTouchStart={handleBoardTouchStart}
      onTouchMove={handleBoardTouchMove}
      onTouchEnd={handleBoardTouchEnd}
      onTouchCancel={handleBoardTouchCancel}
    >
      <table className={styles.table}>
        <colgroup>
          <col className={styles.categoryCol} />
          {sortedPlayers.map(player => (
            <col key={player.id} className={styles.playerCol} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className={styles.roundCell}>
              <div className={styles.roundInfo}>
                <span className={styles.roundLabel}>{t('game.round')}</span>
                <span className={styles.roundNumber}>{currentRound}/12</span>
              </div>
            </th>
            {sortedPlayers.map((player) => {
              const originalIndex = getOriginalIndex(player);
              const playerNumber = parseInt(player.name.replace('P', '')) || (originalIndex + 1);
              const isReconnecting = isPlayerReconnecting(player);
              return (
                <th 
                  key={player.id} 
                  rowSpan={2}
                  className={`
                    ${styles.playerHeader} 
                    ${originalIndex === currentPlayerIndex ? styles.activePlayer : ''}
                    ${isLocalPlayer(player) ? styles.localPlayerHeader : ''}
                    ${isReconnecting ? styles.reconnecting : ''}
                  `}
                  style={{ '--player-color': PLAYER_COLORS[playerNumber - 1] || PLAYER_COLORS[0] } as React.CSSProperties}
                  data-player={playerNumber}
                >
                  <div className={styles.playerNameWrapper}>
                    {isReconnecting ? (
                      <span className={styles.reconnectingBadge}>
                        <span className={styles.reconnectingSpinner} />
                      </span>
                    ) : getPlayerLatency(player, originalIndex) ? (
                      <span className={styles.latencyBadge}>{getPlayerLatency(player, originalIndex)}</span>
                    ) : null}
                    <span className={styles.playerNameText}>
                      {player.name}
                    </span>
                    {isLocalPlayer(player) && <span className={styles.youTag}>{t('common.you')}</span>}
                    {mode === 'local' && player.type === 'ai' && <span className={styles.aiTag}>AI</span>}
                  </div>
                </th>
              );
            })}
          </tr>
          <tr className={styles.sectionRow}>
            <th className={styles.sectionHeader}>{t('score.upperSection')}</th>
          </tr>
        </thead>
        <tbody>
          {upperCategories.map(category => (
            <tr key={category} className={styles.scoreRow}>
              <td className={styles.categoryName}>{t(`score.${category}`)}</td>
              {sortedPlayers.map((player) => renderScoreCell(category, player))}
            </tr>
          ))}
          
          <tr className={styles.subtotalRow}>
            <td>{t('score.upperTotal')}</td>
            {sortedPlayers.map(player => {
              const upperTotal = calculateUpperTotal(player.scoreCard);
              return (
                <td key={player.id} className={styles.subtotalCell}>
                  {upperTotal}/{UPPER_BONUS_THRESHOLD}
                </td>
              );
            })}
          </tr>
          
          <tr className={styles.bonusRow}>
            <td>{t('score.upperBonus')}</td>
            {sortedPlayers.map(player => {
              const bonus = calculateUpperBonus(player.scoreCard);
              return (
                <td key={player.id} className={styles.bonusCell}>
                  {bonus > 0 ? (
                    <span className={styles.bonusEarned}>+{bonus}</span>
                  ) : '-'}
                </td>
              );
            })}
          </tr>
          
          <tr className={styles.hintRow}>
            <td colSpan={sortedPlayers.length + 1}>{t('score.bonusHint')}</td>
          </tr>
          
          <tr className={styles.scoreRow}>
            <td className={styles.categoryName}>{t('score.chance')}</td>
            {sortedPlayers.map((player) => renderScoreCell('chance', player))}
          </tr>
          
          {lowerCategoriesWithoutChance.map(category => (
            <tr key={category} className={styles.scoreRow}>
              <td className={styles.categoryName}>{t(`score.${category}`)}</td>
              {sortedPlayers.map((player) => renderScoreCell(category, player))}
            </tr>
          ))}
          
          <tr className={styles.totalRow}>
            <td>{t('score.grandTotal')}</td>
            {sortedPlayers.map(player => (
              <td key={player.id} className={styles.totalCell}>
                {calculateTotalScore(player.scoreCard)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
