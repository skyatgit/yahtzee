/**
 * PeerJS 联机服务
 * 使用 PeerJS 官方服务器实现P2P联机
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

// PeerJS 配置（使用官方服务器）
const PEER_CONFIG = {
  debug: 1
};

// 心跳间隔（毫秒）
const HEARTBEAT_INTERVAL = 2000;
// 心跳超时（毫秒）- 超过这个时间没收到心跳就认为断开
const HEARTBEAT_TIMEOUT = 6000;

type MessageHandler = (message: GameMessage) => void;
type ConnectionHandler = (peerId: string) => void;

class PeerService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private disconnectionHandlers: ConnectionHandler[] = [];
  private myPeerId: string | null = null;
  
  // 心跳相关
  private heartbeatInterval: number | null = null;
  private lastHeartbeat: Map<string, number> = new Map();
  private heartbeatCheckInterval: number | null = null;
  
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
      
      // 设置超时（5秒）
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        console.error('连接超时');
        this.disconnect();
        reject(new Error('连接超时，房间可能不存在'));
      }, 5000);
      
      this.peer.on('open', (id) => {
        console.log('我的 Peer ID:', id);
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
    // 定期发送心跳
    this.heartbeatInterval = window.setInterval(() => {
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.send({ type: 'heartbeat', timestamp: Date.now() });
        }
      });
    }, HEARTBEAT_INTERVAL);
    
    // 定期检查心跳超时
    this.heartbeatCheckInterval = window.setInterval(() => {
      const now = Date.now();
      this.lastHeartbeat.forEach((lastTime, peerId) => {
        if (now - lastTime > HEARTBEAT_TIMEOUT) {
          console.log('心跳超时，断开连接:', peerId);
          this.lastHeartbeat.delete(peerId);
          const conn = this.connections.get(peerId);
          if (conn) {
            this.connections.delete(peerId);
            this.disconnectionHandlers.forEach(handler => handler(peerId));
          }
        }
      });
    }, HEARTBEAT_INTERVAL);
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
  }
  
  /**
   * 处理新连接
   */
  private handleConnection(conn: DataConnection) {
    conn.on('open', () => {
      console.log('新玩家连接:', conn.peer);
      this.connections.set(conn.peer, conn);
      this.lastHeartbeat.set(conn.peer, Date.now());
      this.setupConnectionHandlers(conn);
      
      // 通知连接处理器
      this.connectionHandlers.forEach(handler => handler(conn.peer));
    });
  }
  
  /**
   * 设置连接的消息处理
   */
  private setupConnectionHandlers(conn: DataConnection) {
    // 初始化心跳时间
    this.lastHeartbeat.set(conn.peer, Date.now());
    
    conn.on('data', (data) => {
      // 处理心跳消息
      if (data && typeof data === 'object' && 'type' in data) {
        if ((data as { type: string }).type === 'heartbeat') {
          this.lastHeartbeat.set(conn.peer, Date.now());
          return;
        }
      }
      
      const message = data as GameMessage;
      console.log('收到消息:', message);
      this.messageHandlers.forEach(handler => handler(message));
    });
    
    conn.on('close', () => {
      console.log('连接关闭:', conn.peer);
      this.connections.delete(conn.peer);
      this.lastHeartbeat.delete(conn.peer);
      this.disconnectionHandlers.forEach(handler => handler(conn.peer));
    });
    
    conn.on('error', (err) => {
      console.error('连接错误:', err);
    });
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
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(message);
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
      conn.send(message);
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
    
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
    this.myPeerId = null;
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
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
