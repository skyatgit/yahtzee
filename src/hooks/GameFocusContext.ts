/**
 * 游戏焦点 Context - 纯 Context 定义文件
 */

import { createContext } from 'react';
import type { GameFocusContextValue } from './useGameFocusTypes';

export const GameFocusContext = createContext<GameFocusContextValue | null>(null);
