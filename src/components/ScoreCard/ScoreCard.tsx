/**
 * 统一记分板组件
 * 在一个表格中显示所有玩家（2~4人）的分数
 * 布局参考 Switch 版快艇骰子
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

// 上半区类别（1~6点）
const upperCategories: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'
];

// 下半区类别（不含全选）
const lowerCategoriesWithoutChance: ScoreCategory[] = [
  'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee'
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
    currentRound,
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
        {/* 定义列宽：第一列自适应，玩家列均分剩余空间 */}
        <colgroup>
          <col className={styles.categoryCol} />
          {players.map(player => (
            <col key={player.id} className={styles.playerCol} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {/* 左上角显示回合进度 */}
            <th className={styles.categoryHeader}>
              <div className={styles.roundInfo}>
                <span className={styles.roundLabel}>{t('game.round')}</span>
                <span className={styles.roundNumber}>{currentRound}/12</span>
              </div>
            </th>
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
                  {isLocalPlayer(player) && mode === 'online' && ` (${t('common.you')})`}
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
