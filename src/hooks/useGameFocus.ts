/**
 * 游戏焦点管理 Hook
 * 统一管理骰子区域和计分板区域的焦点
 * 
 * 游戏规则：
 * - 没轮到当前玩家时：隐藏选择
 * - 轮到玩家但还没摇骰子（rollsLeft === 3）：只能选摇骰子按钮
 * - 摇骰子次数用完（rollsLeft === 0）：自动切换到计分板，骰子区域不可选
 * - 正常情况：骰子和计分板都可选
 * - 使用键鼠或触屏时：隐藏选择框
 * - 方向键自动切换区域，适配横屏和竖屏布局
 * 
 * 布局说明：
 * - 横屏：计分板在左边，骰��区域在右边（骰子水平排列，按钮在下方）
 * - 竖屏：计分板在上面，骰子区域在下面（骰子水平排列，按钮在右边）
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useGamepadAction, useGamepadVibration, useGamepadConnection } from './useGamepad';
import { useInputMode } from './useInputMode';
import type { GamepadAction } from '../services/gamepadService';
import type { GameFocusArea, GameFocusContextValue } from './useGameFocusTypes';

/**
 * 检测当前是否为竖屏模式
 */
function isPortraitMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
}

/**
 * 游戏焦点 Provider 组件的 Hook
 */
