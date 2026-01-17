/**
 * 手柄服务
 * 处理 Gamepad API 的封装和事件管理
 */

// 标准手柄按键映射（参考 Xbox/PS 布局）
export const GamepadButton = {
  A: 0,        // Xbox A / PS ✕ - 确认
  B: 1,        // Xbox B / PS ○ - 取消/返回
  X: 2,        // Xbox X / PS □ - 踢人
  DpadUp: 12,      // 十字键上
  DpadDown: 13,    // 十字键下
  DpadLeft: 14,    // 十字键左
  DpadRight: 15,   // 十字键右
} as const;

// 手柄轴映射
export const GamepadAxis = {
  LeftStickX: 0,   // 左摇杆横向 (-1 到 1)
  LeftStickY: 1,   // 左摇杆纵向 (-1 到 1)
} as const;

// 手柄动作类型
export type GamepadAction =
  | 'confirm'       // 确认选择 (A键)
  | 'cancel'        // 取消/返回 (B键)
  | 'kick'          // 踢人 (X键)
  | 'up'            // 向上导航 (十字键/摇杆)
  | 'down'          // 向下导航 (十字键/摇杆)
  | 'left'          // 向左导航 (十字键/摇杆)
  | 'right';        // 向右导航 (十字键/摇杆)

// 手柄事件监听器类型
type GamepadActionListener = (action: GamepadAction, gamepadIndex: number) => void;
type GamepadConnectListener = (gamepad: Gamepad, connected: boolean) => void;

// 摇杆死区阈值
const STICK_DEADZONE = 0.5;
// 按键重复延迟（毫秒）
const REPEAT_DELAY = 400;
// 按键重复间隔（毫秒）
const REPEAT_INTERVAL = 100;

/**
 * 手柄服务类
 * 单例模式，管理所有手柄输入
 */
class GamepadService {
  private isRunning = false;
  private animationFrameId: number | null = null;
  private actionListeners: Set<GamepadActionListener> = new Set();
  private connectListeners: Set<GamepadConnectListener> = new Set();
  
  // 按键状态追踪（用于检测按键按下/释放）
  private buttonStates: Map<number, Map<number, boolean>> = new Map();
  // 摇杆方向状态追踪
  private stickStates: Map<number, { x: number; y: number }> = new Map();
  
  // 按键重复计时器
  private repeatTimers: Map<string, { lastTime: number; isHeld: boolean }> = new Map();
  
  // 已连接的手柄
  private connectedGamepads: Map<number, Gamepad> = new Map();
  
  // 震动支持
  private vibrationEnabled = true;
  
