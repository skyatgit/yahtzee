/**
 * 手柄 Hook
 * 提供 React 组件使用手柄输入的接口
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { gamepadService, type GamepadAction } from '../services/gamepadService';

/**
 * 手柄连接状态 Hook
 * 返回当前连接的手柄数量和是否有手柄连接
 */
export function useGamepadConnection() {
  const [connectedCount, setConnectedCount] = useState(() => gamepadService.getConnectedCount());
  const [hasGamepad, setHasGamepad] = useState(() => gamepadService.hasGamepad());
  
  useEffect(() => {
    // 监听连接变化
    const unsubscribe = gamepadService.onConnect(() => {
      setConnectedCount(gamepadService.getConnectedCount());
      setHasGamepad(gamepadService.hasGamepad());
    });
    
    // 启动轮询
    gamepadService.start();
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  return { connectedCount, hasGamepad };
}

/**
 * 手柄动作 Hook
 * 监听手柄动作并执行回调
 */
export function useGamepadAction(
  handler: (action: GamepadAction, gamepadIndex: number) => void,
  deps: React.DependencyList = []
) {
  // 使用 ref 保存最新的 handler
  const handlerRef = useRef(handler);
  
  // 将 deps 转换为稳定的字符串，用于依赖比较
  const depsKey = JSON.stringify(deps);
  
  // 在 effect 中更新 ref，避免在渲染期间访问 ref
  useEffect(() => {
    handlerRef.current = handler;
  });
  
  useEffect(() => {
    const unsubscribe = gamepadService.onAction((action, gamepadIndex) => {
      handlerRef.current(action, gamepadIndex);
    });
    
    // 确保服务已启动
    gamepadService.start();
    
    return unsubscribe;
  }, [depsKey]);
}

/**
 * 手柄震动 Hook
 * 提供震动反馈功能
 */
export function useGamepadVibration() {
  const vibrate = useCallback((
    gamepadIndex: number = 0,
    duration: number = 100,
    weak: number = 0.5,
    strong: number = 0.5
  ) => {
    gamepadService.vibrate(gamepadIndex, duration, weak, strong);
  }, []);
  
  const vibrateLight = useCallback((gamepadIndex: number = 0) => {
    gamepadService.vibrate(gamepadIndex, 50, 0.3, 0);
  }, []);
  
  const vibrateMedium = useCallback((gamepadIndex: number = 0) => {
    gamepadService.vibrate(gamepadIndex, 100, 0.5, 0.3);
  }, []);
  
  const vibrateStrong = useCallback((gamepadIndex: number = 0) => {
    gamepadService.vibrate(gamepadIndex, 150, 1, 0.8);
  }, []);
  
  return { vibrate, vibrateLight, vibrateMedium, vibrateStrong };
}

/**
 * 手柄导航 Hook
 * 为组件提供简单的方向导航支持
 */
export function useGamepadNavigation(options: {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  enabled?: boolean;
}) {
  const {
    onUp,
    onDown,
    onLeft,
    onRight,
    onConfirm,
    onCancel,
    enabled = true,
  } = options;
  
  useGamepadAction((action) => {
    if (!enabled) return;
    
    switch (action) {
      case 'up':
        onUp?.();
        break;
      case 'down':
        onDown?.();
        break;
      case 'left':
        onLeft?.();
        break;
      case 'right':
        onRight?.();
        break;
      case 'confirm':
        onConfirm?.();
        break;
      case 'cancel':
        onCancel?.();
        break;
    }
  }, [onUp, onDown, onLeft, onRight, onConfirm, onCancel, enabled]);
}
