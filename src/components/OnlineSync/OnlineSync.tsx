/**
 * 联机同步组件
 * 核心职责：
 * 1. 监听PeerJS消息并更新状态
 * 2. 房主状态变化时广播给其他玩家
 * 3. 检测玩家退出情况
 * 4. 处理游戏结束（房主广播，客户端断开）
 * 5. 在 waiting 状态时处理玩家加入（游戏结束后房主仍在结算页面时）
 */

import { useEffect, useRef } from 'react';
import { useGameStore, onGameOver } from '../../store/gameStore';
import { peerService, type DisconnectReason, type ConnectionStatus } from '../../services/peerService';
import { triggerAllPlayersLeft, triggerConnectionStatusChange, triggerGameOverEvent } from './onlineSyncEvents';
import type { GameMessage, Dice, ScoreCategory, GamePhase, Player } from '../../types/game';
import { createEmptyScoreCard } from '../../utils/scoring';

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

    // 检查是否只剩最后一个玩家（游戏中）
    const checkLastPlayer = () => {
      const state = useGameStore.getState();
      // 只有在游戏进行中才检查
      if (state.phase !== 'playing') return;
      // 只剩一个玩家时触发回调
      if (state.players.length <= 1) {
        console.log('[OnlineSync] 只剩最后一个玩家，触发退出');
        triggerAllPlayersLeft();
      }
    };
    
    // 监听游戏结束事件（房主触发）
    const unsubGameOver = onGameOver((finalPlayers) => {
      const state = useGameStore.getState();
      if (!state.isHost) return;
      
      console.log('[房主] 游戏结束，广播 game-over');
      // 广播游戏结束消息给所有客户端
      peerService.broadcast('game-over', { finalPlayers });
    });

    // 处理收到的消息
    const handleMessage = (message: GameMessage) => {
      const state = useGameStore.getState();
      const tag = state.isHost ? '[房主]' : '[客户端]';

      console.log(`${tag} 收到消息: ${message.type}`, message.payload);

      switch (message.type) {
        case 'join': {
          // 有人尝试加入（房主处理）
          if (!state.isHost) break;
          const newPlayer = message.payload as Player;
          
          // 游戏进行中拒绝加入
          if (state.phase === 'playing') {
            peerService.sendTo(newPlayer.id, 'game-started', {});
            break;
          }
          
          // waiting 状态时处理加入
          if (state.phase === 'waiting') {
            // 检查是否已存在
            if (state.players.some(p => p.id === newPlayer.id)) {
              break;
            }
            
            // 检查房间是否已满
            if (state.players.length >= 8) {
              peerService.sendTo(newPlayer.id, 'room-full', {});
              break;
            }
            
            // 分配玩家编号
            const usedNumbers = state.players.map(p => parseInt(p.name.replace('P', '')));
            let assignedNumber = 1;
            for (let i = 1; i <= 8; i++) {
              if (!usedNumbers.includes(i)) {
                assignedNumber = i;
                break;
              }
            }
            
            // 创建新玩家
            const assignedPlayer: Player = {
              id: newPlayer.id,
              name: `P${assignedNumber}`,
              type: 'remote',
              scoreCard: createEmptyScoreCard(),
              isConnected: true,
            };
            
            // 添加玩家到 store
            useGameStore.getState().addRemotePlayer(assignedPlayer);
            
            // 广播更新后的玩家列表
            queueMicrotask(() => {
              const updatedState = useGameStore.getState();
              peerService.broadcast('sync', { players: updatedState.players });
            });
          }
          break;
        }
        
        case 'sync': {
          // 同步状态（客户端接收）
          if (state.isHost) break;
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
        
        case 'game-over': {
          // 游戏结束（客户端接收）
          if (state.isHost) break;
          const { finalPlayers } = message.payload as { finalPlayers: Player[] };
          console.log('[客户端] 收到游戏结束消息，断开连接');
          
          // 保存房间号用于重新加入
          const roomId = state.roomId;
          
          // 断开与房主的连接
          peerService.disconnect();
          
          // 触发游戏结束事件（用于显示结算弹窗）
          triggerGameOverEvent(finalPlayers, roomId);
          break;
        }
        
        case 'latency-update': {
          // 收到房主广播的延迟信息（客户端接收）
          if (state.isHost) break;
          const latencyObj = message.payload as Record<string, number>;
          peerService.updateLatenciesFromHost(latencyObj);
          break;
        }
      }
    };

    // 处理断开连接
    const handleDisconnect = (peerId: string, reason: DisconnectReason) => {
      const state = useGameStore.getState();
      console.log('[OnlineSync] 玩家断开:', peerId, '原因:', reason);
      
      // 非房主：检测是否是房主断开（与房主的连接断开意味着房间解散）
      if (!state.isHost) {
        // 房主的 peerId 格式是 yahtzee-ROOMID
        if (peerId.startsWith('yahtzee-')) {
          console.log('[客户端] 房主断开连接，房间解散');
          peerService.disconnect();
          triggerAllPlayersLeft(reason === 'peer_network' ? 'host_network' : 'host_left');
          return;
        }
      }

      const player = state.players.find(p => p.id === peerId);
      if (player) {
        useGameStore.getState().removeRemotePlayer(peerId);
        if (state.isHost) {
          peerService.broadcast('player-left', { 
            playerId: peerId,
            reason: reason 
          });
        }
        // 检查是否只剩一个玩家
        setTimeout(checkLastPlayer, 100);
      }
    };
    
    // 处理连接状态变化
    const handleStatusChange = (peerId: string, status: ConnectionStatus, reason?: DisconnectReason) => {
      console.log('[OnlineSync] 连接状态变化:', peerId, status, reason);
      triggerConnectionStatusChange(peerId, status, reason);
    };
    
    // 房主：监听状态变化并广播
    let lastStateHash = '';
    const unsubscribeStore = useGameStore.subscribe((state) => {
      if (!state.isHost || state.mode !== 'online') return;
      
      // 只在游戏进行中同步
      if (state.phase !== 'playing') return;
      
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
    const unsubStatusChange = peerService.onStatusChange(handleStatusChange);
    
    return () => {
      console.log('[OnlineSync] === 清理 ===');
      initRef.current = false;
      unsubscribeStore();
      unsubMessage();
      unsubDisconnect();
      unsubStatusChange();
      unsubGameOver();
    };
  }, [mode]);
  
  return null;
}
