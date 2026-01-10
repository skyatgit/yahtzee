/**
 * 游戏状态管理
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  GameState,
  GameMode,
  Player,
  Dice,
  DiceValue,
  ScoreCategory,
  PlayerType
} from '../types/game';
import {
  createEmptyScoreCard,
  calculateScore
} from '../utils/scoring';
import { makeAIDecision } from '../utils/ai';
import { peerService } from '../services/peerService';

// 总回合数（等于记分项数量）
const TOTAL_ROUNDS = 12;

// 生成随机骰子值
const rollSingleDice = (): DiceValue => {
  return (Math.floor(Math.random() * 6) + 1) as DiceValue;
};

// 生成唯一ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// 初始骰子状态
const createInitialDice = (): Dice[] => {
  return Array.from({ length: 5 }, (_, i) => ({
    id: i,
    value: 1 as DiceValue,
    isHeld: false
  }));
};

// 创建玩家
const createPlayer = (
  name: string,
  type: PlayerType,
  id?: string
): Player => ({
  id: id || generateId(),
  name,
  type,
  scoreCard: createEmptyScoreCard(),
  isConnected: true
});

interface GameStore extends GameState {
  localPlayerId: string | null;
  
  setMode: (mode: GameMode) => void;
  initLocalGame: (playerConfigs: { name: string; type: PlayerType }[]) => void;
  initOnlineGame: (isHost: boolean, roomId: string, playerName: string, peerId: string) => void;
  startGame: () => void;
  rollDice: () => void;
  toggleHoldDice: (diceId: number) => void;
  selectScore: (category: ScoreCategory) => void;
  nextTurn: () => void;
  resetGame: () => void;
  addRemotePlayer: (player: Player) => void;
  removeRemotePlayer: (playerId: string) => void;
  syncGameState: (state: Partial<GameState>) => void;
  setRoomId: (roomId: string | null) => void;
  getLocalPlayerIndex: () => number;
  isLocalPlayerTurn: () => boolean;
  setIsRolling: (isRolling: boolean) => void;
  processAITurn: () => void;
}

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    // 初始状态
    mode: 'local',
    phase: 'waiting',
    players: [],
    currentPlayerIndex: 0,
    dice: createInitialDice(),
    rollsLeft: 3,
    currentRound: 1,
    roomId: null,
    isHost: false,
    isRolling: false,
    localPlayerId: null,
    
    setMode: (mode) => set({ mode }),
    
    initLocalGame: (playerConfigs) => {
      const players = playerConfigs.map((config, index) =>
        createPlayer(config.name || `玩家${index + 1}`, config.type)
      );
      set({
        mode: 'local',
        phase: 'waiting',
        players,
        currentPlayerIndex: 0,
        dice: createInitialDice(),
        rollsLeft: 3,
        currentRound: 1,
        roomId: null,
        isHost: true,
        localPlayerId: null
      });
    },
    
    initOnlineGame: (isHost, roomId, playerName, peerId) => {
      const player = createPlayer(playerName, 'remote', peerId);
      set({
        mode: 'online',
        phase: 'waiting',
        players: [player],
        currentPlayerIndex: 0,
        dice: createInitialDice(),
        rollsLeft: 3,
        currentRound: 1,
        roomId,
        isHost,
        localPlayerId: peerId
      });
    },
    
    getLocalPlayerIndex: () => {
      const state = get();
      if (state.mode === 'local') return 0;
      return state.players.findIndex(p => p.id === state.localPlayerId);
    },
    
    isLocalPlayerTurn: () => {
      const state = get();
      if (state.mode === 'local') {
        return state.players[state.currentPlayerIndex]?.type === 'human';
      }
      const myIndex = state.players.findIndex(p => p.id === state.localPlayerId);
      return myIndex === state.currentPlayerIndex;
    },
    
    startGame: () => {
      set({
        phase: 'rolling',
        currentPlayerIndex: 0,
        currentRound: 1,
        rollsLeft: 3,
        dice: createInitialDice()
      });
      
      const state = get();
      if (state.mode === 'local' && state.players[0]?.type === 'ai') {
        setTimeout(() => get().processAITurn(), 500);
      }
    },
    
    rollDice: () => {
      const state = get();
      if (state.rollsLeft <= 0 || state.isRolling || state.phase !== 'rolling') return;
      if (!get().isLocalPlayerTurn()) return;
      
      // 生成新骰子结果（但先不应用）
      const newDice = state.dice.map(dice => ({
        ...dice,
        value: dice.isHeld ? dice.value : rollSingleDice()
      }));
      
      if (state.mode === 'online' && !state.isHost) {
        // 非房主：只发送请求给房主，等待房主广播动画开始
        // 不自己播放动画，由房主统一控制
        console.log('[客户端] 发送摇骰子请求');
        peerService.broadcast('action-roll', { diceResult: newDice });
        return; // 直接返回，等待房主广播
      }
      
      // 本地模式或房主：自己控制动画
      set({ isRolling: true });
      
      // 联机房主：广播动画开始给所有客户端
      if (state.mode === 'online' && state.isHost) {
        peerService.broadcast('roll-start', {});
      }
      
      setTimeout(() => {
        const currentState = get();
        const newRollsLeft = currentState.rollsLeft - 1;
        
        // 更新本地状态
        set({
          dice: newDice,
          rollsLeft: newRollsLeft,
          isRolling: false,
        });
        
        // 联机房主：广播结果给客户端
        if (currentState.mode === 'online' && currentState.isHost) {
          peerService.broadcast('roll-end', { diceResult: newDice, rollsLeft: newRollsLeft });
        }
      }, 800);
    },
    
    toggleHoldDice: (diceId) => {
      const state = get();
      if (state.rollsLeft === 3 || state.isRolling) return;
      if (!get().isLocalPlayerTurn()) return;
      
      const newDice = state.dice.map(dice =>
        dice.id === diceId ? { ...dice, isHeld: !dice.isHeld } : dice
      );
      
      if (state.mode === 'online' && !state.isHost) {
        console.log('[客户端] 发送锁定请求');
        peerService.broadcast('action-hold', { diceId });
      }
      
      set({ dice: newDice });
    },
    
    selectScore: (category) => {
      const state = get();
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (!currentPlayer || currentPlayer.scoreCard[category] !== null) return;
      
      // 本地模式或房主：直接检查回合
      // 联机非房主：检查是否是自己的回合
      if (state.mode === 'local' || state.isHost) {
        // 允许处理
      } else if (!get().isLocalPlayerTurn()) {
        return;
      }
      
      // 计算得分
      const score = calculateScore(category, state.dice, currentPlayer.scoreCard);
      
      // 更新记分卡
      const updatedPlayers = state.players.map((player, index) => {
        if (index === state.currentPlayerIndex) {
          return {
            ...player,
            scoreCard: { ...player.scoreCard, [category]: score }
          };
        }
        return player;
      });
      
      set({ players: updatedPlayers });
      
      // 联机非房主：发送请求
      if (state.mode === 'online' && !state.isHost) {
        console.log('[客户端] 发送记分请求');
        peerService.broadcast('action-score', { category });
      }
      
      get().nextTurn();
    },
    
    nextTurn: () => {
      const state = get();
      const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
      const isRoundComplete = nextPlayerIndex === 0;
      const newRound = isRoundComplete ? state.currentRound + 1 : state.currentRound;
      
      if (newRound > TOTAL_ROUNDS) {
        set({ phase: 'finished' });
        return;
      }
      
      set({
        currentPlayerIndex: nextPlayerIndex,
        currentRound: newRound,
        dice: createInitialDice(),
        rollsLeft: 3,
        phase: 'rolling'
      });
      
      // AI回合
      if (state.mode === 'local') {
        const nextPlayer = state.players[nextPlayerIndex];
        if (nextPlayer?.type === 'ai') {
          setTimeout(() => get().processAITurn(), 500);
        }
      }
    },
    
    resetGame: () => {
      set({
        mode: 'local',
        phase: 'waiting',
        players: [],
        currentPlayerIndex: 0,
        dice: createInitialDice(),
        rollsLeft: 3,
        currentRound: 1,
        roomId: null,
        isHost: false,
        localPlayerId: null
      });
    },
    
    addRemotePlayer: (player) => {
      const state = get();
      if (state.players.some(p => p.id === player.id)) return;
      set({ players: [...state.players, player] });
    },
    
    removeRemotePlayer: (playerId) => {
      set(state => {
        const removedIndex = state.players.findIndex(p => p.id === playerId);
        if (removedIndex === -1) return state;
        
        const newPlayers = state.players.filter(p => p.id !== playerId);
        if (newPlayers.length === 0) return { players: newPlayers, currentPlayerIndex: 0 };
        
        let newCurrentIndex = state.currentPlayerIndex;
        
        // 如果移除的玩家在当前玩家之前，当前索引需要减1
        if (removedIndex < state.currentPlayerIndex) {
          newCurrentIndex = state.currentPlayerIndex - 1;
        }
        // 如果移除的正好是当前玩家，索引保持不变（下一个玩家顶上来）
        // 但如果索引超出范围了，需要回到0
        else if (removedIndex === state.currentPlayerIndex) {
          // 索引不变，但要检查是否超出范围
          if (newCurrentIndex >= newPlayers.length) {
            newCurrentIndex = 0;
          }
        }
        // 如果移除的玩家在当前玩家之后，索引不需要变化
        
        // 确保索引在有效范围内
        if (newCurrentIndex >= newPlayers.length) {
          newCurrentIndex = 0;
        }
        if (newCurrentIndex < 0) {
          newCurrentIndex = 0;
        }
        
        return { players: newPlayers, currentPlayerIndex: newCurrentIndex };
      });
    },
    
    syncGameState: (newState) => {
      set(state => ({ ...state, ...newState }));
    },
    
    setRoomId: (roomId) => set({ roomId }),
    setIsRolling: (isRolling) => set({ isRolling }),
    
    processAITurn: () => {
      const state = get();
      const currentPlayer = state.players[state.currentPlayerIndex];
      
      if (!currentPlayer || currentPlayer.type !== 'ai') return;
      if (state.phase === 'finished' || state.mode === 'online') return;
      if (state.isRolling) return; // 动画播放中不处理
      
      const currentState = get();
      const player = currentState.players[currentState.currentPlayerIndex];
      if (!player || player.type !== 'ai') return;
      
      // 第一次摇骰子
      if (currentState.rollsLeft === 3) {
        const startDelay = 300 + Math.random() * 200;
        
        setTimeout(() => {
          set({ isRolling: true });
          
          // 动画播放800ms
          setTimeout(() => {
            const newDice = currentState.dice.map(dice => ({
              ...dice,
              value: rollSingleDice()
            }));
            set({ dice: newDice, rollsLeft: currentState.rollsLeft - 1, isRolling: false });
            
            // 动画结束后，等一下再思考
            setTimeout(() => get().processAITurn(), 500 + Math.random() * 300);
          }, 800);
        }, startDelay);
        return;
      }
      
      // 做决策
      const decision = makeAIDecision(
        currentState.dice,
        player.scoreCard,
        currentState.rollsLeft
      );
      
      if (decision.action === 'roll' && currentState.rollsLeft > 0) {
        // 先锁定骰子
        if (decision.diceToHold && decision.diceToHold.length > 0) {
          const newDice = currentState.dice.map(dice => ({
            ...dice,
            isHeld: decision.diceToHold!.includes(dice.id)
          }));
          set({ dice: newDice });
        }
        
        // 锁定后等一下再摇
        setTimeout(() => {
          const diceState = get();
          set({ isRolling: true });
          
          // 动画播放800ms
          setTimeout(() => {
            const rolledDice = diceState.dice.map(dice => ({
              ...dice,
              value: dice.isHeld ? dice.value : rollSingleDice()
            }));
            set({ dice: rolledDice, rollsLeft: diceState.rollsLeft - 1, isRolling: false });
            
            // 动画结束后再思考
            setTimeout(() => get().processAITurn(), 500 + Math.random() * 300);
          }, 800);
        }, 300 + Math.random() * 200);
        
      } else if (decision.action === 'score' && decision.category) {
        // 记分延迟
        const score = calculateScore(decision.category, currentState.dice, player.scoreCard);
        let scoreDelay = score === 0 ? 500 : (score >= 25 ? 200 : 300);
        scoreDelay += Math.random() * 200;
        
        setTimeout(() => {
          get().selectScore(decision.category!);
        }, scoreDelay);
      }
    }
  }))
);
