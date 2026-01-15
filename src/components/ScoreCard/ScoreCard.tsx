/**
 * 统一记分板组件
 * 在一个表格中显示所有玩家（2~4人）的分数
 * 布局参考 Switch 版快艇骰子
 */

import { useState, useEffect } from 'react';
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
  const handleScoreClick = (category: ScoreCategory, playerIndex: number) => {
    if (!canSelect) return;
    if (playerIndex !== currentPlayerIndex) return;
    if (players[playerIndex].scoreCard[category] !== null) return;
    
    selectScore(category);
  };
  
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
  const renderScoreCell = (category: ScoreCategory, player: Player, playerIndex: number) => {
    const score = player.scoreCard[category];
    const isCurrentPlayer = playerIndex === currentPlayerIndex;
    const isLocal = isLocalPlayer(player);
    // 只显示当前玩家的预览分数
    const previewScore = isCurrentPlayer ? getPreviewScore(category, player.scoreCard) : null;
    const isAvailable = canSelect && isCurrentPlayer && score === null;
    const isZero = score === 0;
    
    return (
      <td
        key={player.id}
        className={`
          ${styles.scoreCell}
          ${isCurrentPlayer ? styles.currentPlayer : ''}
          ${isLocal ? styles.localPlayer : ''}
          ${isAvailable ? styles.available : ''}
          ${score !== null ? styles.filled : ''}
          ${isZero ? styles.zero : ''}
        `}
        onClick={() => handleScoreClick(category, playerIndex)}
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
    <div className={styles.board}>
      <table className={styles.table}>
        {/* 定义列宽：第一列自适应，玩家列均分剩余空间 */}
        <colgroup>
          <col className={styles.categoryCol} />
          {players.map(player => (
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
            {players.map((player, index) => {
              // 从玩家名提取编号，用于颜色
              const playerNumber = parseInt(player.name.replace('P', '')) || (index + 1);
              const isReconnecting = isPlayerReconnecting(player);
              return (
                <th 
                  key={player.id} 
                  rowSpan={2}
                  className={`
                    ${styles.playerHeader} 
                    ${index === currentPlayerIndex ? styles.activePlayer : ''}
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
                    ) : getPlayerLatency(player, index) ? (
                      <span className={styles.latencyBadge}>{getPlayerLatency(player, index)}</span>
                    ) : null}
                    <span className={styles.playerNameText}>
                      {player.name}
                    </span>
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
              {players.map((player, index) => renderScoreCell(category, player, index))}
            </tr>
          ))}
          
          {/* 上半区小计 */}
          <tr className={styles.subtotalRow}>
            <td>{t('score.upperTotal')}</td>
            {players.map(player => {
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
            {players.map(player => {
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
            <td colSpan={players.length + 1}>{t('score.bonusHint')}</td>
          </tr>
          
          {/* 全选（单独一行） */}
          <tr className={styles.scoreRow}>
            <td className={styles.categoryName}>{t('score.chance')}</td>
            {players.map((player, index) => renderScoreCell('chance', player, index))}
          </tr>
          
          {/* 下半区其他项目 */}
          {lowerCategoriesWithoutChance.map(category => (
            <tr key={category} className={styles.scoreRow}>
              <td className={styles.categoryName}>{t(`score.${category}`)}</td>
              {players.map((player, index) => renderScoreCell(category, player, index))}
            </tr>
          ))}
          
          {/* 总分 */}
          <tr className={styles.totalRow}>
            <td>{t('score.grandTotal')}</td>
            {players.map(player => (
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
