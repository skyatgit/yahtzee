/**
 * 联机同步组件
 * 核心职责：
 * 1. 监听PeerJS消息并更新状态
 * 2. 房主状态变化时广播给其他玩家
 */

import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { peerService } from '../../services/peerService';
import type { GameMessage, Dice, ScoreCategory, GamePhase, Player } from '../../types/game';

export function OnlineSync() {
  // 只取mode，其他通过getState获取避免不必要的重渲染
  const mode = useGameStore(s => s.mode);
  const initRef = useRef(false);
  
  useEffect(() => {
    if (mode !== 'online') {
      initRef.current = false;
      return;
    }
    
    // 防止重复初始化
    if (initRef.current) return;
    initRef.current = true;
    
    console.log('[OnlineSync] === 初始化 ===');
    
    // 广播状态给所有玩家
    const broadcastState = () => {
      const state = useGameStore.getState();
      if (!state.isHost) return;
      
      peerService.broadcast('sync', {
        players: state.players,
        currentPlayerIndex: state.currentPlayerIndex,
        dice: state.dice,
        rollsLeft: state.rollsLeft,
        currentRound: state.currentRound,
        phase: state.phase,
        isRolling: state.isRolling,
      });
    };
    
    // 处理收到的消息
    const handleMessage = (message: GameMessage) => {
      const state = useGameStore.getState();
      const tag = state.isHost ? '[房主]' : '[客户端]';
      
      console.log(`${tag} 收到消息: ${message.type}`, message.payload);
      
      switch (message.type) {
        case 'sync': {
          // 同步状态
          const data = message.payload as {
            players: Player[];
            currentPlayerIndex: number;
            dice: Dice[];
            rollsLeft: number;
            currentRound: number;
            phase: GamePhase;
            isRolling: boolean;
          };
          console.log(`${tag} 同步状态`, data);
          useGameStore.setState(data);
          break;
        }
        
        case 'action-roll': {
          // 玩家摇骰子请求（房主处理）
          if (!state.isHost) return;
          const { diceResult } = message.payload as { diceResult: Dice[] };
          console.log('[房主] 处理摇骰子', diceResult);
          useGameStore.setState({
            dice: diceResult,
            rollsLeft: state.rollsLeft - 1,
            isRolling: false,
          });
          broadcastState();
          break;
        }
        
        case 'action-hold': {
          // 玩家锁定骰子请求（房主处理）
          if (!state.isHost) return;
          const { diceId } = message.payload as { diceId: number };
          console.log('[房主] 处理锁定', diceId);
          const newDice = state.dice.map(d =>
            d.id === diceId ? { ...d, isHeld: !d.isHeld } : d
          );
          useGameStore.setState({ dice: newDice });
          broadcastState();
          break;
        }
        
        case 'action-score': {
          // 玩家记分请求（房主处理）
          if (!state.isHost) return;
          const { category } = message.payload as { category: ScoreCategory };
          console.log('[房主] 处理记分', category);
          // selectScore内部会处理记分和回合切换
          useGameStore.getState().selectScore(category);
          // 记分后稍微延迟广播，等状态稳定
          setTimeout(broadcastState, 100);
          break;
        }
        
        case 'player-left': {
          const { playerId } = message.payload as { playerId: string };
          console.log(`${tag} 玩家离开`, playerId);
          useGameStore.getState().removeRemotePlayer(playerId);
          break;
        }
      }
    };
    
    // 处理断开连接
    const handleDisconnect = (peerId: string) => {
      const state = useGameStore.getState();
      console.log('[OnlineSync] 玩家断开:', peerId);
      
      const player = state.players.find(p => p.id === peerId);
      if (player) {
        useGameStore.getState().removeRemotePlayer(peerId);
        if (state.isHost) {
          peerService.broadcast('player-left', { playerId: peerId });
        }
      }
    };
    
    // 房主：监听状态变化并广播
    let lastStateHash = '';
    const unsubscribeStore = useGameStore.subscribe((state) => {
      if (!state.isHost || state.mode !== 'online') return;
      
      // 只在游戏进行中同步
      if (state.phase !== 'rolling' && state.phase !== 'finished') return;
      
      // 计算状态哈希，避免重复广播
      const hash = JSON.stringify({
        d: state.dice,
        r: state.rollsLeft,
        c: state.currentPlayerIndex,
        round: state.currentRound,
        p: state.phase,
        sc: state.players.map(p => p.scoreCard),
      });
      
      if (hash !== lastStateHash) {
        lastStateHash = hash;
        console.log('[房主] 状态变化，广播');
        broadcastState();
      }
    });
    
    // 注册消息和断开处理器
    const unsubMessage = peerService.onMessage(handleMessage);
    const unsubDisconnect = peerService.onDisconnection(handleDisconnect);
    
    return () => {
      console.log('[OnlineSync] === 清理 ===');
      initRef.current = false;
      unsubscribeStore();
      unsubMessage();
      unsubDisconnect();
    };
  }, [mode]);
  
  return null;
}
