/**
 * 联机同步事件处理
 * 用于在组件之间共享事件回调
 */

// 当所有其他玩家退出时的回调类型
type AllPlayersLeftCallback = () => void;

// 回调存储
let allPlayersLeftCallback: AllPlayersLeftCallback | null = null;

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
export function triggerAllPlayersLeft() {
  if (allPlayersLeftCallback) {
    allPlayersLeftCallback();
  }
}
