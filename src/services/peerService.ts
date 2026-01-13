/**
 * PeerJS 联机服务
 * 使用自建 PeerJS 服务器实现P2P联机
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
  debug: 1,
  config: {
    // 增加 ICE 服务器配置，提高连接成功率
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    // 增加 ICE 候选超时时间
    iceCandidatePoolSize: 10,
  }
};

// 心跳间隔（毫秒）- 每3秒发送一次心跳
const HEARTBEAT_INTERVAL = 3000;
// 心跳超时（毫秒）- 超过15秒没收到心跳才认为断开（允许错过4-5个心跳）
const HEARTBEAT_TIMEOUT = 15000;
// 心跳检查间隔（毫秒）- 每5秒检查一次
const HEARTBEAT_CHECK_INTERVAL = 5000;
// 重连尝试次数
const MAX_RECONNECT_ATTEMPTS = 3;
// 重连间隔（毫秒）
const RECONNECT_INTERVAL = 2000;

type MessageHandler = (message: GameMessage) => void;
type ConnectionHandler = (peerId: string) => void;
type LatencyHandler = (latencies: Map<string, number>) => void;

class PeerService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private disconnectionHandlers: ConnectionHandler[] = [];
  private latencyHandlers: LatencyHandler[] = [];
  private myPeerId: string | null = null;
  
  // 心跳相关
  private heartbeatInterval: number | null = null;
  private lastHeartbeat: Map<string, number> = new Map();
  private heartbeatCheckInterval: number | null = null;
  
  // 延迟测量相关
  private pendingPings: Map<string, number> = new Map(); // peerId -> ping发送时间
  private latencies: Map<string, number> = new Map(); // peerId -> 延迟(ms)
  
  // 重连相关
  private reconnectAttempts: Map<string, number> = new Map(); // peerId -> 重连尝试次数
  private reconnectTimers: Map<string, number> = new Map(); // peerId -> 重连定时器
  private isReconnecting: boolean = false;
  
  // 连接状态监控
  private connectionStates: Map<string, string> = new Map(); // peerId -> 状态描述
  
  /**
   * 初始化 Peer 连接（作为房主）
   */
  async createRoom(roomId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 使用房间ID作为 Peer ID
      const peerId = `yahtzee-${roomId}`;
      this.peer = new Peer(peerId, PEER_CONFIG);
      
      this.peer.on('open', (id) => {
        console.log('房间创建成功，Peer ID:', id);
        this.myPeerId = id;
        this.startHeartbeat();
        this.setupBeforeUnload();
        resolve(roomId);
      });
      
      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });
      
      this.peer.on('error', (err) => {
        console.error('Peer 错误:', err);
        reject(err);
      });
      
      // 监听与信令服务器断开
      this.peer.on('disconnected', () => {
        console.log('与信令服务器断开，尝试重连...');
        this.tryReconnectToServer();
      });
      
      // 监听 peer 关闭
      this.peer.on('close', () => {
        console.log('Peer 已关闭');
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

      // 设置超时（8秒，增加容错）
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        console.error('连接超时');
        this.disconnect();
        reject(new Error('连接超时，房间可能不存在'));
      }, 8000);

      this.peer.on('open', (id) => {
        console.log('我的 Peer ID:', id);
        this.myPeerId = id;

        // 连接到房主
        const hostPeerId = `yahtzee-${roomId}`;
        const conn = this.peer!.connect(hostPeerId, {
          reliable: true,
          serialization: 'json'
        });

        conn.on('open', () => {
          if (settled) return;
          settled = true;
          cleanup();
          console.log('已连接到房主');
          this.connections.set(hostPeerId, conn);
          this.setupConnectionHandlers(conn);
          this.startHeartbeat();
          this.setupBeforeUnload();
          resolve();
        });

        conn.on('error', (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          console.error('连接错误:', err);
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
        console.error('Peer 错误:', err);
        this.disconnect();
        reject(err);
      });

      // 监听与信令服务器断开
      this.peer.on('disconnected', () => {
        console.log('与信令服务器断开，尝试重连...');
        this.tryReconnectToServer();
      });
    });
  }

  /**
   * 尝试重连到信令服务器
   */
  private tryReconnectToServer() {
    if (!this.peer || this.peer.destroyed) {
      console.log('Peer 已销毁，无法重连');
      return;
    }

    if (this.isReconnecting) {
      console.log('已在重连中，跳过');
      return;
    }

    this.isReconnecting = true;

    // 尝试重连
    try {
      this.peer.reconnect();
      console.log('正在重连到信令服务器...');

      // 5秒后检查是否重连成功
      setTimeout(() => {
        this.isReconnecting = false;
        if (this.peer && !this.peer.disconnected) {
          console.log('重连信令服务器成功');
        } else {
          console.log('重连信令服务器失败');
        }
      }, 5000);
    } catch (err) {
      console.error('重连失败:', err);
      this.isReconnecting = false;
    }
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
    // 先停止现有的心跳
    this.stopHeartbeat();
    
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
            console.error('发送心跳失败:', peerId, err);
          }
        }
      });
    }, HEARTBEAT_INTERVAL);
    
    // 定期检查心跳超时（使用不同的检查间隔）
    this.heartbeatCheckInterval = window.setInterval(() => {
      const now = Date.now();
      const timedOutPeers: string[] = [];
      
      this.lastHeartbeat.forEach((lastTime, peerId) => {
        const timeSinceLastHeartbeat = now - lastTime;
        
        // 如果超时，记录下来
        if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
          console.log(`心跳超时: ${peerId}, 上次心跳: ${timeSinceLastHeartbeat}ms 前`);
          timedOutPeers.push(peerId);
        } else if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT * 0.7) {
          // 如果快要超时了，发送额外的心跳
          console.log(`心跳警告: ${peerId}, 已经 ${timeSinceLastHeartbeat}ms 没收到心跳`);
          const conn = this.connections.get(peerId);
          if (conn && conn.open) {
            try {
              conn.send({ type: 'ping', timestamp: now, urgent: true });
            } catch (err) {
              console.error('发送紧急心跳失败:', err);
            }
          }
        }
      });
      
      // 处理超时的连接
      timedOutPeers.forEach(peerId => {
        this.handlePeerTimeout(peerId);
      });
    }, HEARTBEAT_CHECK_INTERVAL);
  }
  
  /**
   * 处理 peer 心跳超时
   */
  private handlePeerTimeout(peerId: string) {
    const attempts = this.reconnectAttempts.get(peerId) || 0;
    
    if (attempts < MAX_RECONNECT_ATTEMPTS) {
      // 还有重连机会，尝试重连
      console.log(`尝试重连 ${peerId} (${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      this.reconnectAttempts.set(peerId, attempts + 1);
      
      // 给一个额外的缓冲时间
      this.lastHeartbeat.set(peerId, Date.now() + HEARTBEAT_TIMEOUT / 2);
      
      // 尝试发送一个 ping
      const conn = this.connections.get(peerId);
      if (conn && conn.open) {
        try {
          conn.send({ type: 'ping', timestamp: Date.now(), reconnect: true });
        } catch (err) {
          console.error('重连 ping 发送失败:', err);
        }
      }
    } else {
      // 重连次数用尽，真正断开
      console.log(`重连次数用尽，断开连接: ${peerId}`);
      this.cleanupPeer(peerId);
      this.disconnectionHandlers.forEach(handler => handler(peerId));
    }
  }
  
  /**
   * 清理 peer 相关数据
   */
  private cleanupPeer(peerId: string) {
    this.lastHeartbeat.delete(peerId);
    this.latencies.delete(peerId);
    this.pendingPings.delete(peerId);
    this.reconnectAttempts.delete(peerId);
    this.connectionStates.delete(peerId);
    
    // 清除重连定时器
    const timer = this.reconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(peerId);
    }
    
    // 关闭连接
    const conn = this.connections.get(peerId);
    if (conn) {
      try {
        conn.close();
      } catch {
        // 忽略关闭错误
      }
      this.connections.delete(peerId);
    }
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
    this.lastHeartbeat.clear();
    this.pendingPings.clear();
    this.latencies.clear();
    this.reconnectAttempts.clear();
    
    // 清除所有重连定时器
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
  }
  
  /**
   * 处理新连接
   */
  private handleConnection(conn: DataConnection) {
    console.log('收到新连接请求:', conn.peer);
    
    conn.on('open', () => {
      console.log('新玩家连接成功:', conn.peer);
      this.connections.set(conn.peer, conn);
      // 给足够的初始缓冲时间（2倍超时时间）
      this.lastHeartbeat.set(conn.peer, Date.now() + HEARTBEAT_TIMEOUT * 2);
      // 重置重连计数
      this.reconnectAttempts.set(conn.peer, 0);
      this.connectionStates.set(conn.peer, 'connected');
      this.setupConnectionHandlers(conn);
      
      // 通知连接处理器
      this.connectionHandlers.forEach(handler => handler(conn.peer));
    });
    
    conn.on('error', (err) => {
      console.error('新连接错误:', conn.peer, err);
    });
  }
  
  /**
   * 设置连接的消息处理
   */
  private setupConnectionHandlers(conn: DataConnection) {
    // 初始化心跳时间（给足够的初始缓冲时间）
    const initialTime = Date.now() + HEARTBEAT_TIMEOUT * 2;
    this.lastHeartbeat.set(conn.peer, initialTime);
    this.reconnectAttempts.set(conn.peer, 0); // 重置重连计数

    conn.on('data', (data) => {
      // 处理 ping/pong 消息
      if (data && typeof data === 'object' && 'type' in data) {
        const msgType = (data as { type: string }).type;

        // 收到任何消息都更新心跳时间
        this.lastHeartbeat.set(conn.peer, Date.now());
        // 收到消息说明连接正常，重置重连计数
        this.reconnectAttempts.set(conn.peer, 0);

        // 收到 ping，立即回复 pong
        if (msgType === 'ping') {
          const pingData = data as { type: string; timestamp: number };
          try {
            conn.send({ type: 'pong', timestamp: pingData.timestamp });
          } catch (err) {
            console.error('回复 pong 失败:', err);
          }
          return;
        }

        // 收到 pong，计算延迟
        if (msgType === 'pong') {
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
          return;
        }
      }

      const message = data as GameMessage;
      console.log('收到消息:', message);
      this.messageHandlers.forEach(handler => handler(message));
    });

    conn.on('close', () => {
      console.log('连接关闭:', conn.peer);
      this.connectionStates.set(conn.peer, 'closed');

      // 不立即处理断开，给一个短暂的缓冲期看是否能恢复
      const attempts = this.reconnectAttempts.get(conn.peer) || 0;
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        console.log(`连接关闭，等待可能的重连 (${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        this.reconnectAttempts.set(conn.peer, attempts + 1);

        // 延迟一段时间再处理
        const timer = window.setTimeout(() => {
          // 如果连接没有恢复，才真正断开
          if (this.connectionStates.get(conn.peer) !== 'connected') {
            console.log('连接未恢复，执行断开处理:', conn.peer);
            this.cleanupPeer(conn.peer);
            this.disconnectionHandlers.forEach(handler => handler(conn.peer));
          }
        }, RECONNECT_INTERVAL);

        this.reconnectTimers.set(conn.peer, timer);
      } else {
        // 重连次数用尽
        this.cleanupPeer(conn.peer);
        this.disconnectionHandlers.forEach(handler => handler(conn.peer));
      }
    });

    conn.on('error', (err) => {
      console.error('连接错误:', conn.peer, err);
      this.connectionStates.set(conn.peer, 'error');
    });

    // 监听 ICE 连接状态变化（如果可用）
    const pc = conn.peerConnection;
    if (pc) {
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`ICE 连接状态变化 (${conn.peer}):`, state);
        this.connectionStates.set(conn.peer, `ice-${state}`);

        if (state === 'disconnected' || state === 'failed') {
          console.log('ICE 连接断开/失败，但保持连接等待恢复');
          // 不立即断开，等待可能的恢复
        } else if (state === 'connected' || state === 'completed') {
          // 连接恢复，重置重连计数
          this.reconnectAttempts.set(conn.peer, 0);
          this.lastHeartbeat.set(conn.peer, Date.now());
        }
      };
    }
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
    
    console.log('广播消息:', message);
    this.connections.forEach((conn, peerId) => {
      if (conn.open) {
        try {
          conn.send(message);
        } catch (err) {
          console.error('广播消息失败:', peerId, err);
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
        console.error('发送消息失败:', peerId, err);
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
   * 注册断开连接处理器
   */
  onDisconnection(handler: ConnectionHandler) {
    this.disconnectionHandlers.push(handler);
    return () => {
      this.disconnectionHandlers = this.disconnectionHandlers.filter(h => h !== handler);
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
    
    // 关闭所有连接
    this.connections.forEach((conn) => {
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
    this.isReconnecting = false;
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
    this.latencyHandlers = [];
    this.connectionStates.clear();
  }
  
  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.peer !== null && !this.peer.disconnected;
  }
}

// 导出单例
export const peerService = new PeerService();
