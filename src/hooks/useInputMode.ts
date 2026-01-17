/**
 * 输入模式检测 Hook
 * 自动检测用户当前使用的输入方式（手柄/键鼠/触屏）
 * 手柄模式：控件效果只由手柄 focused 决定，禁用鼠标 hover
 * 键鼠模式：控件效果只由鼠标 hover 决定
 */

import { useState, useEffect, useCallback } from 'react';

/** 输入模式类型 */
export type InputMode = 'gamepad' | 'keyboard' | 'touch';

/**
 * 检测当前输入模式
 */
export function useInputMode() {
  const [inputMode, setInputMode] = useState<InputMode>('keyboard');
  const [lastGamepadInput, setLastGamepadInput] = useState(0);
  
  // 处理手柄输入
  const handleGamepadInput = useCallback(() => {
    setInputMode('gamepad');
    setLastGamepadInput(Date.now());
  }, []);
  
  // 处理键盘/鼠标输入
  const handleKeyboardMouseInput = useCallback(() => {
    if (Date.now() - lastGamepadInput < 100) return;
    setInputMode('keyboard');
  }, [lastGamepadInput]);
  
  // 处理触屏输入
  const handleTouchInput = useCallback(() => {
    if (Date.now() - lastGamepadInput < 100) return;
    setInputMode('touch');
  }, [lastGamepadInput]);
  
  // 根据输入模式设置 data 属性
  useEffect(() => {
    // 设置输入模式属性，CSS 根据此属性决定显示效果
    document.documentElement.setAttribute('data-input-mode', inputMode);
    
    return () => {
      document.documentElement.removeAttribute('data-input-mode');
    };
  }, [inputMode]);
  
  useEffect(() => {
    const onKeyDown = () => handleKeyboardMouseInput();
    const onMouseMove = () => handleKeyboardMouseInput();
    const onMouseDown = () => handleKeyboardMouseInput();
    const onTouchStart = () => handleTouchInput();
    
    let animationFrameId: number;
    let lastButtons: boolean[] = [];
    
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads();
      for (const gamepad of gamepads) {
        if (!gamepad) continue;
        
        const currentButtons = gamepad.buttons.map(b => b.pressed);
        const hasButtonChange = currentButtons.some((pressed, i) => 
          pressed && !lastButtons[i]
        );
        const hasAxisMove = gamepad.axes.some(axis => Math.abs(axis) > 0.5);
        
        if (hasButtonChange || hasAxisMove) {
          handleGamepadInput();
        }
        
        lastButtons = currentButtons;
      }
      
      animationFrameId = requestAnimationFrame(pollGamepad);
    };
    
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('touchstart', onTouchStart);
    animationFrameId = requestAnimationFrame(pollGamepad);
    
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('touchstart', onTouchStart);
      cancelAnimationFrame(animationFrameId);
    };
  }, [handleKeyboardMouseInput, handleTouchInput, handleGamepadInput]);
  
  const showGamepadUI = inputMode === 'gamepad';
  
  return {
    inputMode,
    showGamepadUI,
    isGamepad: inputMode === 'gamepad',
    isKeyboard: inputMode === 'keyboard',
    isTouch: inputMode === 'touch',
  };
}
