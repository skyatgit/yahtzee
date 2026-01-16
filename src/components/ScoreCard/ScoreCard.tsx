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
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScoreCard as ScoreCardType, ScoreCategory, Player } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { peerService, type ConnectionStatus } from '../../services/peerService';
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

export function ScoreBoard() {
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
  const [isInCancelZone, setIsInCancelZone] = useState(false); // 是否在取消区域（无效区域）
  const lastVibrationCategory = useRef<ScoreCategory | null>(null);
  const lastWasInCancelZone = useRef(false);
  const cellRefs = useRef<Map<ScoreCategory, HTMLTableCellElement>>(new Map());
  const boardRef = useRef<HTMLDivElement>(null);
  const touchStarted = useRef(false);
  const hasMoved = useRef(false); // 是否发生了滑动
  
  // 震动反馈
  const vibrate = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);
  
  // 获取本地玩家索引
  const getLocalPlayerIndex = useCallback((): number => {
    if (mode === 'local') {
      // 本地模式：找到第一个人类玩家
      return players.findIndex(p => p.type === 'human');
    }
    // 联机模式：找到自己
    return players.findIndex(p => p.id === localPlayerId);
  }, [mode, players, localPlayerId]);
  
  // 重新排列玩家顺序，把本地玩家放在第一位
  const sortedPlayers = useMemo(() => {
    const localIndex = getLocalPlayerIndex();
    if (localIndex <= 0) return players; // 已经在第一位或找不到
    
    // 本地玩家放第一位，其他玩家保持原顺序
    const result: Player[] = [];
    result.push(players[localIndex]);
    for (let i = 0; i < players.length; i++) {
      if (i !== localIndex) {
        result.push(players[i]);
      }
    }
    return result;
  }, [players, getLocalPlayerIndex]);
  
  // 获取玩家在原始数组中的索引（用于判断是否是当前回合玩家）
  const getOriginalIndex = useCallback((player: Player): number => {
    return players.findIndex(p => p.id === player.id);
  }, [players]);
  
  // 获取排序后的玩家在显示中的索引（用于判断是否是第一列）
  const getSortedIndex = useCallback((player: Player): number => {
    return sortedPlayers.findIndex(p => p.id === player.id);
  }, [sortedPlayers]);
  
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
  
  // 是否可以显示预览分数（当前玩家已摇骰子）
  const canShowPreview = rollsLeft < 3 && phase === 'rolling';

  // 计算预览分数
  const getPreviewScore = (category: ScoreCategory, scoreCard: ScoreCardType): number | null => {
    if (!canShowPreview || scoreCard[category] !== null) return null;
    return calculateScore(category, dice, scoreCard);
  };
  
  // 处理点击记分项
  const handleScoreClick = (category: ScoreCategory, player: Player) => {
    if (!canSelect) return;
    
    const originalIndex = getOriginalIndex(player);
    if (originalIndex !== currentPlayerIndex) return;
    
    // 只有点击自己的列才有效（第一列）
    const sortedIndex = getSortedIndex(player);
    if (sortedIndex !== 0) return;
    
    if (player.scoreCard[category] !== null) return;
    
    selectScore(category);
  };
  
  // 根据触摸位置获取对应的记分项，如果在无效区域则返回 null
  const getCategoryFromPoint = useCallback((clientY: number): ScoreCategory | null => {
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer) return null;
    
    // 遍历所有可选的记分项，检查触摸位置是否在某个可选格子内
    for (const category of ALL_SCORE_CATEGORIES) {
      // 跳过已填写的
      if (currentPlayer.scoreCard[category] !== null) continue;
      
      const cell = cellRefs.current.get(category);
      if (cell) {
        const rect = cell.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return category;
        }
      }
    }
    // 不在任何可选格子内，返回 null（表示在取消区域）
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
      // 在有效的可选格子上
      setHoveredCategory(category);
      lastVibrationCategory.current = category;
      vibrate();
    } else {
      // 在无效区域（取消区域）
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
      // 在有效的可选格子上
      if (lastWasInCancelZone.current) {
        // 从取消区域回到有效区域
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
      // 在无效区域（取消区域）
      if (!lastWasInCancelZone.current) {
        // 刚进入取消区域，震动提示
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
    
    // 如果没有滑动过，让 click 事件处理
    if (!hasMoved.current) {
      setIsDragging(false);
      setHoveredCategory(null);
      setIsInCancelZone(false);
      return;
    }
    
    // 如果在取消区域，不选择任何记分项
    if (isInCancelZone) {
      setIsDragging(false);
      setHoveredCategory(null);
      setIsInCancelZone(false);
      lastVibrationCategory.current = null;
      lastWasInCancelZone.current = false;
      return;
    }
    
    // 滑动选择确认
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
    // 不显示自己的状态
    if (player.id === localPlayerId) return false;
    
    const status = connectionStatuses.get(player.id);
    return status === 'unstable' || status === 'reconnecting';
  };
  
  // 获取玩家的延迟（联机模式）
  const getPlayerLatency = (player: Player, index: number): string | null => {
    if (mode !== 'online') return null;
    
    const myPeerId = peerService.getMyPeerId();
    
    // 不显示自己的延迟
    if (player.id === myPeerId) return null;
    
    // 房主视角：显示每个客户端到房主的延迟
    if (isHost) {
      if (index === 0) return null; // 房主自己
      const latency = latencies.get(player.id);
      return latency !== undefined ? `${latency}ms` : null;
    }
    
    // 客户端视角
    if (index === 0 && roomId) {
      // 房主位置：显示自己到房主的延迟
      const hostPeerId = `yahtzee-${roomId}`;
      const latency = latencies.get(hostPeerId);
      return latency !== undefined ? `${latency}ms` : null;
    } else {
      // 其他客户端位置：显示他们到房主的延迟
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
    // 只显示当前玩家的预览分数
    const previewScore = isCurrentPlayer ? getPreviewScore(category, player.scoreCard) : null;
    const isAvailable = canSelect && isCurrentPlayer && score === null;
    const isZero = score === 0;
    const isHovered = isDragging && hoveredCategory === category && isCurrentPlayer;
    
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
        {/* 定义列宽：第一列自适应，玩家列均分剩余空间 */}
        <colgroup>
          <col className={styles.categoryCol} />
          {sortedPlayers.map(player => (
            <col key={player.id} className={styles.playerCol} />
          ))}
        </colgroup>
        <thead>
          {/* 第一行：回合 + 玩家名（玩家名rowspan=2） */}
          <tr>
            <th className={styles.roundCell}>
              <div className={styles.roundInfo}>
                <span className={styles.roundLabel}>{t('game.round')}</span>
                <span className={styles.roundNumber}>{currentRound}/12</span>
              </div>
            </th>
            {sortedPlayers.map((player) => {
              const originalIndex = getOriginalIndex(player);
              // 从玩家名提取编号，用于颜色
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
          {/* 第二行：排列组合名（第一列），玩家列被rowspan占用 */}
          <tr className={styles.sectionRow}>
            <th className={styles.sectionHeader}>{t('score.upperSection')}</th>
          </tr>
        </thead>
        <tbody>
          
          {/* 上半区分数（1~6点） */}
          {upperCategories.map(category => (
            <tr key={category} className={styles.scoreRow}>
              <td className={styles.categoryName}>{t(`score.${category}`)}</td>
              {sortedPlayers.map((player) => renderScoreCell(category, player))}
            </tr>
          ))}
          
          {/* 上半区小计 */}
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
          
          {/* 上半区奖励分 */}
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
          
          {/* 奖励分提示 */}
          <tr className={styles.hintRow}>
            <td colSpan={sortedPlayers.length + 1}>{t('score.bonusHint')}</td>
          </tr>
          
          {/* 全选（单独一行） */}
          <tr className={styles.scoreRow}>
            <td className={styles.categoryName}>{t('score.chance')}</td>
            {sortedPlayers.map((player) => renderScoreCell('chance', player))}
          </tr>
          
          {/* 下半区其他项目 */}
          {lowerCategoriesWithoutChance.map(category => (
            <tr key={category} className={styles.scoreRow}>
              <td className={styles.categoryName}>{t(`score.${category}`)}</td>
              {sortedPlayers.map((player) => renderScoreCell(category, player))}
            </tr>
          ))}
          
          {/* 总分 */}
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
