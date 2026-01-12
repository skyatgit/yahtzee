/**
 * 联机游戏设置页面
 * 创建房间或加入房间
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../store/gameStore';
import { peerService, generateRoomId } from '../../services/peerService';
import type { Player, GameMessage } from '../../types/game';
import { createEmptyScoreCard } from '../../utils/scoring';
import styles from './OnlineSetup.module.css';

interface OnlineSetupProps {
  onBack: () => void;
  onStart: () => void;
  inviteRoomId?: string | null;
}

type OnlineMode = 'select' | 'create' | 'join';

export function OnlineSetup({ onBack, onStart, inviteRoomId }: OnlineSetupProps) {
  const { t } = useTranslation();
  const { 
    initOnlineGame, 
    addRemotePlayer, 
    removeRemotePlayer,
    players, 
    syncGameState,
  } = useGameStore();
  
  const [mode, setMode] = useState<OnlineMode>('select');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const autoJoinRef = useRef(false);
  const messageHandlerRegistered = useRef(false);
  const [latencies, setLatencies] = useState<Map<string, number>>(new Map());
  
  // 加入房间的核心逻辑
  const joinRoomAsync = async (targetRoomId: string) => {
    setIsConnecting(true);
    setError(null);
    
    try {
      await peerService.joinRoom(targetRoomId.toUpperCase());
      const peerId = peerService.getMyPeerId()!;
      
      console.log('[客户端] 加入房间成功, peerId:', peerId);
      
      // 玩家名由房主分配，先使用临时名
      initOnlineGame(false, targetRoomId.toUpperCase(), 'P?', peerId);
      
      // 发送加入消息给房主
      const myPlayer: Player = {
        id: peerId,
        name: 'P?', // 临时名，房主会重新分配
        type: 'remote',
        scoreCard: createEmptyScoreCard(),
        isConnected: true
      };
      
      console.log('[客户端] 发送加入请求:', myPlayer);
      peerService.broadcast('join', myPlayer);
      
      setRoomId(targetRoomId.toUpperCase());
      setMode('join');
      return true;
    } catch (err) {
      console.error('加入房间失败:', err);
      setError(t('online.roomNotFound'));
      return false;
    } finally {
      setIsConnecting(false);
    }
  };
  
  // 处理收到的消息
  const handleMessage = useCallback((message: GameMessage) => {
    console.log('[OnlineSetup] 收到消息:', message.type, message.payload);
    const state = useGameStore.getState();
    
    switch (message.type) {
      case 'join': {
        // 有新玩家加入（房主收到）
        if (!state.isHost) return;
        
        const newPlayer = message.payload as Player;
        // 检查玩家是否已存在
        if (state.players.some(p => p.id === newPlayer.id)) return;
        
        // 检查游戏是否已经开始
        if (state.phase !== 'waiting') {
          console.log('[房主] 游戏已开始，拒绝加入');
          peerService.sendTo(newPlayer.id, 'game-started', {});
          return;
        }
        
        // 检查房间是否已满（最多4人）
        if (state.players.length >= 4) {
          console.log('[房主] 房间已满，拒绝加入');
          peerService.sendTo(newPlayer.id, 'room-full', {});
          return;
        }
        
        // 找到第一个空闲的编号 (已有玩家的编号集合，找1-4中第一个不在集合中的)
        const usedNumbers = state.players.map(p => parseInt(p.name.replace('P', '')));
        let assignedNumber = 1;
        for (let i = 1; i <= 4; i++) {
          if (!usedNumbers.includes(i)) {
            assignedNumber = i;
            break;
          }
        }
        
        const assignedPlayer: Player = {
          ...newPlayer,
          name: `P${assignedNumber}`
        };
        
        console.log('[房主] 添加新玩家:', assignedPlayer.name);
        addRemotePlayer(assignedPlayer);
        
        // 广播更新后的玩家列表给所有人
        setTimeout(() => {
          const updatedState = useGameStore.getState();
          console.log('[房主] 广播玩家列表:', updatedState.players);
          peerService.broadcast('sync', { 
            players: updatedState.players 
          });
        }, 100);
        break;
      }
      
      case 'sync': {
        // 同步游戏状态（非房主收到）
        if (state.isHost) return;
        
        const syncData = message.payload as { players?: Player[] };
        console.log('[客户端] 同步玩家列表:', syncData.players);
        if (syncData.players) {
          syncGameState({ players: syncData.players });
        }
        break;
      }
      
      case 'game-start': {
        // 游戏开始（非房主收到）
        if (state.isHost) return;
        
        const startData = message.payload as {
          players: Player[];
          currentPlayerIndex: number;
        };
        console.log('[客户端] 游戏开始:', startData);
        syncGameState({
          players: startData.players,
          currentPlayerIndex: startData.currentPlayerIndex,
          phase: 'rolling',
          rollsLeft: 3,
          currentRound: 1,
        });
        onStart();
        break;
      }
      
      case 'player-left': {
        const { playerId, playerName: leftPlayerName } = message.payload as { playerId: string; playerName?: string };
        console.log('[OnlineSetup] 玩家离开:', playerId);
        removeRemotePlayer(playerId);
        // 显示通知
        if (leftPlayerName) {
          setError(t('online.playerLeft', { name: leftPlayerName }));
          setTimeout(() => setError(null), 3000);
        }
        break;
      }
      
      case 'kicked': {
        // 被房主踢出（非房主收到）
        console.log('[客户端] 被踢出房间');
        peerService.disconnect();
        setError(t('online.kicked'));
        setMode('select');
        break;
      }
      
      case 'room-full': {
        // 房间已满（加入者收到）
        console.log('[客户端] 房间已满');
        peerService.disconnect();
        setError(t('online.roomFull'));
        setMode('select');
        break;
      }
      
      case 'game-started': {
        // 游戏已开始（加入者收到）
        console.log('[客户端] 游戏已开始，无法加入');
        peerService.disconnect();
        setError(t('online.gameAlreadyStarted'));
        setMode('select');
        break;
      }
      
      case 'room-closed': {
        // 房主关闭房间（客户端收到）
        console.log('[客户端] 房主关闭了房间');
        peerService.disconnect();
        setError(t('online.hostLeft'));
        setMode('select');
        break;
      }
      
      case 'latency-update': {
        // 收到房主广播的延迟信息（客户端收到）
        if (state.isHost) return;
        const latencyObj = message.payload as Record<string, number>;
        peerService.updateLatenciesFromHost(latencyObj);
        break;
      }
    }
  }, [addRemotePlayer, removeRemotePlayer, syncGameState, onStart, t]);
  
  // 处理玩家断开连接
  const handleDisconnection = useCallback((peerId: string) => {
    console.log('[OnlineSetup] 玩家断开连接:', peerId);
    const state = useGameStore.getState();
    
    // 非房主：检测是否是房主断开（房间解散）
    if (!state.isHost) {
      if (peerId.startsWith('yahtzee-')) {
        console.log('[客户端] 房主断开连接，房间解散');
        peerService.disconnect();
        setError(t('online.hostLeft'));
        setMode('select');
        return;
      }
    }
    
    // 查找断开的玩家
    const disconnectedPlayer = state.players.find(p => p.id === peerId);
    if (disconnectedPlayer) {
      removeRemotePlayer(peerId);
      
      // 房主广播玩家离开（带玩家名）
      if (state.isHost) {
        peerService.broadcast('player-left', { 
          playerId: peerId,
          playerName: disconnectedPlayer.name 
        });
      }
      
      // 显示断开连接通知
      setError(t('online.playerDisconnected', { name: disconnectedPlayer.name }));
      setTimeout(() => setError(null), 3000);
    }
  }, [removeRemotePlayer, t]);
  
  // 注册消息处理器
  useEffect(() => {
    const unsubMessage = peerService.onMessage(handleMessage);
    const unsubDisconnect = peerService.onDisconnection(handleDisconnection);
    const unsubLatency = peerService.onLatencyUpdate((newLatencies) => {
      setLatencies(newLatencies);
    });
    messageHandlerRegistered.current = true;
    
    return () => {
      unsubMessage();
      unsubDisconnect();
      unsubLatency();
      messageHandlerRegistered.current = false;
    };
  }, [handleMessage, handleDisconnection]);
  
  // 如果有邀请房间号，自动加入（确保消息处理器已注册）
  useEffect(() => {
    if (inviteRoomId && !autoJoinRef.current && mode === 'select' && !isConnecting) {
      // 等待消息处理器注册完成
      const tryAutoJoin = () => {
        if (autoJoinRef.current) return;
        autoJoinRef.current = true;
        setInputRoomId(inviteRoomId);
        joinRoomAsync(inviteRoomId);
      };
      
      // 稍微延迟确保消息处理器已注册
      const timer = setTimeout(tryAutoJoin, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteRoomId, mode, isConnecting]);
  
  // 踢出玩家（房主）
  const handleKickPlayer = (playerId: string) => {
    const state = useGameStore.getState();
    if (!state.isHost) return;
    
    const playerToKick = state.players.find(p => p.id === playerId);
    if (!playerToKick) return;
    
    // 发送踢出消息给该玩家
    peerService.sendTo(playerId, 'kicked', {});
    
    // 移除玩家
    removeRemotePlayer(playerId);
    
    // 广播更新后的玩家列表
    setTimeout(() => {
      const updatedState = useGameStore.getState();
      peerService.broadcast('sync', { 
        players: updatedState.players 
      });
      peerService.broadcast('player-left', { 
        playerId,
        playerName: playerToKick.name 
      });
    }, 100);
  };
  
  // 创建房间
  const handleCreateRoom = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const newRoomId = generateRoomId();
      await peerService.createRoom(newRoomId);
      const peerId = peerService.getMyPeerId()!;
      
      console.log('[房主] 创建房间成功:', newRoomId, 'peerId:', peerId);
      
      setRoomId(newRoomId);
      // 房主自动为 P1
      initOnlineGame(true, newRoomId, 'P1', peerId);
      setMode('create');
    } catch (err) {
      console.error('创建房间失败:', err);
      setError(t('online.connectionFailed'));
    } finally {
      setIsConnecting(false);
    }
  };
  
  // 手动加入房间
  const handleJoinRoom = async () => {
    if (!inputRoomId.trim()) return;
    await joinRoomAsync(inputRoomId);
  };
  
  // 开始游戏（房主）
  const handleStartGame = () => {
    if (players.length < 2) return;
    
    const state = useGameStore.getState();
    console.log('[房主] 开始游戏, 玩家:', state.players);
    
    // 更新本地状态
    syncGameState({
      phase: 'rolling',
      currentPlayerIndex: 0,
      rollsLeft: 3,
      currentRound: 1,
    });
    
    // 广播游戏开始给所有玩家
    peerService.broadcast('game-start', {
      players: state.players,
      currentPlayerIndex: 0,
    });
    
    onStart();
  };
  
  // 复制房间号
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // 生成邀请链接
  const getInviteLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    return url.toString();
  };
  
  // 复制邀请链接
  const copyInviteLink = () => {
    navigator.clipboard.writeText(getInviteLink());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };
  
  // 返回时断开连接
  const handleBack = () => {
    peerService.disconnect();
    onBack();
  };
  
  // 获取玩家的延迟显示
  const getPlayerLatency = (player: Player, index: number): string | null => {
    const state = useGameStore.getState();
    const myPeerId = peerService.getMyPeerId();
    
    // 不显示自己的延迟
    if (player.id === myPeerId) return null;
    
    // 房主视角：显示每个客户端到房主的延迟
    if (state.isHost) {
      if (index === 0) return null; // 房主自己
      const latency = latencies.get(player.id);
      return latency !== undefined ? `${latency}ms` : null;
    }
    
    // 客户端视角
    if (index === 0) {
      // 房主位置：显示自己到房主的延迟
      const hostPeerId = `yahtzee-${roomId}`;
      const latency = latencies.get(hostPeerId);
      return latency !== undefined ? `${latency}ms` : null;
    } else {
      // 其他客户端位置：显示他们到房主的延迟
      const latency = latencies.get(player.id);
      return latency !== undefined ? `${latency}ms` : null;
    }
  };
  
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <button className="btn btn-secondary" onClick={handleBack}>
            ← {t('menu.back')}
          </button>
          <h2 className={styles.title}>{t('menu.onlineGame')}</h2>
        </div>
        
        {mode === 'select' && (
          <div className={styles.card}>
            {/* 创建/加入选择 */}
            <div className={styles.modeButtons}>
              <motion.button
                className="btn btn-primary btn-large btn-full"
                onClick={handleCreateRoom}
                disabled={isConnecting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isConnecting ? t('online.connecting') : t('menu.createRoom')}
              </motion.button>
              
              <div className={styles.divider}>
                <span>{t('common.or')}</span>
              </div>
              
              <div className={styles.joinSection}>
                <input
                  type="text"
                  className="input"
                  placeholder={t('online.enterRoomId')}
                  value={inputRoomId}
                  onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                  maxLength={6}
                />
                <motion.button
                  className="btn btn-success"
                  onClick={handleJoinRoom}
                  disabled={isConnecting || !inputRoomId.trim()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {t('online.join')}
                </motion.button>
              </div>
            </div>
            
            {error && (
              <div className={styles.error}>{error}</div>
            )}
          </div>
        )}
        
        {mode === 'create' && (
          <div className={styles.card}>
            {/* 房间号显示 */}
            <div className={styles.roomInfo}>
              <span className={styles.roomLabel}>{t('online.roomId')}</span>
              <div className={styles.roomIdDisplay}>
                <span className={styles.roomIdText}>{roomId}</span>
                <motion.button
                  className="btn btn-secondary btn-small"
                  onClick={copyRoomId}
                  whileTap={{ scale: 0.95 }}
                >
                  {copied ? t('online.copied') : t('online.copyRoomId')}
                </motion.button>
              </div>
            </div>
            
            {/* 邀请链接 */}
            <div className={styles.inviteSection}>
              <motion.button
                className="btn btn-success btn-full"
                onClick={copyInviteLink}
                whileTap={{ scale: 0.98 }}
              >
                🔗 {copiedLink ? t('online.copied') : t('online.copyInviteLink')}
              </motion.button>
            </div>
            
            {/* 玩家列表 */}
            <div className={styles.section}>
              <label className={styles.label}>{t('setup.players')} ({players.length}/4)</label>
              <div className={styles.playerGrid}>
                {/* 4个固定槽位 */}
                {[1, 2, 3, 4].map((slotNumber) => {
                  const player = players.find(p => p.name === `P${slotNumber}`);
                  if (player) {
                    const latency = getPlayerLatency(player, players.indexOf(player));
                    const isMe = player.id === peerService.getMyPeerId();
                    const isHost = player.name === 'P1';
                    return (
                      <motion.div
                        key={slotNumber}
                        className={`${styles.playerCard} ${isMe ? styles.isMe : ''}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <div className={styles.playerBadge} data-player={slotNumber}>
                          {player.name}
                        </div>
                        <div className={styles.playerMeta}>
                          {isHost && <span className={styles.hostBadge}>{t('online.host')}</span>}
                          {isMe && <span className={styles.meBadge}>{t('common.you')}</span>}
                          {latency && <span className={styles.latencyBadge}>{latency}</span>}
                        </div>
                        {!isHost && (
                          <button 
                            className={styles.kickButton}
                            onClick={() => handleKickPlayer(player.id)}
                            title={t('online.kick')}
                            aria-label={t('online.kick')}
                          />
                        )}
                      </motion.div>
                    );
                  } else {
                    return (
                      <div key={slotNumber} className={styles.playerCardEmpty}>
                        <div className={styles.emptySlot}>?</div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
            
            {/* 等待提示 */}
            {players.length < 2 && (
              <div className={styles.waiting}>
                <span className={styles.waitingDots}>⏳</span>
                {t('online.waitingForPlayers')}
              </div>
            )}
            
            {/* 开始按钮 */}
            <motion.button
              className="btn btn-primary btn-large btn-full"
              onClick={handleStartGame}
              disabled={players.length < 2}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {t('menu.start')} ({players.length}/4)
            </motion.button>
          </div>
        )}
        
        {mode === 'join' && (
          <div className={styles.card}>
            {/* 已加入提示 */}
            <div className={styles.joinedInfo}>
              <span>✅ {t('online.joinedRoom', { roomId })}</span>
            </div>
            
            {/* 玩家列表 */}
            <div className={styles.section}>
              <label className={styles.label}>{t('setup.players')}</label>
              <div className={styles.playerGrid}>
                {/* 4个固定槽位 */}
                {[1, 2, 3, 4].map((slotNumber) => {
                  const player = players.find(p => p.name === `P${slotNumber}`);
                  if (player) {
                    const latency = getPlayerLatency(player, players.indexOf(player));
                    const isMe = player.id === peerService.getMyPeerId();
                    const isHost = player.name === 'P1';
                    return (
                      <motion.div
                        key={slotNumber}
                        className={`${styles.playerCard} ${isMe ? styles.isMe : ''}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <div className={styles.playerBadge} data-player={slotNumber}>
                          {player.name}
                        </div>
                        <div className={styles.playerMeta}>
                          {isHost && <span className={styles.hostBadge}>{t('online.host')}</span>}
                          {isMe && <span className={styles.meBadge}>{t('common.you')}</span>}
                          {latency && <span className={styles.latencyBadge}>{latency}</span>}
                        </div>
                      </motion.div>
                    );
                  } else {
                    return (
                      <div key={slotNumber} className={styles.playerCardEmpty}>
                        <div className={styles.emptySlot}>?</div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
            
            {/* 等待房主开始 */}
            <div className={styles.waiting}>
              <span className={styles.waitingDots}>⏳</span>
              {t('online.waitingForHost')}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
