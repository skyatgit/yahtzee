/**
 * 计分工具函数
 * 实现快艇骰子游戏的所有计分规则
 */

import type { DiceValue, ScoreCategory, ScoreCard, Dice } from '../types/game';

// 上半区奖励分阈值
export const UPPER_BONUS_THRESHOLD = 63;
// 上半区奖励分数值
export const UPPER_BONUS_SCORE = 35;

/**
 * 获取骰子值数组
 */
export function getDiceValues(dice: Dice[]): DiceValue[] {
  return dice.map(d => d.value);
}

/**
 * 统计每个点数出现的次数
 */
export function countDiceValues(values: DiceValue[]): Map<DiceValue, number> {
  const counts = new Map<DiceValue, number>();
  for (let i = 1; i <= 6; i++) {
    counts.set(i as DiceValue, 0);
  }
  values.forEach(v => {
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  return counts;
}

/**
 * 计算骰子总和
 */
export function sumDice(values: DiceValue[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

/**
 * 计算指定点数的总和
 */
export function sumOfNumber(values: DiceValue[], num: DiceValue): number {
  return values.filter(v => v === num).reduce((sum, v) => sum + v, 0);
}

/**
 * 检查是否有N个相同的骰子
 */
export function hasNOfAKind(values: DiceValue[], n: number): boolean {
  const counts = countDiceValues(values);
  return Array.from(counts.values()).some(count => count >= n);
}

/**
 * 检查是否为葫芦 (三个相同 + 两个相同)
 */
export function isFullHouse(values: DiceValue[]): boolean {
  const counts = countDiceValues(values);
  const countValues = Array.from(counts.values()).filter(c => c > 0);
  return countValues.includes(3) && countValues.includes(2);
}

/**
 * 检查是否为小顺 (4个连续)
 */
export function isSmallStraight(values: DiceValue[]): boolean {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const straights = [
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 6]
  ];
  return straights.some(straight => 
    straight.every(num => sorted.includes(num as DiceValue))
  );
}

/**
 * 检查是否为大顺 (5个连续)
 */
export function isLargeStraight(values: DiceValue[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  const straights = [
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 6]
  ];
  return straights.some(straight => 
    straight.every((num, i) => sorted[i] === num)
  );
}

/**
 * 检查是否为快艇 (5个相同)
 */
export function isYahtzee(values: DiceValue[]): boolean {
  return hasNOfAKind(values, 5);
}

/**
 * 计算指定类别的得分
 */
export function calculateScore(
  category: ScoreCategory,
  dice: Dice[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _scoreCard?: ScoreCard
): number {
  const values = getDiceValues(dice);
  
  switch (category) {
    // 上半区
    case 'ones':
      return sumOfNumber(values, 1);
    case 'twos':
      return sumOfNumber(values, 2);
    case 'threes':
      return sumOfNumber(values, 3);
    case 'fours':
      return sumOfNumber(values, 4);
    case 'fives':
      return sumOfNumber(values, 5);
    case 'sixes':
      return sumOfNumber(values, 6);
    
    // 下半区
    case 'fourOfAKind':
      if (hasNOfAKind(values, 4)) {
        return sumDice(values);
      }
      return 0;
      
    case 'fullHouse':
      if (isFullHouse(values)) {
        return 25;
      }
      return 0;
      
    case 'smallStraight':
      if (isSmallStraight(values)) {
        return 30;
      }
      return 0;
      
    case 'largeStraight':
      if (isLargeStraight(values)) {
        return 40;
      }
      return 0;
      
    case 'yahtzee':
      if (isYahtzee(values)) {
        return 50;
      }
      return 0;
      
    case 'chance':
      return sumDice(values);
      
    default:
      return 0;
  }
}

/**
 * 计算上半区总分
 */
export function calculateUpperTotal(scoreCard: ScoreCard): number {
  const upperCategories: (keyof ScoreCard)[] = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'
  ];
  return upperCategories.reduce((sum, cat) => {
    const score = scoreCard[cat];
    return sum + (typeof score === 'number' ? score : 0);
  }, 0);
}

/**
 * 计算上半区奖励分
 */
export function calculateUpperBonus(scoreCard: ScoreCard): number {
  const upperTotal = calculateUpperTotal(scoreCard);
  return upperTotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_SCORE : 0;
}

/**
 * 计算下半区总分
 */
export function calculateLowerTotal(scoreCard: ScoreCard): number {
  const lowerCategories: (keyof ScoreCard)[] = [
    'fourOfAKind', 'fullHouse',
    'smallStraight', 'largeStraight', 'yahtzee', 'chance'
  ];
  return lowerCategories.reduce((sum, cat) => {
    const score = scoreCard[cat];
    return sum + (typeof score === 'number' ? score : 0);
  }, 0);
}

/**
 * 计算玩家总分
 */
export function calculateTotalScore(scoreCard: ScoreCard): number {
  return calculateUpperTotal(scoreCard) + 
         calculateUpperBonus(scoreCard) + 
         calculateLowerTotal(scoreCard);
}

/**
 * 检查记分卡是否已填满
 */
export function isScoreCardComplete(scoreCard: ScoreCard): boolean {
  const categories: (keyof ScoreCard)[] = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'fourOfAKind', 'fullHouse',
    'smallStraight', 'largeStraight', 'yahtzee', 'chance'
  ];
  return categories.every(cat => scoreCard[cat] !== null);
}

/**
 * 获取可用的记分类别
 */
export function getAvailableCategories(scoreCard: ScoreCard): ScoreCategory[] {
  const allCategories: ScoreCategory[] = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'fourOfAKind', 'fullHouse',
    'smallStraight', 'largeStraight', 'yahtzee', 'chance'
  ];
  return allCategories.filter(cat => scoreCard[cat] === null);
}

/**
 * 创建空白记分卡
 */
export function createEmptyScoreCard(): ScoreCard {
  return {
    ones: null,
    twos: null,
    threes: null,
    fours: null,
    fives: null,
    sixes: null,
    fourOfAKind: null,
    fullHouse: null,
    smallStraight: null,
    largeStraight: null,
    yahtzee: null,
    chance: null
  };
}
