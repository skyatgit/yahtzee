/**
 * PeerJS 联机服务
 * 使用自建 PeerJS 服务器实现P2P联机
 * 
 * 特性：
 * - 心跳检测与延迟测量
 * - 断线重连机制
 * - 连接状态监控
 */

import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { GameMessage, MessageType } from '../types/game';

// 生成房间ID (6位随机字符)
export const generateRoomId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// PeerJS 配置（使用自建服务器）
const PEER_CONFIG = {
  host: 'peerjs.sky9527.top',
  port: 9000,
  secure: true,  // 使用 HTTPS
  debug: 1
};

// 心跳间隔（毫秒）
const HEARTBEAT_INTERVAL = 2000;
// 心跳警告阈值（毫秒）- 超过这个时间开始显示重连提示
const HEARTBEAT_WARNING_THRESHOLD = 3000;
// 心跳超时（毫秒）- 超过这个时间才真正断开
const HEARTBEAT_TIMEOUT = 15000;
// 重连尝试次数
const MAX_RECONNECT_ATTEMPTS = 5;
// 重连间隔（毫秒）
const RECONNECT_INTERVAL = 2000;

// 连接状态
export type ConnectionStatus = 'connected' | 'unstable' | 'reconnecting' | 'disconnected';

// 断开原因
export type DisconnectReason = 'self_network' | 'peer_network' | 'peer_left' | 'kicked' | 'unknown';

type MessageHandler = (message: GameMessage) => void;
type ConnectionHandler = (peerId: string) => void;
type LatencyHandler = (latencies: Map<string, number>) => void;
type StatusChangeHandler = (peerId: string, status: ConnectionStatus, reason?: DisconnectReason) => void;

