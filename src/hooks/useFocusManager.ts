/**
 * 焦点管理 Hook
 * 管理手柄/键盘导航时的焦点状态
 * 支持根据实际布局进行导航
 * 使用键鼠或触屏时自动隐藏焦点
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useGamepadAction, useGamepadVibration } from './useGamepad';
import { useInputMode } from './useInputMode';
import type { GamepadAction } from '../services/gamepadService';

function constrainListIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function useListFocus(options: {
  items: string[];
  onSelect?: (itemId: string) => void;
  onCancel?: () => void;
  initialIndex?: number;
  enabled?: boolean;
  loop?: boolean;
}) {
  const { items, onSelect, onCancel, initialIndex = 0, enabled = true, loop = true } = options;
  const { vibrateLight } = useGamepadVibration();
  const { showGamepadUI } = useInputMode();
  
  // 只有在使用手柄时才显示焦点
  const isActive = enabled && showGamepadUI;

  const callbacksRef = useRef({ onSelect, onCancel });
  useEffect(() => { callbacksRef.current = { onSelect, onCancel }; });

  const [rawFocusIndex, setRawFocusIndex] = useState(() => constrainListIndex(initialIndex, items.length));

  // 派生状态：在渲染时计算约束后的焦点索引
  const focusIndex = useMemo(() => constrainListIndex(rawFocusIndex, items.length), [rawFocusIndex, items.length]);

  useGamepadAction((action: GamepadAction) => {
    if (!isActive || items.length === 0) return;
    switch (action) {
      case 'up':
        setRawFocusIndex(prev => {
          const constrained = constrainListIndex(prev, items.length);
          let newIndex = constrained - 1;
          if (newIndex < 0) newIndex = loop ? items.length - 1 : 0;
          if (newIndex !== constrained) vibrateLight();
          return newIndex;
        });
        break;
      case 'down':
        setRawFocusIndex(prev => {
          const constrained = constrainListIndex(prev, items.length);
          let newIndex = constrained + 1;
          if (newIndex >= items.length) newIndex = loop ? 0 : items.length - 1;
          if (newIndex !== constrained) vibrateLight();
          return newIndex;
        });
        break;
      case 'confirm':
        if (items[focusIndex]) callbacksRef.current.onSelect?.(items[focusIndex]);
        break;
      case 'cancel':
        callbacksRef.current.onCancel?.();
        break;
    }
  }, [isActive, items, focusIndex, loop, vibrateLight]);

  const isFocused = useCallback((index: number) => isActive && focusIndex === index, [isActive, focusIndex]);
  const focusedItem = isActive ? (items[focusIndex] || null) : null;

  return { focusIndex, setFocusIndex: setRawFocusIndex, isFocused, focusedItem };
}

function constrainPosition(pos: { row: number; col: number }, rows: string[][]): { row: number; col: number } {
  if (rows.length === 0) return { row: 0, col: 0 };
  const newRow = Math.max(0, Math.min(pos.row, rows.length - 1));
  const rowItems = rows[newRow] || [];
  const newCol = Math.max(0, Math.min(pos.col, rowItems.length - 1));
  return { row: newRow, col: newCol };
}

export function useLayoutNavigation(options: {
  rows: string[][];
  onSelect?: (itemId: string) => void;
  onCancel?: () => void;
  onKick?: (itemId: string) => void;
  initialItem?: string;
  enabled?: boolean;
  verticalLoop?: boolean;
  horizontalLoop?: boolean;
}) {
  const {
    rows,
    onSelect,
    onCancel,
    onKick,
    initialItem,
    enabled = true,
    verticalLoop = false,
    horizontalLoop = false,
  } = options;

  const { vibrateLight } = useGamepadVibration();
  const { showGamepadUI } = useInputMode();
  
  // 只有在使用手柄时才显示焦点
  const isActive = enabled && showGamepadUI;

  const callbacksRef = useRef({ onSelect, onCancel, onKick });
  useEffect(() => { callbacksRef.current = { onSelect, onCancel, onKick }; });

  const findPosition = useCallback((itemId: string): { row: number; col: number } | null => {
    for (let row = 0; row < rows.length; row++) {
      const col = rows[row].indexOf(itemId);
      if (col !== -1) return { row, col };
    }
    return null;
  }, [rows]);

  const [rawPosition, setRawPosition] = useState<{ row: number; col: number }>(() => {
    if (initialItem) {
      const pos = findPosition(initialItem);
      if (pos) return pos;
    }
    return { row: 0, col: 0 };
  });

  // 派生状态：在渲染时计算约束后的位置
  const position = useMemo(() => constrainPosition(rawPosition, rows), [rawPosition, rows]);

  const focusedItem = useMemo(() => {
    const row = rows[position.row];
    if (!row) return null;
    return row[position.col] || row[0] || null;
  }, [rows, position]);

  useGamepadAction((action: GamepadAction) => {
    if (!isActive || rows.length === 0) return;
    switch (action) {
      case 'up':
        setRawPosition(prev => {
          const constrained = constrainPosition(prev, rows);
          let newRow = constrained.row - 1;
          if (newRow < 0) newRow = verticalLoop ? rows.length - 1 : 0;
          if (newRow === constrained.row) return prev;
          const newRowItems = rows[newRow] || [];
          const newCol = Math.min(constrained.col, newRowItems.length - 1);
          vibrateLight();
          return { row: newRow, col: Math.max(0, newCol) };
        });
        break;
      case 'down':
        setRawPosition(prev => {
          const constrained = constrainPosition(prev, rows);
          let newRow = constrained.row + 1;
          if (newRow >= rows.length) newRow = verticalLoop ? 0 : rows.length - 1;
          if (newRow === constrained.row) return prev;
          const newRowItems = rows[newRow] || [];
          const newCol = Math.min(constrained.col, newRowItems.length - 1);
          vibrateLight();
          return { row: newRow, col: Math.max(0, newCol) };
        });
        break;
      case 'left':
        setRawPosition(prev => {
          const constrained = constrainPosition(prev, rows);
          const rowItems = rows[constrained.row] || [];
          let newCol = constrained.col - 1;
          if (newCol < 0) newCol = horizontalLoop ? rowItems.length - 1 : 0;
          if (newCol === constrained.col) return prev;
          vibrateLight();
          return { ...constrained, col: newCol };
        });
        break;
      case 'right':
        setRawPosition(prev => {
          const constrained = constrainPosition(prev, rows);
          const rowItems = rows[constrained.row] || [];
          let newCol = constrained.col + 1;
          if (newCol >= rowItems.length) newCol = horizontalLoop ? 0 : rowItems.length - 1;
          if (newCol === constrained.col) return prev;
          vibrateLight();
          return { ...constrained, col: newCol };
        });
        break;
      case 'confirm':
        if (focusedItem) callbacksRef.current.onSelect?.(focusedItem);
        break;
      case 'cancel':
        callbacksRef.current.onCancel?.();
        break;
      case 'kick':
        if (focusedItem) callbacksRef.current.onKick?.(focusedItem);
        break;
    }
  }, [isActive, rows, focusedItem, verticalLoop, horizontalLoop, vibrateLight]);

  const isFocused = useCallback((itemId: string) => isActive && focusedItem === itemId, [isActive, focusedItem]);

  return { position, setPosition: setRawPosition, focusedItem: isActive ? focusedItem : null, isFocused };
}


