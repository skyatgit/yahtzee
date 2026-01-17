/**
 * 联机游戏设置页面
 * 创建房间或加入房间
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../store/gameStore';
import { peerService, generateRoomId, type DisconnectReason } from '../../services/peerService';
import type { Player, GameMessage } from '../../types/game';
import { createEmptyScoreCard } from '../../utils/scoring';
import { 
  useLayoutNavigation, 
  useGamepadConnection,
  useResponsiveColumns,
  generateGridRows,
  LOCAL_SETUP_BREAKPOINTS,
} from '../../hooks';
import styles from './OnlineSetup.module.css';

interface OnlineSetupProps {
  onBack: () => void;
  onStart: () => void;
  inviteRoomId?: string | null;
}

type OnlineMode = 'select' | 'create' | 'join';

export function OnlineSetup({ onBack, onStart, inviteRoomId }: OnlineSetupProps) {
  const { t } = useTranslation();
  const { hasGamepad } = useGamepadConnection();
  const { 
    initOnlineGame, 
    addRemotePlayer, 
    removeRemotePlayer,
    players, 
    syncGameState,
    isHost,
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
  
  // 响应式列数检测（与 LocalSetup 共用配置）
  const gridColumns = useResponsiveColumns(4, LOCAL_SETUP_BREAKPOINTS);
  
  // 加入房间的核心逻辑 - 使用 ref 避免在 useEffect 中需要它作为依赖
  const joinRoomAsyncRef = useRef<(targetRoomId: string) => Promise<boolean>>(undefined);
  joinRoomAsyncRef.current = async (targetRoomId: string) => {
    setIsConnecting(true);
    setError(null);
    
    try {
      await peerService.joinRoom(targetRoomId.toUpperCase());
      const peerId = peerService.getMyPeerId()!;
      
      initOnlineGame(false, targetRoomId.toUpperCase(), 'P?', peerId);
      
      const myPlayer: Player = {
        id: peerId,
        name: 'P?',
        type: 'remote',
        scoreCard: createEmptyScoreCard(),
        isConnected: true
      };
      
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
  
  const joinRoomAsync = (targetRoomId: string) => joinRoomAsyncRef.current?.(targetRoomId) ?? Promise.resolve(false);
  
  // 处理收到的消息
  const handleMessage = useCallback((message: GameMessage) => {
    const state = useGameStore.getState();
    
    switch (message.type) {
      case 'join': {
        if (!state.isHost) return;
        
        const newPlayer = message.payload as Player;
        if (state.players.some(p => p.id === newPlayer.id)) return;
        
        if (state.phase !== 'waiting') {
          peerService.sendTo(newPlayer.id, 'game-started', {});
          return;
        }
        
        if (state.players.length >= 8) {
          peerService.sendTo(newPlayer.id, 'room-full', {});
          return;
        }
        
        const usedNumbers = state.players.map(p => parseInt(p.name.replace('P', '')));
        let assignedNumber = 1;
        for (let i = 1; i <= 8; i++) {
          if (!usedNumbers.includes(i)) {
            assignedNumber = i;
            break;
          }
        }
        
        const assignedPlayer: Player = {
          ...newPlayer,
          name: `P${assignedNumber}`
        };
        
        addRemotePlayer(assignedPlayer);
        
        queueMicrotask(() => {
          const updatedState = useGameStore.getState();
          peerService.broadcast('sync', { players: updatedState.players });
        });
        break;
      }
      
      case 'sync': {
        if (state.isHost) return;
        const syncData = message.payload as { players?: Player[] };
        if (syncData.players) {
          syncGameState({ players: syncData.players });
        }
        break;
      }
      
      case 'game-start': {
        if (state.isHost) return;
        const startData = message.payload as { players: Player[]; currentPlayerIndex: number };
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
        removeRemotePlayer(playerId);
        if (leftPlayerName) {
          setError(t('online.playerLeft', { name: leftPlayerName }));
          setTimeout(() => setError(null), 3000);
        }
        break;
      }
      
      case 'kicked': {
        peerService.disconnect();
        setError(t('online.kicked'));
        setMode('select');
        break;
      }
      
      case 'room-full': {
        peerService.disconnect();
        setError(t('online.roomFull'));
        setMode('select');
        break;
      }
      
      case 'game-started': {
        peerService.disconnect();
        setError(t('online.gameAlreadyStarted'));
        setMode('select');
        break;
      }
      
      case 'room-closed': {
        peerService.disconnect();
        setError(t('online.hostLeft'));
        setMode('select');
        break;
      }
      
      case 'latency-update': {
        if (state.isHost) return;
        const latencyObj = message.payload as Record<string, number>;
        peerService.updateLatenciesFromHost(latencyObj);
        break;
      }
    }
  }, [addRemotePlayer, removeRemotePlayer, syncGameState, onStart, t]);
  
  // 处理玩家断开连接
  const handleDisconnection = useCallback((peerId: string, reason: DisconnectReason) => {
    const state = useGameStore.getState();
    
    if (!state.isHost) {
      if (peerId.startsWith('yahtzee-')) {
        peerService.disconnect();
        const msg = reason === 'peer_network' 
          ? t('online.disconnectHostNetwork')
          : t('online.hostLeft');
        setError(msg);
        setMode('select');
        return;
      }
    }
    
    const disconnectedPlayer = state.players.find(p => p.id === peerId);
    if (disconnectedPlayer) {
      removeRemotePlayer(peerId);
      
      if (state.isHost) {
        peerService.broadcast('player-left', { 
          playerId: peerId,
          playerName: disconnectedPlayer.name,
          reason: reason
        });
      }
      
      let msg: string;
      switch (reason) {
        case 'peer_left':
          msg = t('online.playerLeft', { name: disconnectedPlayer.name });
          break;
        default:
          msg = t('online.playerDisconnected', { name: disconnectedPlayer.name });
      }
      setError(msg);
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
  
  // 自动加入邀请房间
  useEffect(() => {
    if (inviteRoomId && !autoJoinRef.current && mode === 'select' && !isConnecting) {
      const tryAutoJoin = () => {
        if (autoJoinRef.current) return;
        autoJoinRef.current = true;
        setInputRoomId(inviteRoomId);
        joinRoomAsync(inviteRoomId);
      };
      const timer = setTimeout(tryAutoJoin, 100);
      return () => clearTimeout(timer);
    }
  }, [inviteRoomId, mode, isConnecting]);
  
  // 踢出玩家（房主）
  const handleKickPlayer = useCallback((playerId: string) => {
    const state = useGameStore.getState();
    if (!state.isHost) return;
    
    const playerToKick = state.players.find(p => p.id === playerId);
    if (!playerToKick) return;
    
    peerService.sendTo(playerId, 'kicked', {});
    removeRemotePlayer(playerId);
    
    queueMicrotask(() => {
      const updatedState = useGameStore.getState();
      peerService.broadcast('sync', { players: updatedState.players });
      peerService.broadcast('player-left', { playerId, playerName: playerToKick.name });
    });
  }, [removeRemotePlayer]);
  
  // 创建房间
  const handleCreateRoom = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const newRoomId = generateRoomId();
      await peerService.createRoom(newRoomId);
      const peerId = peerService.getMyPeerId()!;
      
      setRoomId(newRoomId);
      initOnlineGame(true, newRoomId, 'P1', peerId);
      setMode('create');
    } catch (err) {
      console.error('创建房间失败:', err);
      setError(t('online.connectionFailed'));
    } finally {
      setIsConnecting(false);
    }
  }, [initOnlineGame, t]);
  
  // 手动加入房间
  const handleJoinRoom = useCallback(async () => {
    if (!inputRoomId.trim()) return;
    await joinRoomAsync(inputRoomId);
  }, [inputRoomId]);
  
  // 开始游戏（房主）
  const handleStartGame = useCallback(() => {
    if (players.length < 2) return;
    
    const state = useGameStore.getState();
    
    syncGameState({
      phase: 'rolling',
      currentPlayerIndex: 0,
      rollsLeft: 3,
      currentRound: 1,
    });
    
    peerService.broadcast('game-start', {
      players: state.players,
      currentPlayerIndex: 0,
    });
    
    onStart();
  }, [players.length, syncGameState, onStart]);
  
  // 复制房间号
  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);
  
  // 复制邀请链接
  const copyInviteLink = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    navigator.clipboard.writeText(url.toString()).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [roomId]);
  
  // 返回时断开连接
  const handleBack = useCallback(() => {
    peerService.disconnect();
    onBack();
  }, [onBack]);
  
  // 获取玩家的延迟显示
  const getPlayerLatency = (player: Player, index: number): string | null => {
    const state = useGameStore.getState();
    const myPeerId = peerService.getMyPeerId();
    
    if (player.id === myPeerId) return null;
    
    if (state.isHost) {
      if (index === 0) return null;
      const latency = latencies.get(player.id);
      return latency !== undefined ? `${latency}ms` : null;
    }
    
    if (index === 0) {
      const hostPeerId = `yahtzee-${roomId}`;
      const latency = latencies.get(hostPeerId);
      return latency !== undefined ? `${latency}ms` : null;
    } else {
      const latency = latencies.get(player.id);
      return latency !== undefined ? `${latency}ms` : null;
    }
  };
  
  // ===== 手柄导航处理 =====
  
  // 处理选择模式的选择
  const handleSelectModeSelect = useCallback((itemId: string) => {
    if (itemId === 'back') {
      peerService.disconnect();
      onBack();
    } else if (itemId === 'create') {
      handleCreateRoom().catch(() => {});
    } else if (itemId === 'join') {
      handleJoinRoom().catch(() => {});
    }
  }, [onBack, handleCreateRoom, handleJoinRoom]);
  
  // 处理创建/加入房间模式的选择
  const handleRoomModeSelect = useCallback((itemId: string) => {
    if (itemId === 'back') {
      peerService.disconnect();
      onBack();
    } else if (itemId === 'copyRoom') {
      copyRoomId();
    } else if (itemId === 'copyLink') {
      copyInviteLink();
    } else if (itemId === 'start') {
      handleStartGame();
    }
  }, [onBack, copyRoomId, copyInviteLink, handleStartGame]);
  
  // 选择模式的导航行
  const selectModeRows = useMemo(() => [
    ['back'],
    ['create'],
    ['join'],
  ], []);
  
  // 创建房间模式的导航行
  const createModeRows = useMemo(() => {
    const slotIds = Array.from({ length: 8 }, (_, i) => `slot-${i + 1}`);
    const slotRows = generateGridRows(slotIds, gridColumns);
    
    return [
      ['back'],
      ['copyRoom'],
      ['copyLink'],
      ...slotRows,
      ['start'],
    ];
  }, [gridColumns]);
  
  // 加入房间模式的导航行
  const joinModeRows = useMemo(() => {
    const slotIds = Array.from({ length: 8 }, (_, i) => `slot-${i + 1}`);
    const slotRows = generateGridRows(slotIds, gridColumns);
    
    return [
      ['back'],
      ...slotRows,
    ];
  }, [gridColumns]);
  
  // 选择当前模式的导航行
  const currentRows = mode === 'select' ? selectModeRows : 
                      mode === 'create' ? createModeRows : joinModeRows;
  const currentOnSelect = mode === 'select' ? handleSelectModeSelect : handleRoomModeSelect;
  
  // 处理手柄踢人（X键）
  const handleKickByGamepad = useCallback((itemId: string) => {
    if (!isHost) return;
    if (itemId.startsWith('slot-')) {
      const slotNumber = parseInt(itemId.replace('slot-', ''));
      const player = players.find(p => p.name === `P${slotNumber}`);
      // 不能踢自己（房主P1）
      if (player && player.name !== 'P1') {
        handleKickPlayer(player.id);
      }
    }
  }, [isHost, players, handleKickPlayer]);

  // 使用布局导航
  const { isFocused } = useLayoutNavigation({
    rows: currentRows,
    onSelect: currentOnSelect,
    onCancel: handleBack,
    onKick: handleKickByGamepad,
    enabled: hasGamepad,
  });
  
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <button 
            className={`btn btn-secondary ${isFocused('back') ? styles.focused : ''}`} 
            onClick={handleBack}
          >
            ← {t('menu.back')}
          </button>
          <h2 className={styles.title}>{t('menu.onlineGame')}</h2>
        </div>
        
        {mode === 'select' && (
          <div className={styles.card}>
            <div className={styles.modeButtons}>
              <motion.button
                className={`btn btn-primary btn-large btn-full ${isFocused('create') ? styles.focused : ''}`}
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
                  className={`btn btn-success ${isFocused('join') ? styles.focused : ''}`}
                  onClick={handleJoinRoom}
                  disabled={isConnecting || !inputRoomId.trim()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {t('online.join')}
                </motion.button>
              </div>
            </div>
            
            {error && <div className={styles.error}>{error}</div>}
          </div>
        )}
        
        {mode === 'create' && (
          <div className={styles.card}>
            <div className={styles.roomInfo}>
              <span className={styles.roomLabel}>{t('online.roomId')}</span>
              <div className={styles.roomIdDisplay}>
                <span className={styles.roomIdText}>{roomId}</span>
                <motion.button
                  className={`btn btn-secondary btn-small ${isFocused('copyRoom') ? styles.focused : ''}`}
                  onClick={copyRoomId}
                  whileTap={{ scale: 0.95 }}
                >
                  {copied ? t('online.copied') : t('online.copyRoomId')}
                </motion.button>
              </div>
            </div>
            
            <div className={styles.inviteSection}>
              <motion.button
                className={`btn btn-success btn-full ${isFocused('copyLink') ? styles.focused : ''}`}
                onClick={copyInviteLink}
                whileTap={{ scale: 0.98 }}
              >
                🔗 {copiedLink ? t('online.copied') : t('online.copyInviteLink')}
              </motion.button>
            </div>
            
            <div className={styles.section}>
              <label className={styles.label}>{t('setup.players')} ({players.length}/8)</label>
              <div className={styles.playerGrid}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((slotNumber) => {
                  const player = players.find(p => p.name === `P${slotNumber}`);
                  const slotFocused = isFocused(`slot-${slotNumber}`);
                  
                  if (player) {
                    const latency = getPlayerLatency(player, players.indexOf(player));
                    const isMe = player.id === peerService.getMyPeerId();
                    const isPlayerHost = player.name === 'P1';
                    return (
                      <motion.div
                        key={slotNumber}
                        className={`${styles.playerCard} ${isMe ? styles.isMe : ''} ${slotFocused ? styles.focused : ''}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <div className={styles.playerBadge} data-player={slotNumber}>
                          {player.name}
                        </div>
                        <div className={styles.playerMeta}>
                          {isPlayerHost && <span className={styles.hostBadge}>{t('online.host')}</span>}
                          {isMe && <span className={styles.meBadge}>{t('common.you')}</span>}
                          {latency && <span className={styles.latencyBadge}>{latency}</span>}
                        </div>
                        {!isPlayerHost && isHost && (
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
                      <div 
                        key={slotNumber} 
                        className={`${styles.playerCardEmpty} ${slotFocused ? styles.focused : ''}`}
                      >
                        <div className={styles.emptySlot}>?</div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
            
            {players.length < 2 && (
              <div className={styles.waiting}>
                <span className={styles.waitingDots}>⏳</span>
                {t('online.waitingForPlayers')}
              </div>
            )}
            
            {error && <div className={styles.error}>{error}</div>}
            
            <motion.button
              className={`btn btn-primary btn-large btn-full ${isFocused('start') ? styles.focused : ''}`}
              onClick={handleStartGame}
              disabled={players.length < 2}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {t('menu.start')} ({players.length}/8)
            </motion.button>
          </div>
        )}
        
        {mode === 'join' && (
          <div className={styles.card}>
            <div className={styles.joinedInfo}>
              <span>✅ {t('online.joinedRoom', { roomId })}</span>
            </div>
            
            <div className={styles.section}>
              <label className={styles.label}>{t('setup.players')}</label>
              <div className={styles.playerGrid}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((slotNumber) => {
                  const player = players.find(p => p.name === `P${slotNumber}`);
                  const slotFocused = isFocused(`slot-${slotNumber}`);
                  
                  if (player) {
                    const latency = getPlayerLatency(player, players.indexOf(player));
                    const isMe = player.id === peerService.getMyPeerId();
                    const isPlayerHost = player.name === 'P1';
                    return (
                      <motion.div
                        key={slotNumber}
                        className={`${styles.playerCard} ${isMe ? styles.isMe : ''} ${slotFocused ? styles.focused : ''}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <div className={styles.playerBadge} data-player={slotNumber}>
                          {player.name}
                        </div>
                        <div className={styles.playerMeta}>
                          {isPlayerHost && <span className={styles.hostBadge}>{t('online.host')}</span>}
                          {isMe && <span className={styles.meBadge}>{t('common.you')}</span>}
                          {latency && <span className={styles.latencyBadge}>{latency}</span>}
                        </div>
                      </motion.div>
                    );
                  } else {
                    return (
                      <div 
                        key={slotNumber} 
                        className={`${styles.playerCardEmpty} ${slotFocused ? styles.focused : ''}`}
                      >
                        <div className={styles.emptySlot}>?</div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
            
            {error && <div className={styles.error}>{error}</div>}
            
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