class PeerService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private disconnectionHandlers: Array<(peerId: string, reason: DisconnectReason) => void> = [];
  private latencyHandlers: LatencyHandler[] = [];
  private statusChangeHandlers: StatusChangeHandler[] = [];
  private myPeerId: string | null = null;
  
  // 心跳相关
  private heartbeatInterval: number | null = null;
  private lastHeartbeat: Map<string, number> = new Map();
  private heartbeatCheckInterval: number | null = null;
  
  // 连接状态
  private connectionStatus: Map<string, ConnectionStatus> = new Map();
  private missedHeartbeats: Map<string, number> = new Map(); // 连续丢失的心跳次数
  
  // 重连相关
  private reconnectAttempts: Map<string, number> = new Map();
  private reconnectTimers: Map<string, number> = new Map();
  private roomId: string | null = null; // 保存房间ID用于重连
  private isHost: boolean = false;
  
  // 延迟测量相关
  private pendingPings: Map<string, number> = new Map(); // peerId -> ping发送时间
  private latencies: Map<string, number> = new Map(); // peerId -> 延迟(ms)
  
  /**
   * 初始化 Peer 连接（作为房主）
   */
  async createRoom(roomId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 使用房间ID作为 Peer ID
      const peerId = `yahtzee-${roomId}`;
      this.peer = new Peer(peerId, PEER_CONFIG);
      this.roomId = roomId;
      this.isHost = true;
      
      this.peer.on('open', (id) => {
        console.log('[PeerService] 房间创建成功，Peer ID:', id);
        this.myPeerId = id;
        this.startHeartbeat();
        this.setupBeforeUnload();
        resolve(roomId);
      });
      
      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });
      
      this.peer.on('error', (err) => {
        console.error('[PeerService] Peer 错误:', err);
        reject(err);
      });
      
      // 监听与信令服务器的断开
      this.peer.on('disconnected', () => {
        console.warn('[PeerService] 与信令服务器断开，尝试重连...');
        // 尝试重连信令服务器（不影响已建立的P2P连接）
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });
    });
  }
  
  /**
   * 加入房间
   */
  async joinRoom(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false; // 防止重复 resolve/reject
      
      // 清理函数
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
      
      // 创建一个随机的 Peer ID
      this.peer = new Peer(PEER_CONFIG);
      this.roomId = roomId;
      this.isHost = false;
      
      // 设置超时（8秒）
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        console.error('[PeerService] 连接超时');
        this.disconnect();
        reject(new Error('连接超时，房间可能不存在'));
      }, 8000);
      
      this.peer.on('open', (id) => {
        console.log('[PeerService] 我的 Peer ID:', id);
        this.myPeerId = id;
        
        // 连接到房主
        const hostPeerId = `yahtzee-${roomId}`;
        const conn = this.peer!.connect(hostPeerId, {
          reliable: true
        });
        
        conn.on('open', () => {
          if (settled) return;
          settled = true;
          cleanup();
          console.log('[PeerService] 已连接到房主');
          this.connections.set(hostPeerId, conn);
          this.connectionStatus.set(hostPeerId, 'connected');
          this.setupConnectionHandlers(conn);
          this.startHeartbeat();
          this.setupBeforeUnload();
          resolve();
        });
        
        conn.on('error', (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          console.error('[PeerService] 连接错误:', err);
          this.disconnect();
          reject(new Error('房间不存在或无法连接'));
        });
      });
      
      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });
      
      this.peer.on('error', (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        console.error('[PeerService] Peer 错误:', err);
        this.disconnect();
        reject(err);
      });
      
      // 监听与信令服务器的断开
      this.peer.on('disconnected', () => {
        console.warn('[PeerService] 与信令服务器断开，尝试重连...');
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });
    });
  }
  
  /**
   * 设置页面关闭时的处理
   */
  private setupBeforeUnload() {
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }
  
  private handleBeforeUnload = () => {
    // 尝试发送离开消息
    this.broadcast('player-left', { playerId: this.myPeerId });
    this.disconnect();
  };
  
  /**
   * 启动心跳
   */
  private startHeartbeat() {
    // 定期发送 ping（心跳 + 延迟测量）
    this.heartbeatInterval = window.setInterval(() => {
      const now = Date.now();
      this.connections.forEach((conn, peerId) => {
        if (conn.open) {
          // 记录 ping 发送时间
          this.pendingPings.set(peerId, now);
          try {
            conn.send({ type: 'ping', timestamp: now });
          } catch (err) {
            console.error('[PeerService] 发送心跳失败:', peerId, err);
          }
        }
      });
    }, HEARTBEAT_INTERVAL);
    
    // 定期检查心跳超时
    this.heartbeatCheckInterval = window.setInterval(() => {
      const now = Date.now();
      this.lastHeartbeat.forEach((lastTime, peerId) => {
        const timeSinceLastHeartbeat = now - lastTime;
        const currentStatus = this.connectionStatus.get(peerId) || 'connected';
        
        if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
          // 真正超时，断开连接
          console.log('[PeerService] 心跳超时，断开连接:', peerId, `(${timeSinceLastHeartbeat}ms)`);
          this.handlePeerDisconnect(peerId, 'peer_network');
        } else if (timeSinceLastHeartbeat > HEARTBEAT_WARNING_THRESHOLD) {
          // 进入警告状态，开始重连尝试
          if (currentStatus === 'connected') {
            console.warn('[PeerService] 心跳不稳定，尝试恢复:', peerId);
            this.updateConnectionStatus(peerId, 'unstable');
            this.attemptReconnect(peerId);
          }
        } else if (currentStatus === 'unstable' || currentStatus === 'reconnecting') {
          // 心跳恢复正常
          console.log('[PeerService] 连接恢复正常:', peerId);
          this.updateConnectionStatus(peerId, 'connected');
          this.reconnectAttempts.delete(peerId);
          this.clearReconnectTimer(peerId);
        }
      });
    }, HEARTBEAT_INTERVAL);
  }
  
  /**
   * 尝试重连
   */
  private attemptReconnect(peerId: string) {
    const attempts = this.reconnectAttempts.get(peerId) || 0;
    
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[PeerService] 重连次数用尽，断开:', peerId);
      this.handlePeerDisconnect(peerId, 'peer_network');
      return;
    }
    
    this.reconnectAttempts.set(peerId, attempts + 1);
    this.updateConnectionStatus(peerId, 'reconnecting');
    
    console.log(`[PeerService] 重连尝试 ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS}:`, peerId);
    
    // 尝试重新发送心跳
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      try {
        conn.send({ type: 'ping', timestamp: Date.now(), reconnect: true });
      } catch (err) {
        console.error('[PeerService] 重连心跳发送失败:', err);
      }
    }
    
    // 设置下次重连定时器
    this.clearReconnectTimer(peerId);
    const timer = window.setTimeout(() => {
      const status = this.connectionStatus.get(peerId);
      if (status === 'reconnecting' || status === 'unstable') {
        this.attemptReconnect(peerId);
      }
    }, RECONNECT_INTERVAL);
    this.reconnectTimers.set(peerId, timer);
  }
  
  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(peerId: string) {
    const timer = this.reconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(peerId);
    }
  }
  
  /**
   * 更新连接状态并通知
   */
  private updateConnectionStatus(peerId: string, status: ConnectionStatus, reason?: DisconnectReason) {
    const oldStatus = this.connectionStatus.get(peerId);
    if (oldStatus === status) return;
    
    this.connectionStatus.set(peerId, status);
    console.log(`[PeerService] 连接状态变化: ${peerId} ${oldStatus} -> ${status}`);
    this.statusChangeHandlers.forEach(handler => handler(peerId, status, reason));
  }
  
  /**
   * 处理对端断开
   */
  private handlePeerDisconnect(peerId: string, reason: DisconnectReason) {
    // 清理状态
    this.lastHeartbeat.delete(peerId);
    this.latencies.delete(peerId);
    this.pendingPings.delete(peerId);
    this.missedHeartbeats.delete(peerId);
    this.reconnectAttempts.delete(peerId);
    this.clearReconnectTimer(peerId);
    
    const conn = this.connections.get(peerId);
    if (conn) {
      this.connections.delete(peerId);
      try {
        conn.close();
      } catch {
        // 忽略关闭错误
      }
    }
    
    this.updateConnectionStatus(peerId, 'disconnected', reason);
    this.connectionStatus.delete(peerId);
    
    // 通知断开处理器
    this.disconnectionHandlers.forEach(handler => handler(peerId, reason));
  }
  
  /**
   * 停止心跳
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
    // 清理所有重连定时器
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    this.lastHeartbeat.clear();
    this.pendingPings.clear();
    this.latencies.clear();
    this.missedHeartbeats.clear();
    this.connectionStatus.clear();
  }
  
  /**
   * 处理新连接
   */
  private handleConnection(conn: DataConnection) {
    conn.on('open', () => {
      console.log('[PeerService] 新玩家连接:', conn.peer);
      this.connections.set(conn.peer, conn);
      this.connectionStatus.set(conn.peer, 'connected');
      // 给足够的初始缓冲时间
      this.lastHeartbeat.set(conn.peer, Date.now() + HEARTBEAT_TIMEOUT);
      this.setupConnectionHandlers(conn);
      
      // 通知连接处理器
      this.connectionHandlers.forEach(handler => handler(conn.peer));
    });
  }
  
  /**
   * 设置连接的消息处理
   */
  private setupConnectionHandlers(conn: DataConnection) {
    // 初始化心跳时间（给足够的初始缓冲时间）
    const initialTime = Date.now() + HEARTBEAT_TIMEOUT;
    this.lastHeartbeat.set(conn.peer, initialTime);
    
    conn.on('data', (data) => {
      // 处理 ping/pong 消息
      if (data && typeof data === 'object' && 'type' in data) {
        const msgType = (data as { type: string }).type;
        
        // 收到 ping，立即回复 pong
        if (msgType === 'ping') {
          this.lastHeartbeat.set(conn.peer, Date.now());
          // 如果之前状态不稳定，现在恢复
          const status = this.connectionStatus.get(conn.peer);
          if (status === 'unstable' || status === 'reconnecting') {
            this.updateConnectionStatus(conn.peer, 'connected');
            this.reconnectAttempts.delete(conn.peer);
            this.clearReconnectTimer(conn.peer);
          }
          const pingData = data as { type: string; timestamp: number };
          try {
            conn.send({ type: 'pong', timestamp: pingData.timestamp });
          } catch (err) {
            console.error('[PeerService] 发送 pong 失败:', err);
          }
          return;
        }
        
        // 收到 pong，计算延迟
        if (msgType === 'pong') {
          this.lastHeartbeat.set(conn.peer, Date.now());
          // 如果之前状态不稳定，现在恢复
          const status = this.connectionStatus.get(conn.peer);
          if (status === 'unstable' || status === 'reconnecting') {
            console.log('[PeerService] 收到 pong，连接恢复:', conn.peer);
            this.updateConnectionStatus(conn.peer, 'connected');
            this.reconnectAttempts.delete(conn.peer);
            this.clearReconnectTimer(conn.peer);
          }
          const sendTime = this.pendingPings.get(conn.peer);
          if (sendTime) {
            const rtt = Date.now() - sendTime;
            this.latencies.set(conn.peer, rtt);
            this.pendingPings.delete(conn.peer);
            // 通知延迟更新
            this.notifyLatencyUpdate();
          }
          return;
        }
        
        // 兼容旧的 heartbeat 消息
        if (msgType === 'heartbeat') {
          this.lastHeartbeat.set(conn.peer, Date.now());
          return;
        }
      }
      
      const message = data as GameMessage;
      console.log('[PeerService] 收到消息:', message.type);
      this.messageHandlers.forEach(handler => handler(message));
    });
    
    conn.on('close', () => {
      console.log('[PeerService] 连接关闭:', conn.peer);
      // 判断断开原因：如果心跳正常但连接关闭，说明是对方主动断开
      const lastTime = this.lastHeartbeat.get(conn.peer);
      const timeSinceLastHeartbeat = lastTime ? Date.now() - lastTime : Infinity;
      const reason: DisconnectReason = timeSinceLastHeartbeat < HEARTBEAT_WARNING_THRESHOLD 
        ? 'peer_left'  // 心跳正常但断开，对方主动离开
        : 'peer_network';  // 心跳超时，网络问题
      
      this.handlePeerDisconnect(conn.peer, reason);
    });
    
    conn.on('error', (err) => {
      console.error('[PeerService] 连接错误:', conn.peer, err);
      // 连接出错，标记为不稳定，尝试恢复
      const status = this.connectionStatus.get(conn.peer);
      if (status === 'connected') {
        this.updateConnectionStatus(conn.peer, 'unstable');
        this.attemptReconnect(conn.peer);
      }
    });
  }
  
  /**
   * 通知延迟更新
   */
  private notifyLatencyUpdate() {
    // 通知本地监听器
    this.latencyHandlers.forEach(handler => handler(new Map(this.latencies)));
    
    // 如果是房主，广播延迟信息给所有客户端
    if (this.myPeerId && this.myPeerId.startsWith('yahtzee-')) {
      // 将 Map 转换为普通对象以便传输
      const latencyObj: Record<string, number> = {};
      this.latencies.forEach((value, key) => {
        latencyObj[key] = value;
      });
      this.broadcast('latency-update', latencyObj);
    }
  }
  
  /**
   * 更新从房主收到的延迟信息（客户端使用）
   */
  updateLatenciesFromHost(latencyObj: Record<string, number>) {
    // 保留自己到房主的延迟
    const myLatencyToHost = this.latencies.size > 0 ? 
      Array.from(this.latencies.values())[0] : null;
    
    // 清空并更新
    this.latencies.clear();
    
    // 添加房主广播的所有客户端延迟
    Object.entries(latencyObj).forEach(([peerId, latency]) => {
      this.latencies.set(peerId, latency);
    });
    
    // 如果有自己到房主的延迟，添加到房主的 peerId 上
    if (myLatencyToHost !== null) {
      // 找到房主的 peerId（以 yahtzee- 开头）
      this.connections.forEach((_, peerId) => {
        if (peerId.startsWith('yahtzee-')) {
          this.latencies.set(peerId, myLatencyToHost);
        }
      });
    }
    
    // 通知本地监听器
    this.latencyHandlers.forEach(handler => handler(new Map(this.latencies)));
  }
  
  /**
   * 发送消息给所有连接的玩家
   */
  broadcast(type: MessageType, payload: unknown) {
    const message: GameMessage = {
      type,
      payload,
      playerId: this.myPeerId || '',
      timestamp: Date.now()
    };
    
    console.log('[PeerService] 广播消息:', type);
    this.connections.forEach((conn, peerId) => {
      if (conn.open) {
        try {
          conn.send(message);
        } catch (err) {
          console.error('[PeerService] 广播失败:', peerId, err);
        }
      }
    });
  }
  
  /**
   * 发送消息给特定玩家
   */
  sendTo(peerId: string, type: MessageType, payload: unknown) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      const message: GameMessage = {
        type,
        payload,
        playerId: this.myPeerId || '',
        timestamp: Date.now()
      };
      try {
        conn.send(message);
      } catch (err) {
        console.error('[PeerService] 发送失败:', peerId, err);
      }
    }
  }
  
  /**
   * 注册消息处理器
   */
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }
  
  /**
   * 注册连接处理器
   */
  onConnection(handler: ConnectionHandler) {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
    };
  }
  
  /**
   * 注册断开连接处理器（带断开原因）
   */
  onDisconnection(handler: (peerId: string, reason: DisconnectReason) => void) {
    this.disconnectionHandlers.push(handler);
    return () => {
      this.disconnectionHandlers = this.disconnectionHandlers.filter(h => h !== handler);
    };
  }
  
  /**
   * 注册连接状态变化处理器
   */
  onStatusChange(handler: StatusChangeHandler) {
    this.statusChangeHandlers.push(handler);
    return () => {
      this.statusChangeHandlers = this.statusChangeHandlers.filter(h => h !== handler);
    };
  }
  
  /**
   * 注册延迟更新处理器
   */
  onLatencyUpdate(handler: LatencyHandler) {
    this.latencyHandlers.push(handler);
    // 立即通知当前延迟
    if (this.latencies.size > 0) {
      handler(new Map(this.latencies));
    }
    return () => {
      this.latencyHandlers = this.latencyHandlers.filter(h => h !== handler);
    };
  }
  
  /**
   * 获取所有连接的延迟
   */
  getLatencies(): Map<string, number> {
    return new Map(this.latencies);
  }
  
  /**
   * 获取到特定 peer 的延迟
   */
  getLatencyTo(peerId: string): number | null {
    return this.latencies.get(peerId) ?? null;
  }
  
  /**
   * 获取连接数量
   */
  getConnectionCount(): number {
    return this.connections.size;
  }
  
  /**
   * 获取我的 Peer ID
   */
  getMyPeerId(): string | null {
    return this.myPeerId;
  }
  
  /**
   * 断开所有连接
   */
  disconnect() {
    // 移除页面关闭监听
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    
    // 停止心跳
    this.stopHeartbeat();
    
    this.connections.forEach(conn => {
      try {
        conn.close();
      } catch {
        // 忽略关闭错误
      }
    });
    this.connections.clear();
    
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // 忽略销毁错误
      }
      this.peer = null;
    }
    
    this.myPeerId = null;
    this.roomId = null;
    this.isHost = false;
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
    this.latencyHandlers = [];
    this.statusChangeHandlers = [];
  }
  
  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.peer !== null && !this.peer.disconnected;
  }
  
  /**
   * 获取连接状态
   */
  getConnectionStatus(peerId: string): ConnectionStatus | null {
    return this.connectionStatus.get(peerId) || null;
  }
  
  /**
   * 获取所有连接状态
   */
  getAllConnectionStatus(): Map<string, ConnectionStatus> {
    return new Map(this.connectionStatus);
  }
  
  /**
   * 检查是否是房主
   */
  getIsHost(): boolean {
    return this.isHost;
  }
  
  /**
   * 获取房间ID
   */
  getRoomId(): string | null {
    return this.roomId;
  }
}

// 导出单例
export const peerService = new PeerService();
