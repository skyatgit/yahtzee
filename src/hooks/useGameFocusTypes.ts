/**
 * 游戏焦点相关类型定义
 */

/** 焦点区域类型 */
export type GameFocusArea = 'dice' | 'scorecard';

/** 游戏焦点上下文 */
export interface GameFocusContextValue {
  /** 当前焦点区域 */
  currentArea: GameFocusArea;
  /** 骰子区域焦点索引 (0-5，5是摇骰子按钮) */
  diceFocusIndex: number;
  /** 计分板焦点索引 */
  scoreFocusIndex: number;
  /** 切换到指定区域 */
  switchArea: (area: GameFocusArea) => void;
  /** 切换到下一个区域 */
  nextArea: () => void;
  /** 切换到上一个区域 */
  prevArea: () => void;
  /** 设置骰子区域焦点 */
  setDiceFocus: (index: number) => void;
  /** 设置计分板焦点 */
  setScoreFocus: (index: number) => void;
  /** 检查骰子是否获得焦点 */
  isDiceFocused: (index: number) => boolean;
  /** 检查摇骰子按钮是否获得焦点 */
  isRollButtonFocused: () => boolean;
  /** 检查计分项是否获得焦点 */
  isScoreFocused: (index: number) => boolean;
  /** 是否启用手柄 */
  enabled: boolean;
}
