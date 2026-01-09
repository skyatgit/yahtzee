/**
 * AI 玩家决策系统
 * 基于当前最优策略做决策
 */

import type { Dice, ScoreCard, ScoreCategory } from '../types/game';
import {
  calculateScore,
  getAvailableCategories,
  getDiceValues,
  countDiceValues,
  isYahtzee,
  isFullHouse,
  isLargeStraight,
  hasNOfAKind,
  calculateUpperTotal,
  UPPER_BONUS_THRESHOLD
} from './scoring';

/**
 * AI决策结果
 */
interface AIDecision {
  action: 'roll' | 'score';
  diceToHold?: number[];
  category?: ScoreCategory;
}

/**
 * 上半区每个类别的期望得分（3个相同点数）
 */
const UPPER_TARGETS: Record<string, number> = {
  ones: 3,
  twos: 6,
  threes: 9,
  fours: 12,
  fives: 15,
  sixes: 18
};

/**
 * 计算当前上半区距离奖励还差多少分
 */
function getUpperBonusGap(scoreCard: ScoreCard): number {
  const current = calculateUpperTotal(scoreCard);
  return Math.max(0, UPPER_BONUS_THRESHOLD - current);
}

/**
 * 检查上半区奖励是否还有可能达成
 */
function canStillGetUpperBonus(scoreCard: ScoreCard): boolean {
  const current = calculateUpperTotal(scoreCard);
  const upperCategories: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  
  // 计算剩余类别的最大可能得分
  let maxPossible = current;
  for (const cat of upperCategories) {
    if (scoreCard[cat] === null) {
      // 假设最好情况：5个相同
      const value = parseInt(cat === 'ones' ? '1' : cat === 'twos' ? '2' : cat === 'threes' ? '3' : 
                            cat === 'fours' ? '4' : cat === 'fives' ? '5' : '6');
      maxPossible += value * 5;
    }
  }
  
  return maxPossible >= UPPER_BONUS_THRESHOLD;
}

/**
 * 评估一个记分选择的价值
 * 考虑：实际得分、上半区奖励进度、机会成本
 */
function evaluateScoreChoice(
  category: ScoreCategory,
  score: number,
  scoreCard: ScoreCard
): number {
  let value = score;
  
  const upperCategories: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  const isUpper = upperCategories.includes(category);
  
  if (isUpper) {
    const target = UPPER_TARGETS[category];
    const gap = getUpperBonusGap(scoreCard);
    const canGetBonus = canStillGetUpperBonus(scoreCard);
    
    if (canGetBonus && gap > 0) {
      // 还有机会拿奖励
      if (score >= target) {
        // 达到或超过目标，加分
        value += Math.min(10, (score - target) * 2);
      } else if (score > 0) {
        // 没达到目标，但不是0分，轻微惩罚
        value -= (target - score);
      }
    }
    
    // 0分的上半区选择要大幅惩罚（除非无法避免）
    if (score === 0) {
      value -= 10;
    }
  }
  
  // 快艇的额外价值
  if (category === 'yahtzee') {
    if (score === 50) {
      value += 25; // 快艇非常有价值
    } else if (score === 0 && scoreCard.yahtzee === null) {
      // 把快艇位置用0分填掉，惩罚
      value -= 15;
    }
  }
  
  // 大顺、小顺、葫芦的固定得分，价值稳定
  if (category === 'largeStraight' && score === 40) {
    value += 10;
  }
  if (category === 'fullHouse' && score === 25) {
    value += 5;
  }
  
  // 0分选择的惩罚（选择损失最小的）
  if (score === 0) {
    // 选择潜在价值最低的类别填0
    const potentialValues: Record<string, number> = {
      ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30,
      threeOfAKind: 20, fourOfAKind: 25, fullHouse: 25,
      smallStraight: 30, largeStraight: 40, yahtzee: 50, chance: 20
    };
    value -= (potentialValues[category] || 20);
  }
  
  return value;
}

/**
 * 分析骰子组合，返回最佳保留策略和潜在目标
 */
