/**
 * 联机同步组件
 * 核心职责：
 * 1. 监听PeerJS消息并更新状态
 * 2. 房主状态变化时广播给其他玩家
 * 3. 检测玩家退出情况
 */

import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { peerService } from '../../services/peerService';
import { triggerAllPlayersLeft } from './onlineSyncEvents';
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

    // 检查是否只剩最后一个玩家
    const checkLastPlayer = () => {
      const state = useGameStore.getState();
      // 只有在游戏进行中才检查
      if (state.phase !== 'rolling' && state.phase !== 'finished') return;
      // 只剩一个玩家时触发回调
      if (state.players.length <= 1) {
        console.log('[OnlineSync] 只剩最后一个玩家，触发退出');
        triggerAllPlayersLeft();
      }
    };

    // 处理收到的消息
    const handleMessage = (message: GameMessage) => {
      const state = useGameStore.getState();
      const tag = state.isHost ? '[房主]' : '[客户端]';

      console.log(`${tag} 收到消息: ${message.type}`, message.payload);

      switch (message.type) {
        case 'join': {
          // 游戏中有人尝试加入（房主处理）
          if (!state.isHost) break;
          const newPlayer = message.payload as Player;
          console.log('[房主] 游戏进行中，拒绝加入');
          peerService.sendTo(newPlayer.id, 'game-started', {});
          break;
        }
        
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
          // 同步后检查玩家数量
          setTimeout(checkLastPlayer, 100);
          break;
        }

        case 'roll-start':
          // 开始摇骰子动画（客户端接收）
          if (state.isHost) break;
          console.log('[客户端] 开始摇骰子动画');
          useGameStore.setState({ isRolling: true });
          break;

        case 'roll-end': {
          // 摇骰子结束，更新结果（客户端接收）
          if (state.isHost) break;
          const { diceResult, rollsLeft } = message.payload as { diceResult: Dice[]; rollsLeft: number };
          console.log('[客户端] 摇骰子结束', diceResult);
          useGameStore.setState({
            dice: diceResult,
            rollsLeft: rollsLeft,
            isRolling: false,
          });
          break;
        }

        case 'action-roll': {
          // 玩家摇骰子请求（房主处理）
          if (!state.isHost) break;
          const { diceResult } = message.payload as { diceResult: Dice[] };
          console.log('[房主] 处理摇骰子', diceResult);
          
          // 先广播开始动画
          peerService.broadcast('roll-start', {});
          useGameStore.setState({ isRolling: true });
          
          // 800ms后广播结果
          setTimeout(() => {
            const currentState = useGameStore.getState();
            const newRollsLeft = currentState.rollsLeft - 1;
            useGameStore.setState({
              dice: diceResult,
              rollsLeft: newRollsLeft,
              isRolling: false,
            });
            // 广播结束状态
            peerService.broadcast('roll-end', { diceResult, rollsLeft: newRollsLeft });
          }, 800);
          break;
        }

        case 'action-hold': {
          // 玩家锁定骰子请求（房主处理）
          if (!state.isHost) break;
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
          if (!state.isHost) break;
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
          // 玩家离开后检查是否只剩一个玩家
          setTimeout(checkLastPlayer, 100);
          break;
        }
        
        case 'room-closed': {
          // 房主关闭房间（客户端接收）
          if (state.isHost) break;
          console.log('[客户端] 房主关闭了房间');
          peerService.disconnect();
          triggerAllPlayersLeft();
          break;
        }
      }
    };

    // 处理断开连接
    const handleDisconnect = (peerId: string) => {
      const state = useGameStore.getState();
      console.log('[OnlineSync] 玩家断开:', peerId);
      
      // 非房主：检测是否是房主断开（与房主的连接断开意味着房间解散）
      if (!state.isHost) {
        // 房主的 peerId 格式是 yahtzee-ROOMID
        if (peerId.startsWith('yahtzee-')) {
          console.log('[客户端] 房主断开连接，房间解散');
          peerService.disconnect();
          triggerAllPlayersLeft();
          return;
        }
      }

      const player = state.players.find(p => p.id === peerId);
      if (player) {
        useGameStore.getState().removeRemotePlayer(peerId);
        if (state.isHost) {
          peerService.broadcast('player-left', { playerId: peerId });
        }
        // 检查是否只剩一个玩家
        setTimeout(checkLastPlayer, 100);
      }
    };
    
    // 房主：监听状态变化并广播（排除isRolling变化，因为有单独的roll-start/roll-end）
    let lastStateHash = '';
    const unsubscribeStore = useGameStore.subscribe((state) => {
      if (!state.isHost || state.mode !== 'online') return;
      
      // 只在游戏进行中同步
      if (state.phase !== 'rolling' && state.phase !== 'finished') return;
      
      // 正在摇骰子时不自动广播，由roll-start/roll-end处理
      if (state.isRolling) return;
      
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