  constructor() {
    // 监听手柄连接/断开事件
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.handleGamepadConnected);
      window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }
  }
  
  /**
   * 启动手柄轮询
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollGamepads();
  }
  
  /**
   * 停止手柄轮询
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * 添加手柄动作监听器
   */
  onAction(listener: GamepadActionListener): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }
  
  /**
   * 添加手柄连接监听器
   */
  onConnect(listener: GamepadConnectListener): () => void {
    this.connectListeners.add(listener);
    return () => this.connectListeners.delete(listener);
  }
  
  /**
   * 获取已连接手柄数量
   */
  getConnectedCount(): number {
    return this.connectedGamepads.size;
  }
  
  /**
   * 是否有手柄连接
   */
  hasGamepad(): boolean {
    return this.connectedGamepads.size > 0;
  }
  
  /**
   * 触发手柄震动
   */
  vibrate(gamepadIndex: number, duration: number = 100, weakMagnitude: number = 0.5, strongMagnitude: number = 0.5) {
    if (!this.vibrationEnabled) return;
    
    const gamepad = this.connectedGamepads.get(gamepadIndex);
    if (!gamepad || !gamepad.vibrationActuator) return;
    
    try {
      // 标准 Gamepad API 震动
      (gamepad.vibrationActuator as GamepadHapticActuator & {
        playEffect: (type: string, params: { duration: number; weakMagnitude: number; strongMagnitude: number }) => Promise<string>;
      }).playEffect?.('dual-rumble', {
        duration,
        weakMagnitude,
        strongMagnitude,
      });
    } catch (e) {
      // 某些浏览器可能不支持
      console.debug('手柄震动不可用:', e);
    }
  }
  
  /**
   * 设置是否启用震动
   */
  setVibrationEnabled(enabled: boolean) {
    this.vibrationEnabled = enabled;
  }
  
  /**
   * 获取震动是否启用
   */
  isVibrationEnabled(): boolean {
    return this.vibrationEnabled;
  }
  
  /**
   * 手柄连接事件处理
   */
  private handleGamepadConnected = (event: GamepadEvent) => {
    const gamepad = event.gamepad;
    this.connectedGamepads.set(gamepad.index, gamepad);
    this.buttonStates.set(gamepad.index, new Map());
    this.stickStates.set(gamepad.index, { x: 0, y: 0 });
    
    console.log(`手柄已连接: ${gamepad.id} (索引: ${gamepad.index})`);
    
    // 通知监听器
    this.connectListeners.forEach(listener => listener(gamepad, true));
    
    // 自动启动轮询
    this.start();
  };
  
  /**
   * 手柄断开事件处理
   */
  private handleGamepadDisconnected = (event: GamepadEvent) => {
    const gamepad = event.gamepad;
    this.connectedGamepads.delete(gamepad.index);
    this.buttonStates.delete(gamepad.index);
    this.stickStates.delete(gamepad.index);
    
    console.log(`手柄已断开: ${gamepad.id} (索引: ${gamepad.index})`);
    
    // 通知监听器
    this.connectListeners.forEach(listener => listener(gamepad, false));
    
    // 如果没有手柄了，停止轮询
    if (this.connectedGamepads.size === 0) {
      this.stop();
    }
  };
  
  /**
   * 轮询手柄状态
   */
  private pollGamepads = () => {
    if (!this.isRunning) return;
    
    // 获取最新的手柄状态
    const gamepads = navigator.getGamepads();
    
    for (const gamepad of gamepads) {
      if (!gamepad) continue;
      
      // 更新缓存的手柄引用
      this.connectedGamepads.set(gamepad.index, gamepad);
      
      // 处理按键输入
      this.processButtons(gamepad);
      
      // 处理摇杆输入
      this.processSticks(gamepad);
    }
    
    // 继续轮询
    this.animationFrameId = requestAnimationFrame(this.pollGamepads);
  };
  
  /**
   * 处理按键输入
   */
  private processButtons(gamepad: Gamepad) {
    const buttonState = this.buttonStates.get(gamepad.index) || new Map();
    const now = Date.now();
    
    // 遍历所有按键
    gamepad.buttons.forEach((button, index) => {
      const wasPressed = buttonState.get(index) || false;
      const isPressed = button.pressed;
      
      // 按键刚按下
      if (isPressed && !wasPressed) {
        buttonState.set(index, true);
        const action = this.mapButtonToAction(index);
        if (action) {
          this.emitAction(action, gamepad.index);
          // 开始重复计时
          this.repeatTimers.set(`${gamepad.index}-${index}`, { lastTime: now, isHeld: true });
        }
      }
      // 按键释放
      else if (!isPressed && wasPressed) {
        buttonState.set(index, false);
        this.repeatTimers.delete(`${gamepad.index}-${index}`);
      }
      // 按键持续按住 - 处理重复
      else if (isPressed && wasPressed) {
        const repeatKey = `${gamepad.index}-${index}`;
        const repeatState = this.repeatTimers.get(repeatKey);
        if (repeatState) {
          const elapsed = now - repeatState.lastTime;
          const threshold = repeatState.isHeld ? REPEAT_DELAY : REPEAT_INTERVAL;
          
          // 只对方向键启用重复
          if (elapsed >= threshold && this.isDirectionalButton(index)) {
            const action = this.mapButtonToAction(index);
            if (action) {
              this.emitAction(action, gamepad.index);
              this.repeatTimers.set(repeatKey, { lastTime: now, isHeld: false });
            }
          }
        }
      }
    });
    
    this.buttonStates.set(gamepad.index, buttonState);
  }
  
  /**
   * 处理摇杆输入
   */
  private processSticks(gamepad: Gamepad) {
    const stickState = this.stickStates.get(gamepad.index) || { x: 0, y: 0 };
    const now = Date.now();
    
    // 获取左摇杆值
    const leftX = gamepad.axes[GamepadAxis.LeftStickX] || 0;
    const leftY = gamepad.axes[GamepadAxis.LeftStickY] || 0;
    
    // 计算方向（应用死区）
    const newX = Math.abs(leftX) > STICK_DEADZONE ? Math.sign(leftX) : 0;
    const newY = Math.abs(leftY) > STICK_DEADZONE ? Math.sign(leftY) : 0;
    
    // 检测方向变化
    if (newX !== stickState.x || newY !== stickState.y) {
      // 水平方向
      if (newX !== 0 && newX !== stickState.x) {
        this.emitAction(newX > 0 ? 'right' : 'left', gamepad.index);
        this.repeatTimers.set(`${gamepad.index}-stickX`, { lastTime: now, isHeld: true });
      }
      // 垂直方向
      if (newY !== 0 && newY !== stickState.y) {
        this.emitAction(newY > 0 ? 'down' : 'up', gamepad.index);
        this.repeatTimers.set(`${gamepad.index}-stickY`, { lastTime: now, isHeld: true });
      }
      
      // 清除重复计时器
      if (newX === 0) this.repeatTimers.delete(`${gamepad.index}-stickX`);
      if (newY === 0) this.repeatTimers.delete(`${gamepad.index}-stickY`);
      
      stickState.x = newX;
      stickState.y = newY;
      this.stickStates.set(gamepad.index, stickState);
    } else {
      // 持续同一方向 - 处理重复
      if (newX !== 0) {
        const repeatKey = `${gamepad.index}-stickX`;
        const repeatState = this.repeatTimers.get(repeatKey);
        if (repeatState) {
          const elapsed = now - repeatState.lastTime;
          const threshold = repeatState.isHeld ? REPEAT_DELAY : REPEAT_INTERVAL;
          if (elapsed >= threshold) {
            this.emitAction(newX > 0 ? 'right' : 'left', gamepad.index);
            this.repeatTimers.set(repeatKey, { lastTime: now, isHeld: false });
          }
        }
      }
      if (newY !== 0) {
        const repeatKey = `${gamepad.index}-stickY`;
        const repeatState = this.repeatTimers.get(repeatKey);
        if (repeatState) {
          const elapsed = now - repeatState.lastTime;
          const threshold = repeatState.isHeld ? REPEAT_DELAY : REPEAT_INTERVAL;
          if (elapsed >= threshold) {
            this.emitAction(newY > 0 ? 'down' : 'up', gamepad.index);
            this.repeatTimers.set(repeatKey, { lastTime: now, isHeld: false });
          }
        }
      }
    }
  }
  
  /**
   * 将按键索引映射到动作
   */
  private mapButtonToAction(buttonIndex: number): GamepadAction | null {
    switch (buttonIndex) {
      case GamepadButton.A:
        return 'confirm';
      case GamepadButton.B:
        return 'cancel';
      case GamepadButton.X:
        return 'kick';
      case GamepadButton.DpadUp:
        return 'up';
      case GamepadButton.DpadDown:
        return 'down';
      case GamepadButton.DpadLeft:
        return 'left';
      case GamepadButton.DpadRight:
        return 'right';
      default:
        return null;
    }
  }
  
  /**
   * 判断是否是方向按键
   */
  private isDirectionalButton(buttonIndex: number): boolean {
    const directionalButtons: number[] = [
      GamepadButton.DpadUp,
      GamepadButton.DpadDown,
      GamepadButton.DpadLeft,
      GamepadButton.DpadRight,
    ];
    return directionalButtons.includes(buttonIndex);
  }
  
  /**
   * 发送动作事件
   */
  private emitAction(action: GamepadAction, gamepadIndex: number) {
    this.actionListeners.forEach(listener => listener(action, gamepadIndex));
  }
}

// 导出单例实例
export const gamepadService = new GamepadService();
