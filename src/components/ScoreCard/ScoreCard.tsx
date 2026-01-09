/**
 * 统一记分板组件
 * 在一个表格中显示所有玩家（2~4人）的分数
 */

import { useTranslation } from 'react-i18next';
import type { ScoreCard as ScoreCardType, ScoreCategory, Player } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import {
  calculateScore,
  calculateUpperTotal,
  calculateUpperBonus,
  calculateTotalScore,
  UPPER_BONUS_THRESHOLD
} from '../../utils/scoring';
import styles from './ScoreCard.module.css';

// 上半区类别
const upperCategories: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'
];

// 下半区类别
const lowerCategories: ScoreCategory[] = [
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'yahtzee', 'chance'
];

export function ScoreBoard() {
  const { t } = useTranslation();
  const { 
    dice, 
    selectScore, 
    rollsLeft, 
    phase, 
    players, 
    currentPlayerIndex,
    isLocalPlayerTurn,
    localPlayerId,
    mode,
  } = useGameStore();
  
  const isMyTurn = isLocalPlayerTurn();
  const canSelect = rollsLeft < 3 && phase === 'rolling' && isMyTurn;
  
  // 计算预览分数
  const getPreviewScore = (category: ScoreCategory, scoreCard: ScoreCardType): number | null => {
    if (!canSelect || scoreCard[category] !== null) return null;
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
  
  // 渲染玩家分数单元格
  const renderScoreCell = (category: ScoreCategory, player: Player, playerIndex: number) => {
    const score = player.scoreCard[category];
    const isCurrentPlayer = playerIndex === currentPlayerIndex;
    const isLocal = isLocalPlayer(player);
    const previewScore = (isCurrentPlayer && isMyTurn) ? getPreviewScore(category, player.scoreCard) : null;
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
        <thead>
          <tr>
            <th className={styles.categoryHeader}></th>
            {players.map((player, index) => (
              <th 
                key={player.id} 
                className={`
                  ${styles.playerHeader} 
                  ${index === currentPlayerIndex ? styles.activePlayer : ''}
                  ${isLocalPlayer(player) ? styles.localPlayerHeader : ''}
                `}
              >
                <span className={styles.playerName}>
                  {player.name}
                  {isLocalPlayer(player) && mode === 'online' && ' (你)'}
                </span>
                {mode === 'local' && player.type === 'ai' && <span className={styles.aiTag}>AI</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 上半区标题 */}
          <tr className={styles.sectionRow}>
            <td colSpan={players.length + 1}>{t('score.upperSection')}</td>
          </tr>
          
          {/* 上半区分数 */}
          {upperCategories.map(category => (
            <tr key={category} className={styles.scoreRow}>
              <td className={styles.categoryName}>{t(`score.${category}`)}</td>
              {players.map((player, index) => renderScoreCell(category, player, index))}
            </tr>
          ))}
          
          {/* 上半区小计 */}
          <tr className={styles.subtotalRow}>
            <td>{t('score.upperBonus')}</td>
            {players.map(player => {
              const upperTotal = calculateUpperTotal(player.scoreCard);
              const bonus = calculateUpperBonus(player.scoreCard);
              return (
                <td key={player.id} className={styles.subtotalCell}>
                  <span className={bonus > 0 ? styles.bonusEarned : ''}>
                    {upperTotal}/{UPPER_BONUS_THRESHOLD} {bonus > 0 ? `+${bonus}` : ''}
                  </span>
                </td>
              );
            })}
          </tr>
          
          {/* 下半区标题 */}
          <tr className={styles.sectionRow}>
            <td colSpan={players.length + 1}>{t('score.lowerSection')}</td>
          </tr>
          
          {/* 下半区分数 */}
          {lowerCategories.map(category => (
            <tr key={category} className={styles.scoreRow}>
              <td className={styles.categoryName}>{t(`score.${category}`)}</td>
              {players.map((player, index) => renderScoreCell(category, player, index))}
            </tr>
          ))}
          
          {/* 快艇奖励 */}
          <tr className={styles.bonusRow}>
            <td>{t('score.yahtzeeBonus')}</td>
            {players.map(player => (
              <td key={player.id} className={styles.bonusCell}>
                {player.scoreCard.yahtzeeBonus > 0 ? (
                  <span className={styles.bonusEarned}>+{player.scoreCard.yahtzeeBonus * 100}</span>
                ) : '-'}
              </td>
            ))}
          </tr>
          
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
