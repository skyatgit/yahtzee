/**
 * 游戏类型定义
 */

// 骰子值类型 (1-6)
export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

// 骰子状态
export interface Dice {
  id: number;
  value: DiceValue;
  isHeld: boolean; // 是否被锁定
}

// 记分项类型
export type ScoreCategory =
  // 上半区 (1-6点)
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  // 下半区
  | 'fourOfAKind'    // 四骰同花
  | 'fullHouse'      // 葫芦
  | 'smallStraight'  // 小顺
  | 'largeStraight'  // 大顺
  | 'yahtzee'        // 快艇
  | 'chance';        // 全选

// 玩家记分卡
export interface ScoreCard {
  ones: number | null;
  twos: number | null;
  threes: number | null;
  fours: number | null;
  fives: number | null;
  sixes: number | null;
  fourOfAKind: number | null;
  fullHouse: number | null;
  smallStraight: number | null;
  largeStraight: number | null;
  yahtzee: number | null;
  chance: number | null;
}

// 玩家类型
export type PlayerType = 'human' | 'ai' | 'remote';

// 玩家信息
export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  scoreCard: ScoreCard;
  isConnected: boolean;
  lastScoreCategory?: ScoreCategory; // 最后选择的计分项
}

// 游戏阶段
export type GamePhase = 
  | 'waiting'     // 等待玩家加入
  | 'rolling'     // 摇骰子阶段
  | 'scoring'     // 记分阶段
  | 'finished';   // 游戏结束

// 游戏模式
export type GameMode = 'local' | 'online';

// 游戏状态
export interface GameState {
  // 游戏模式
  mode: GameMode;
  // 游戏阶段
  phase: GamePhase;
  // 玩家列表
  players: Player[];
  // 当前玩家索引
  currentPlayerIndex: number;
  // 骰子状态
  dice: Dice[];
  // 当前回合剩余摇骰次数
  rollsLeft: number;
  // 当前回合数 (共13回合)
  currentRound: number;
  // 房间ID (联机模式)
  roomId: string | null;
  // 是否为房主
  isHost: boolean;
  // 骰子是否在滚动
  isRolling: boolean;
}

// 联机消息类型
export type MessageType =
  | 'join'           // 加入房间
  | 'player-joined'  // 玩家加入
  | 'game-start'     // 游戏开始
  | 'roll'           // 摇骰子（旧）
  | 'hold'           // 锁定骰子（旧）
  | 'score'          // 记分（旧）
  | 'sync'           // 同步状态
  | 'player-left'    // 玩家离开
  | 'action-roll'    // 请求摇骰子
  | 'action-hold'    // 请求锁定骰子
  | 'action-score'   // 请求记分
  | 'roll-start'     // 摇骰子动画开始
  | 'roll-end'       // 摇骰子动画结束
  | 'kicked'         // 被踢出房间
  | 'room-full'      // 房间已满
  | 'game-started'   // 游戏已开始（无法加入）
  | 'room-closed'    // 房间已关闭
  | 'latency-update' // 延迟信息更新
  | 'connection-status'; // 连接状态更新

// 联机消息
export interface GameMessage {
  type: MessageType;
  payload: unknown;
  playerId: string;
  timestamp: number;
}

// AI难度
export type AIDifficulty = 'easy' | 'medium' | 'hard';
