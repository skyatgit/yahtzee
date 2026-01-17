/**
 * 游戏焦点 Provider 组件
 */

import { GameFocusContext } from './GameFocusContext';
import type { GameFocusContextValue } from './useGameFocusTypes';

export function GameFocusProvider({ 
  children, 
  value 
}: { 
  children: React.ReactNode; 
  value: GameFocusContextValue;
}) {
  return (
    <GameFocusContext.Provider value={value}>
      {children}
    </GameFocusContext.Provider>
  );
}
