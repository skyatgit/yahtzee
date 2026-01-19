/**
 * 联机同步事件处理
 * 用于在组件之间共享事件回调
 */

import type { ConnectionStatus, DisconnectReason } from '../../services/peerService';
import type { Player } from '../../types/game';

// 断开原因类型（扩展）
export type DisconnectReasonExtended = DisconnectReason | 'host_network' | 'host_left';

// 当所有其他玩家退出时的回调类型
type AllPlayersLeftCallback = (reason?: DisconnectReasonExtended) => void;

// 连接状态变化回调类型
type ConnectionStatusChangeCallback = (peerId: string, status: ConnectionStatus, reason?: DisconnectReason) => void;

// 游戏结束回调类型（客户端用）
type GameOverEventCallback = (finalPlayers: Player[], roomId: string | null) => void;

// 回调存储
let allPlayersLeftCallback: AllPlayersLeftCallback | null = null;
let connectionStatusChangeCallback: ConnectionStatusChangeCallback | null = null;
let gameOverEventCallback: GameOverEventCallback | null = null;

/**
 * 注册所有玩家退出的回调
 * @param callback 回调函数
 * @returns 取消注册的函数
 */
export function onAllPlayersLeft(callback: AllPlayersLeftCallback) {
  allPlayersLeftCallback = callback;
  return () => {
    allPlayersLeftCallback = null;
  };
}

/**
 * 触发所有玩家退出事件
 */
export function triggerAllPlayersLeft(reason?: DisconnectReasonExtended) {
  if (allPlayersLeftCallback) {
    allPlayersLeftCallback(reason);
  }
}

/**
 * 注册连接状态变化回调
 * @param callback 回调函数
 * @returns 取消注册的函数
 */
export function onConnectionStatusChange(callback: ConnectionStatusChangeCallback) {
  connectionStatusChangeCallback = callback;
  return () => {
    connectionStatusChangeCallback = null;
  };
}

/**
 * 触发连接状态变化事件
 */
export function triggerConnectionStatusChange(peerId: string, status: ConnectionStatus, reason?: DisconnectReason) {
  if (connectionStatusChangeCallback) {
    connectionStatusChangeCallback(peerId, status, reason);
  }
}

/**
 * 注册游戏结束事件回调（客户端用）
 * @param callback 回调函数
 * @returns 取消注册的函数
 */
export function onGameOverEvent(callback: GameOverEventCallback) {
  gameOverEventCallback = callback;
  return () => {
    gameOverEventCallback = null;
  };
}

/**
 * 触发游戏结束事件（客户端用）
 */
export function triggerGameOverEvent(finalPlayers: Player[], roomId: string | null) {
  if (gameOverEventCallback) {
    gameOverEventCallback(finalPlayers, roomId);
  }
}
