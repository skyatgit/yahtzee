/**
 * 联机游戏设置页面
 * 创建房间或加入房间
 */

import { useState, useEffect, useCallback } from 'react';
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
}

type OnlineMode = 'select' | 'create' | 'join';

// localStorage key for player name
const PLAYER_NAME_KEY = 'yahtzee_player_name';

// 生成随机后缀
const generateRandomSuffix = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 获取保存的玩家名或生成新的
const getSavedPlayerName = (t: (key: string) => string): string => {
  const saved = localStorage.getItem(PLAYER_NAME_KEY);
  if (saved) {
    return saved;
  }
  // 第一次使用，生成随机名称
  const newName = `${t('setup.human')}${generateRandomSuffix()}`;
  localStorage.setItem(PLAYER_NAME_KEY, newName);
  return newName;
};

// 保存玩家名
const savePlayerName = (name: string) => {
  localStorage.setItem(PLAYER_NAME_KEY, name);
};

export function OnlineSetup({ onBack, onStart }: OnlineSetupProps) {
  const { t } = useTranslation();
  const { 
    initOnlineGame, 
    addRemotePlayer, 
    removeRemotePlayer,
    players, 
    syncGameState,
  } = useGameStore();
  
  const [mode, setMode] = useState<OnlineMode>('select');
  const [playerName, setPlayerName] = useState(() => getSavedPlayerName(t));
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // 玩家名修改时自动保存
  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name);
    savePlayerName(name);
  };
  
  // 处理收到的消息
  const handleMessage = useCallback((message: GameMessage) => {
    // ...existing code...
    console.log('[OnlineSetup] 收到消息:', message.type, message.payload);
    const state = useGameStore.getState();
    
    switch (message.type) {
      case 'join': {
        // 有新玩家加入（房主收到）
        if (!state.isHost) return;
        
        const newPlayer = message.payload as Player;
        // 检查玩家是否已存在
        if (state.players.some(p => p.id === newPlayer.id)) return;
        
        console.log('[房主] 添加新玩家:', newPlayer.name);
        addRemotePlayer(newPlayer);
        
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
        const { playerId } = message.payload as { playerId: string };
        console.log('[OnlineSetup] 玩家离开:', playerId);
        removeRemotePlayer(playerId);
        break;
      }
    }
  }, [addRemotePlayer, removeRemotePlayer, syncGameState, onStart]);
  
  // 处理玩家断开连接
  const handleDisconnection = useCallback((peerId: string) => {
    console.log('[OnlineSetup] 玩家断开连接:', peerId);
    const state = useGameStore.getState();
    
    // 查找断开的玩家
    const disconnectedPlayer = state.players.find(p => p.id === peerId);
    if (disconnectedPlayer) {
      removeRemotePlayer(peerId);
      
      // 房主广播玩家离开
      if (state.isHost) {
        peerService.broadcast('player-left', { playerId: peerId });
      }
    }
  }, [removeRemotePlayer]);
  
  // 注册消息处理器
  useEffect(() => {
    const unsubMessage = peerService.onMessage(handleMessage);
    const unsubDisconnect = peerService.onDisconnection(handleDisconnection);
    
    return () => {
      unsubMessage();
      unsubDisconnect();
    };
  }, [handleMessage, handleDisconnection]);
  
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
      initOnlineGame(true, newRoomId, playerName, peerId);
      setMode('create');
    } catch (err) {
      console.error('创建房间失败:', err);
      setError(t('online.connectionFailed'));
    } finally {
      setIsConnecting(false);
    }
  };
  
  // 加入房间
  const handleJoinRoom = async () => {
    if (!inputRoomId.trim()) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      await peerService.joinRoom(inputRoomId.toUpperCase());
      const peerId = peerService.getMyPeerId()!;
      
      console.log('[客户端] 加入房间成功, peerId:', peerId);
      
      initOnlineGame(false, inputRoomId.toUpperCase(), playerName, peerId);
      
      // 发送加入消息给房主
      const myPlayer: Player = {
        id: peerId,
        name: playerName,
        type: 'remote',
        scoreCard: createEmptyScoreCard(),
        isConnected: true
      };
      
      console.log('[客户端] 发送加入请求:', myPlayer);
      peerService.broadcast('join', myPlayer);
      
      setRoomId(inputRoomId.toUpperCase());
      setMode('join');
    } catch (err) {
      console.error('加入房间失败:', err);
      setError(t('online.roomNotFound'));
    } finally {
      setIsConnecting(false);
    }
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
  
  // 返回时断开连接
  const handleBack = () => {
    peerService.disconnect();
    onBack();
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
            {/* 玩家名称 */}
            <div className={styles.section}>
              <label className={styles.label}>{t('setup.playerName')}</label>
              <input
                type="text"
                className="input"
                value={playerName}
                onChange={(e) => handlePlayerNameChange(e.target.value)}
                maxLength={10}
              />
            </div>
            
            {/* 创建/加入选择 */}
            <div className={styles.modeButtons}>
              <motion.button
                className="btn btn-primary btn-large btn-full"
                onClick={handleCreateRoom}
                disabled={isConnecting || !playerName.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isConnecting ? t('online.connecting') : t('menu.createRoom')}
              </motion.button>
              
              <div className={styles.divider}>
                <span>或</span>
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
                  disabled={isConnecting || !inputRoomId.trim() || !playerName.trim()}
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
            
            {/* 玩家列表 */}
            <div className={styles.section}>
              <label className={styles.label}>{t('setup.players')} ({players.length}/4)</label>
              <div className={styles.playerList}>
                {players.map((player, index) => (
                  <motion.div
                    key={player.id}
                    className={styles.playerItem}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <span className={styles.playerIcon}>👤</span>
                    <span className={styles.playerName}>{player.name}</span>
                    {index === 0 && <span className={styles.hostBadge}>房主</span>}
                  </motion.div>
                ))}
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
              <span>✅ 已加入房间 {roomId}</span>
            </div>
            
            {/* 玩家列表 */}
            <div className={styles.section}>
              <label className={styles.label}>{t('setup.players')}</label>
              <div className={styles.playerList}>
                {players.map((player, index) => (
                  <motion.div
                    key={player.id}
                    className={styles.playerItem}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <span className={styles.playerIcon}>👤</span>
                    <span className={styles.playerName}>{player.name}</span>
                    {index === 0 && <span className={styles.hostBadge}>房主</span>}
                  </motion.div>
                ))}
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
