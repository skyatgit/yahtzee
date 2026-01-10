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
  isSmallStraight,
  hasNOfAKind,
  calculateUpperTotal,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_SCORE
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
 * 上半区每个类别的目标得分（3个相同点数）
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
 * 各记分项的潜在最大价值
 */
const CATEGORY_MAX_VALUES: Record<string, number> = {
  ones: 5,
  twos: 10,
  threes: 15,
  fours: 20,
  fives: 25,
  sixes: 30,
  fourOfAKind: 30,
  fullHouse: 25,
  smallStraight: 30,
  largeStraight: 40,
  yahtzee: 50,
  chance: 30
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
  if (current >= UPPER_BONUS_THRESHOLD) return true; // 已达成
  
  const upperCategories: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  
  // 计算剩余类别的最大可能得分
  let maxPossible = current;
  for (const cat of upperCategories) {
    if (scoreCard[cat] === null) {
      // 假设最好情况：5个相同
      const value = cat === 'ones' ? 1 : cat === 'twos' ? 2 : cat === 'threes' ? 3 : 
                    cat === 'fours' ? 4 : cat === 'fives' ? 5 : 6;
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
    const canGetBonus = canStillGetUpperBonus(scoreCard);
    
    if (canGetBonus) {
      // 还有机会拿奖励
      if (score >= target) {
        // 达到或超过目标，额外加分（考虑奖励分的价值）
        const bonusContribution = Math.min(score, target) * (UPPER_BONUS_SCORE / UPPER_BONUS_THRESHOLD);
        value += bonusContribution;
      } else if (score > 0) {
        // 没达到目标，但不是0分，计算对奖励的贡献
        const bonusContribution = score * (UPPER_BONUS_SCORE / UPPER_BONUS_THRESHOLD);
        value += bonusContribution - (target - score) * 0.5;
      }
    }
    
    // 0分的上半区选择要惩罚
    if (score === 0) {
      value -= CATEGORY_MAX_VALUES[category] * 0.3;
    }
  } else {
    // 下半区评估
    switch (category) {
      case 'yahtzee':
        if (score === 50) {
          value += 15; // 快艇非常有价值
        } else if (score === 0) {
          // 快艇填0的惩罚（但比较晚才填0可能是合理的）
          value -= 20;
        }
        break;
        
      case 'largeStraight':
        if (score === 40) {
          value += 10;
        } else if (score === 0) {
          value -= 15;
        }
        break;
        
      case 'smallStraight':
        if (score === 30) {
          value += 5;
        } else if (score === 0) {
          value -= 10;
        }
        break;
        
      case 'fullHouse':
        if (score === 25) {
          value += 5;
        } else if (score === 0) {
          value -= 10;
        }
        break;
        
      case 'fourOfAKind':
        // 四骰同花按实际得分，有一定灵活性
        if (score >= 20) {
          value += 5;
        } else if (score === 0) {
          value -= 10;
        }
        break;
        
      case 'chance':
        // 全选是保底选项，不给额外加分也不惩罚
        // 但如果得分很高说明骰子组合不错
        if (score >= 25) {
          value += 3;
        }
        break;
    }
  }
  
  // 0分选择的通用惩罚（让AI尽量选损失最小的填0）
  if (score === 0) {
    value -= CATEGORY_MAX_VALUES[category] || 20;
  }
  
  return value;
}

/**
 * 分析骰子组合，返回最佳保留策略
 */
function analyzeDiceForBestHold(
  dice: Dice[],
  scoreCard: ScoreCard
): { diceToHold: number[]; target: string } {
  const values = getDiceValues(dice);
  const counts = countDiceValues(values);
  const available = getAvailableCategories(scoreCard);
  
  // 已经是快艇，全部保留
  if (isYahtzee(values)) {
    return { diceToHold: dice.map(d => d.id), target: 'yahtzee' };
  }
  
  // 已经是大顺
  if (isLargeStraight(values) && available.includes('largeStraight')) {
    return { diceToHold: dice.map(d => d.id), target: 'largeStraight' };
  }
  
  // 已经是小顺（但没有大顺可选时保留）
  if (isSmallStraight(values) && available.includes('smallStraight') && !available.includes('largeStraight')) {
    return { diceToHold: dice.map(d => d.id), target: 'smallStraight' };
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
  const [secondValue, secondCount] = sortedCounts[1] || [0, 0];
  
  // 4个相同 - 追求快艇
  if (mostCount === 4) {
    if (available.includes('yahtzee') || available.includes('fourOfAKind')) {
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'yahtzee'
      };
    }
  }
  
  // 3个相同
  if (mostCount === 3) {
    // 已经有一对，保留全部（葫芦）
    if (secondCount === 2 && available.includes('fullHouse')) {
      return { diceToHold: dice.map(d => d.id), target: 'fullHouse' };
    }
    
    // 追求四骰同花或快艇
    if (available.includes('yahtzee') || available.includes('fourOfAKind')) {
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'fourOfAKind'
      };
    }
    
    // 追求葫芦：保留三条，再摇两个
    if (available.includes('fullHouse')) {
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'fullHouse'
      };
    }
  }
  
  // 检查顺子潜力
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  
  // 大顺检测
  if (available.includes('largeStraight')) {
    const largeStraights = [
      [1, 2, 3, 4, 5],
      [2, 3, 4, 5, 6]
    ];
    
    for (const seq of largeStraights) {
      const matching = seq.filter(n => uniqueValues.includes(n as 1|2|3|4|5|6));
      if (matching.length >= 4) {
        // 有4个连续，保留它们追求大顺
        const toHold = dice.filter(d => matching.includes(d.value))
          .filter((d, i, arr) => arr.findIndex(x => x.value === d.value) === i)
          .map(d => d.id);
        return { diceToHold: toHold, target: 'largeStraight' };
      }
    }
  }
  
  // 小顺检测
  if (available.includes('smallStraight')) {
    const smallStraights = [
      [1, 2, 3, 4],
      [2, 3, 4, 5],
      [3, 4, 5, 6]
    ];
    
    for (const seq of smallStraights) {
      const matching = seq.filter(n => uniqueValues.includes(n as 1|2|3|4|5|6));
      if (matching.length >= 3) {
        const toHold = dice.filter(d => matching.includes(d.value))
          .filter((d, i, arr) => arr.findIndex(x => x.value === d.value) === i)
          .map(d => d.id);
        return { diceToHold: toHold, target: 'smallStraight' };
      }
    }
  }
  
  // 2个相同（一对）
  if (mostCount === 2) {
    // 如果有两对，追求葫芦
    if (secondCount === 2 && available.includes('fullHouse')) {
      // 保留点数大的那对
      const keepValue = mostValue > secondValue ? mostValue : secondValue;
      return {
        diceToHold: dice.filter(d => d.value === keepValue).map(d => d.id),
        target: 'fullHouse'
      };
    }
    
    // 保留这对，追求更多相同
    if (available.includes('fourOfAKind') || available.includes('yahtzee')) {
      return {
        diceToHold: dice.filter(d => d.value === mostValue).map(d => d.id),
        target: 'pair+'
      };
    }
  }
  
  // 没有特别好的组合，看上半区需求
  const upperGap = getUpperBonusGap(scoreCard);
  if (upperGap > 0 && canStillGetUpperBonus(scoreCard)) {
    // 找出上半区还没填的类别中，当前骰子最多的
    const upperCats: Array<{ cat: ScoreCategory; value: number }> = [
      { cat: 'ones', value: 1 },
      { cat: 'twos', value: 2 },
      { cat: 'threes', value: 3 },
      { cat: 'fours', value: 4 },
      { cat: 'fives', value: 5 },
      { cat: 'sixes', value: 6 }
    ];
    
    let bestUpperHold: number[] = [];
    let bestUpperCount = 0;
    let bestUpperValue = 0;
    
    for (const { cat, value } of upperCats) {
      if (scoreCard[cat] === null) {
        const matchingDice = dice.filter(d => d.value === value);
        // 优先选择数量多的，其次选择点数大的
        if (matchingDice.length > bestUpperCount || 
            (matchingDice.length === bestUpperCount && value > bestUpperValue)) {
          bestUpperCount = matchingDice.length;
          bestUpperValue = value;
          bestUpperHold = matchingDice.map(d => d.id);
        }
      }
    }
    
    if (bestUpperCount >= 2) {
      return { diceToHold: bestUpperHold, target: 'upper' };
    }
  }
  
  // 默认：保留出现最多且点数大的
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
    const score = calculateScore(cat, dice);
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
  if (isYahtzee(values) && available.includes('yahtzee')) return false;
  if (isLargeStraight(values) && available.includes('largeStraight')) return false;
  if (isFullHouse(values) && available.includes('fullHouse')) return false;
  
  // 计算当前最佳得分
  const bestCat = chooseBestCategory(dice, scoreCard);
  const bestScore = calculateScore(bestCat, dice);
  
  // 如果当前得分非常好，不再摇
  if (bestScore >= 40) return false;
  if (bestScore >= 30 && rollsLeft === 1) return false;
  
  // 四骰同花且得分不错，可能停止
  if (hasNOfAKind(values, 4)) {
    if (bestScore >= 24) return false; // 四个6
    if (bestScore >= 20 && rollsLeft === 1) return false;
  }
  
  // 小顺已达成且没有大顺可选
  if (isSmallStraight(values) && available.includes('smallStraight') && !available.includes('largeStraight')) {
    if (rollsLeft === 1) return false;
  }
  
  // 当前得分太低，继续摇
  if (bestScore < 10) return true;
  
  // 还有2次以上机会，继续尝试更好的组合
  if (rollsLeft >= 2 && bestScore < 25) return true;
  
  // 只剩1次机会，当前得分还可以（>=15），不冒险
  return !(rollsLeft === 1 && bestScore >= 15);
  

}

/**
 * AI做出决策（最优策略）
 */
export function makeAIDecision(
  dice: Dice[],
  scoreCard: ScoreCard,
  rollsLeft: number
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