function analyzeDiceForBestHold(
  dice: Dice[],
  scoreCard: ScoreCard
): { diceToHold: number[]; target: string } {
  const values = getDiceValues(dice);
  const counts = countDiceValues(values);
  const available = getAvailableCategories(scoreCard);
  
  // 已经是快艇
  if (isYahtzee(values)) {
    return { diceToHold: dice.map(d => d.id), target: 'yahtzee' };
  }
  
  // 已经是大顺
  if (isLargeStraight(values) && available.includes('largeStraight')) {
    return { diceToHold: dice.map(d => d.id), target: 'largeStraight' };
  }
  
  // 已经是葫芦
  if (isFullHouse(values) && available.includes('fullHouse')) {
    return { diceToHold: dice.map(d => d.id), target: 'fullHouse' };
  }
  
  // 找出出现次数最多的点数
  const sortedCounts = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0]; // 相同次数，选大点数
  });
  
  const [mostValue, mostCount] = sortedCounts[0];
  
  // 4个相同 - 追求快艇或四骰同花
  if (mostCount === 4) {
    if (available.includes('yahtzee') || available.includes('fourOfAKind')) {
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'fourOfAKind/yahtzee'
      };
    }
  }
  
  // 3个相同
  if (mostCount === 3) {
    const secondCount = sortedCounts[1]?.[1] || 0;
    
    // 已经有一对，保留全部（葫芦）
    if (secondCount === 2 && available.includes('fullHouse')) {
      return { diceToHold: dice.map(d => d.id), target: 'fullHouse' };
    }
    
    // 追求四骰同花或快艇
    if (available.includes('yahtzee') || available.includes('fourOfAKind') || available.includes('threeOfAKind')) {
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'threeOfAKind+'
      };
    }
  }
  
  // 检查顺子潜力
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  const straights = [
    { seq: [1, 2, 3, 4, 5], target: 'largeStraight' },
    { seq: [2, 3, 4, 5, 6], target: 'largeStraight' },
    { seq: [1, 2, 3, 4], target: 'smallStraight' },
    { seq: [2, 3, 4, 5], target: 'smallStraight' },
    { seq: [3, 4, 5, 6], target: 'smallStraight' }
  ];
  
  for (const { seq, target } of straights) {
    const matching = seq.filter(n => uniqueValues.includes(n as 1|2|3|4|5|6));
    if (matching.length >= 3) {
      const targetCat = target === 'largeStraight' ? 'largeStraight' : 'smallStraight';
      if (available.includes(targetCat as ScoreCategory)) {
        const holdValues = new Set(matching);
        const toHold: number[] = [];
        for (const d of dice) {
          if (holdValues.has(d.value) && toHold.length < matching.length) {
            // 每个值只保留一个
            if (!toHold.some(id => dice.find(dd => dd.id === id)?.value === d.value)) {
              toHold.push(d.id);
            }
          }
        }
        return { diceToHold: toHold, target };
      }
    }
  }
  
  // 2个相同（一对）
  if (mostCount === 2) {
    // 如果点数大，保留追求三条
    if (mostValue >= 4 && (available.includes('threeOfAKind') || available.includes('fourOfAKind'))) {
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'pair'
      };
    }
    
    // 检查是否有两对，可能追求葫芦
    const secondCount = sortedCounts[1]?.[1] || 0;
    if (secondCount === 2 && available.includes('fullHouse')) {
      // 保留点数大的那对
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'fullHouse'
      };
    }
  }
  
  // 没有特别好的组合，看上半区需求
  const upperGap = getUpperBonusGap(scoreCard);
  if (upperGap > 0 && canStillGetUpperBonus(scoreCard)) {
    // 保留高点数骰子（5、6）
    const highDice = dice.filter(d => d.value >= 5);
    if (highDice.length > 0) {
      // 找出现最多的高点数
      const highCounts = countDiceValues(highDice.map(d => d.value));
      const bestHigh = Array.from(highCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      if (bestHigh) {
        return {
          diceToHold: dice.filter(d => d.value === bestHigh[0]).map(d => d.id),
          target: 'upper'
        };
      }
    }
  }
  
  // 默认：保留出现最多的点数
  return {
    diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
    target: 'default'
  };
}

/**
 * 选择最佳记分类别
 */
function chooseBestCategory(dice: Dice[], scoreCard: ScoreCard): ScoreCategory {
  const available = getAvailableCategories(scoreCard);
  
  if (available.length === 0) {
    throw new Error('No available categories');
  }
  
  let bestCategory = available[0];
  let bestValue = -Infinity;
  
  for (const cat of available) {
    const score = calculateScore(cat, dice, scoreCard);
    const value = evaluateScoreChoice(cat, score, scoreCard);
    
    if (value > bestValue) {
      bestValue = value;
      bestCategory = cat;
    }
  }
  
  return bestCategory;
}

/**
 * 判断当前骰子是否值得继续摇
 */
function shouldKeepRolling(
  dice: Dice[],
  scoreCard: ScoreCard,
  rollsLeft: number
): boolean {
  if (rollsLeft === 0) return false;
  
  const values = getDiceValues(dice);
  const available = getAvailableCategories(scoreCard);
  
  // 已经是完美组合，不用再摇
  if (isYahtzee(values)) return false;
  if (isLargeStraight(values) && available.includes('largeStraight')) return false;
  if (isFullHouse(values) && available.includes('fullHouse')) return false;
  
  // 计算当前最佳得分
  const bestCat = chooseBestCategory(dice, scoreCard);
  const bestScore = calculateScore(bestCat, dice, scoreCard);
  const bestValue = evaluateScoreChoice(bestCat, bestScore, scoreCard);
  
  // 如果当前得分很好（>=25分且价值高），可以考虑不摇
  if (bestScore >= 25 && bestValue >= 30) {
    return false;
  }
  
  // 如果是四骰同花且得分不错
  if (hasNOfAKind(values, 4) && bestScore >= 20) {
    // 只剩1次机会，风险大，可能不摇
    if (rollsLeft === 1) {
      return false;
    }
  }
  
  // 当前得分太低或者是0分，继续摇
  if (bestScore < 15 || bestValue < 10) {
    return true;
  }
  
  // 还有2次机会，可以继续尝试
  if (rollsLeft >= 2) {
    return true;
  }
  
  // 只剩1次机会，当前得分还可以，不冒险
  if (bestScore >= 20) {
    return false;
  }
  
  return true;
}

/**
 * AI做出决策（最优策略）
 */
export function makeAIDecision(
  dice: Dice[],
  scoreCard: ScoreCard,
  rollsLeft: number,
  _difficulty?: string // 保留参数兼容性，但不使用
): AIDecision {
  const available = getAvailableCategories(scoreCard);
  
  // 没有可用类别，不应该发生
  if (available.length === 0) {
    return { action: 'score', category: 'chance' };
  }
  
  // 判断是否继续摇
  if (shouldKeepRolling(dice, scoreCard, rollsLeft)) {
    const { diceToHold } = analyzeDiceForBestHold(dice, scoreCard);
    return { action: 'roll', diceToHold };
  }
  
  // 选择最佳记分类别
  const category = chooseBestCategory(dice, scoreCard);
  return { action: 'score', category };
}