export function useGameFocusProvider(options: {
  availableScoreCount: number;
  rollsLeft: number;
  canHoldDice: boolean;
  enabled?: boolean;
  onAreaChange?: (area: GameFocusArea) => void;
  onDiceConfirm?: (index: number) => void;
  onScoreConfirm?: (index: number) => void;
}): GameFocusContextValue {
  const {
    availableScoreCount,
    rollsLeft,
    canHoldDice,
    enabled = true,
    onAreaChange,
    onDiceConfirm,
    onScoreConfirm,
  } = options;
  
  const { hasGamepad } = useGamepadConnection();
  const { vibrateLight } = useGamepadVibration();
  const { showGamepadUI } = useInputMode();
  
  // 只有在有手柄连接且正在使用手柄时才启用
  const isEnabled = enabled && hasGamepad && showGamepadUI;
  
  // 根据游戏规则计算可用区域和焦点限制
  const gameRules = useMemo(() => {
    // 还没开始摇骰子：只能选摇骰子按钮
    if (rollsLeft === 3) {
      return {
        canSelectDice: false,
        canSelectRollButton: true,
        canSelectScorecard: false,
        forceDiceArea: true,
        forceRollButton: true,
      };
    }
    // 摇骰子次数用完：只能选计分板
    if (rollsLeft === 0) {
      return {
        canSelectDice: false,
        canSelectRollButton: false,
        canSelectScorecard: true,
        forceScorecardArea: true,
      };
    }
    // 正常情况：骰子可以锁定，可以继续摇，可以选择计分
    return {
      canSelectDice: canHoldDice,
      canSelectRollButton: true,
      canSelectScorecard: true,
    };
  }, [rollsLeft, canHoldDice]);
  
  const [currentArea, setCurrentArea] = useState<GameFocusArea>('dice');
  const [diceFocusIndex, setDiceFocusIndex] = useState(5); // 默认选中摇骰子按钮
  const [rawScoreFocusIndex, setRawScoreFocusIndex] = useState(0);
  // 记住从骰子区域切换到计分板时的焦点位置（横屏模式用于返回时恢复）
  const lastDiceFocusIndexRef = useRef(5);
  
  // 监听屏幕方向变化
  const [isPortrait, setIsPortrait] = useState(isPortraitMode);
  useEffect(() => {
    const handleResize = () => setIsPortrait(isPortraitMode());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // 当游戏规则变化时，自动调整焦点
  useEffect(() => {
    if (!isEnabled) return;
    
    // 使用 queueMicrotask 延迟状态更新，避免级联渲染
    queueMicrotask(() => {
      // 强制切换到骰子区域并选中摇骰子按钮
      if (gameRules.forceDiceArea && gameRules.forceRollButton) {
        setCurrentArea('dice');
        setDiceFocusIndex(5);
      }
      // 强制切换到计分板区域
      else if (gameRules.forceScorecardArea) {
        setCurrentArea('scorecard');
      }
    });
  }, [isEnabled, gameRules.forceDiceArea, gameRules.forceRollButton, gameRules.forceScorecardArea]);
  
  // 派生状态：在渲染时计算约束后的计分板焦点索引
  const scoreFocusIndex = useMemo(() => {
    if (availableScoreCount <= 0) return 0;
    return Math.min(rawScoreFocusIndex, availableScoreCount - 1);
  }, [rawScoreFocusIndex, availableScoreCount]);
  
  const callbacksRef = useRef({ onAreaChange, onDiceConfirm, onScoreConfirm });
  useEffect(() => { callbacksRef.current = { onAreaChange, onDiceConfirm, onScoreConfirm }; });
  
  const switchArea = useCallback((area: GameFocusArea) => {
    // 检查目标区域是否可用
    if (area === 'dice' && !gameRules.canSelectDice && !gameRules.canSelectRollButton) {
      return false;
    }
    if (area === 'scorecard' && !gameRules.canSelectScorecard) {
      return false;
    }
    
    let switched = false;
    setCurrentArea(prev => {
      if (prev !== area) {
        vibrateLight();
        callbacksRef.current.onAreaChange?.(area);
        switched = true;
        
        // 切换到骰子区域时，如果不能选骰子，直接选中摇骰子按钮
        if (area === 'dice' && !gameRules.canSelectDice) {
          setDiceFocusIndex(5);
        }
      }
      return area;
    });
    return switched;
  }, [vibrateLight, gameRules]);
  
  const nextArea = useCallback(() => {
    if (currentArea === 'dice' && gameRules.canSelectScorecard) {
      switchArea('scorecard');
    } else if (currentArea === 'scorecard' && (gameRules.canSelectDice || gameRules.canSelectRollButton)) {
      switchArea('dice');
    }
  }, [currentArea, switchArea, gameRules]);
  
  const prevArea = useCallback(() => {
    if (currentArea === 'dice' && gameRules.canSelectScorecard) {
      switchArea('scorecard');
    } else if (currentArea === 'scorecard' && (gameRules.canSelectDice || gameRules.canSelectRollButton)) {
      switchArea('dice');
    }
  }, [currentArea, switchArea, gameRules]);
  
  const setDiceFocus = useCallback((index: number) => {
    setDiceFocusIndex(Math.max(0, Math.min(5, index)));
  }, []);
  
  const setScoreFocus = useCallback((index: number) => {
    setRawScoreFocusIndex(index);
  }, []);
  
  const isDiceFocused = useCallback((index: number) => {
    if (!isEnabled) return false;
    if (currentArea !== 'dice') return false;
    if (!gameRules.canSelectDice) return false;
    return diceFocusIndex === index;
  }, [isEnabled, currentArea, diceFocusIndex, gameRules.canSelectDice]);
  
  const isRollButtonFocused = useCallback(() => {
    if (!isEnabled) return false;
    if (currentArea !== 'dice') return false;
    if (!gameRules.canSelectRollButton) return false;
    return diceFocusIndex === 5;
  }, [isEnabled, currentArea, diceFocusIndex, gameRules.canSelectRollButton]);
  
  const isScoreFocused = useCallback((index: number) => {
    if (!isEnabled) return false;
    if (currentArea !== 'scorecard') return false;
    if (!gameRules.canSelectScorecard) return false;
    return scoreFocusIndex === index;
  }, [isEnabled, currentArea, scoreFocusIndex, gameRules.canSelectScorecard]);
  
  useGamepadAction((action: GamepadAction) => {
    if (!isEnabled) return;
    
    /**
     * 布局说明：
     * 横屏：计分板(左) | 骰子区域(右)
     *       骰子[0][1][2][3][4]水平排列
     *       [摇骰子按钮] 在骰子下方
     * 
     * 竖屏：计分板(上)
     *       ─────────
     *       骰子区域(下)
     *       骰子[0][1][2][3][4]水平排列 | [摇骰子按钮]
     */
    
    switch (action) {
      case 'left':
        if (currentArea === 'dice') {
          if (!gameRules.canSelectDice) {
            // 不能选骰子时，只能从按钮切换到计分板
            if (diceFocusIndex === 5 && gameRules.canSelectScorecard) {
              switchArea('scorecard');
            }
            return;
          }
          
          if (isPortrait) {
            // 竖屏模式：骰子[0-4]水平 + 按钮在右边
            if (diceFocusIndex === 5) {
              // 从按钮向左，到最后一个骰子
              setDiceFocusIndex(4);
              vibrateLight();
            } else if (diceFocusIndex > 0) {
              // 骰子之间移动
              setDiceFocusIndex(prev => prev - 1);
              vibrateLight();
            }
            // 最左边骰子再按左，不切换区域（竖屏用上下切换）
          } else {
            // 横屏模式：计分板在左边
            if (diceFocusIndex === 5) {
              // 从按钮向左，切换到计分板
              if (gameRules.canSelectScorecard) {
                lastDiceFocusIndexRef.current = 5; // 记住是从按钮切换的
                switchArea('scorecard');
              }
            } else if (diceFocusIndex > 0) {
              // 骰子之间移动
              setDiceFocusIndex(prev => prev - 1);
              vibrateLight();
            } else {
              // 最左边骰子再按左，切换到计分板
              if (gameRules.canSelectScorecard) {
                lastDiceFocusIndexRef.current = 0; // 记住是从骰子切换的
                switchArea('scorecard');
              }
            }
          }
        }
        // 计分板区域左键无效
        break;
        
      case 'right':
        if (currentArea === 'dice') {
          if (isPortrait) {
            // 竖屏模式：骰子[0-4]水平 + 按钮在右边
            if (!gameRules.canSelectDice) return;
            
            if (diceFocusIndex < 4) {
              // 骰子之间移动
              setDiceFocusIndex(prev => prev + 1);
              vibrateLight();
            } else if (diceFocusIndex === 4 && gameRules.canSelectRollButton) {
              // 从最右骰子到按钮
              setDiceFocusIndex(5);
              vibrateLight();
            }
            // 从按钮再按右，不切换（竖屏用上下切换）
          } else {
            // 横屏模式：按钮和最右骰子按右键无效
            if (gameRules.canSelectDice && diceFocusIndex < 4) {
              // 骰子之间移动
              setDiceFocusIndex(prev => prev + 1);
              vibrateLight();
            }
            // 按钮（索引5）和最右骰子（索引4）按右键无效
          }
        } else if (currentArea === 'scorecard') {
          // 计分板区域
          if (!isPortrait) {
            // 横屏：从计分板向右切换到骰子区域，恢复之前的焦点位置
            if (gameRules.canSelectDice || gameRules.canSelectRollButton) {
              switchArea('dice');
              // 恢复之前的焦点位置
              if (lastDiceFocusIndexRef.current === 5 && gameRules.canSelectRollButton) {
                setDiceFocusIndex(5); // 恢复到按钮
              } else if (gameRules.canSelectDice) {
                setDiceFocusIndex(0); // 恢复到骰子
              } else {
                setDiceFocusIndex(5); // 只能选按钮
              }
            }
          }
          // 竖屏时右键无效
        }
        break;
        
      case 'up':
        if (currentArea === 'scorecard') {
          const constrained = Math.min(rawScoreFocusIndex, availableScoreCount - 1);
          if (constrained > 0) {
            // 计分项之间移动
            setRawScoreFocusIndex(constrained - 1);
            vibrateLight();
          }
          // 最上面再按上无效
        } else if (currentArea === 'dice') {
          if (isPortrait) {
            // 竖屏模式：从骰子区域向上切换到计分板
            if (gameRules.canSelectScorecard) {
              switchArea('scorecard');
              // 切换后选中最后一个计分项
              setRawScoreFocusIndex(availableScoreCount - 1);
            }
          } else {
            // 横屏模式：上键在骰子区域内移动
            if (diceFocusIndex === 5 && gameRules.canSelectDice) {
              // 从按钮向上到骰子
              setDiceFocusIndex(2);
              vibrateLight();
            }
            // 骰子上按上键无效
          }
        }
        break;
        
      case 'down':
        if (currentArea === 'scorecard') {
          const constrained = Math.min(rawScoreFocusIndex, availableScoreCount - 1);
          if (constrained < availableScoreCount - 1) {
            // 计分项之间移动
            setRawScoreFocusIndex(constrained + 1);
            vibrateLight();
          } else if (isPortrait) {
            // 竖屏模式：计分板最下面再按下，切换到骰子区域
            if (gameRules.canSelectDice || gameRules.canSelectRollButton) {
              switchArea('dice');
              if (!gameRules.canSelectDice) {
                setDiceFocusIndex(5); // 只能选按钮
              } else {
                setDiceFocusIndex(2); // 选中中间骰子
              }
            }
          }
        } else if (currentArea === 'dice') {
          if (!isPortrait) {
            // 横屏模式：下键在骰子区域内移动
            if (diceFocusIndex < 5 && gameRules.canSelectDice && gameRules.canSelectRollButton) {
              // 从骰子向下到按钮
              setDiceFocusIndex(5);
              vibrateLight();
            }
            // 按钮下按下键无效
          }
          // 竖屏模式：骰子区域下键无效
        }
        break;
        
      case 'confirm':
        if (currentArea === 'dice') {
          callbacksRef.current.onDiceConfirm?.(diceFocusIndex);
        } else if (currentArea === 'scorecard') {
          callbacksRef.current.onScoreConfirm?.(scoreFocusIndex);
        }
        break;
    }
  }, [isEnabled, currentArea, diceFocusIndex, availableScoreCount, rawScoreFocusIndex, scoreFocusIndex, vibrateLight, isPortrait, gameRules, switchArea]);
  
  return {
    currentArea,
    diceFocusIndex,
    scoreFocusIndex,
    switchArea,
    nextArea,
    prevArea,
    setDiceFocus,
    setScoreFocus,
    isDiceFocused,
    isRollButtonFocused,
    isScoreFocused,
    enabled: isEnabled,
  };
}
