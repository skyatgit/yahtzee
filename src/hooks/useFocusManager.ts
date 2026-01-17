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

export interface FocusArea {
  id: string;
  items: string[];
  columns?: number;
  loop?: boolean;
}

export interface FocusState {
  areaId: string | null;
  itemId: string | null;
  itemIndex: number;
}

export interface FocusManagerOptions {
  areas: FocusArea[];
  initialAreaId?: string;
  initialItemId?: string;
  onAreaChange?: (areaId: string) => void;
  onItemChange?: (itemId: string) => void;
  onConfirm?: (itemId: string) => void;
  onCancel?: () => void;
  enabled?: boolean;
}

export interface FocusManager {
  focusState: FocusState;
  setFocus: (areaId: string, itemId?: string) => void;
  moveFocus: (direction: 'up' | 'down' | 'left' | 'right') => void;
  switchArea: (direction: 'prev' | 'next') => void;
  isFocused: (itemId: string) => boolean;
  isAreaFocused: (areaId: string) => boolean;
  getFocusStyle: (itemId: string) => React.CSSProperties;
}

function constrainFocusState(state: FocusState, areas: FocusArea[], areaMap: Map<string, FocusArea>): FocusState {
  if (!state.areaId) {
    const firstArea = areas[0];
    if (firstArea && firstArea.items.length > 0) {
      return { areaId: firstArea.id, itemId: firstArea.items[0], itemIndex: 0 };
    }
    return state;
  }

  const area = areaMap.get(state.areaId);
  if (!area) {
    const firstArea = areas[0];
    if (firstArea && firstArea.items.length > 0) {
      return { areaId: firstArea.id, itemId: firstArea.items[0], itemIndex: 0 };
    }
    return { areaId: null, itemId: null, itemIndex: 0 };
  }

  if (state.itemId && !area.items.includes(state.itemId)) {
    const newIndex = Math.min(state.itemIndex, area.items.length - 1);
    return { ...state, itemId: area.items[newIndex] || null, itemIndex: Math.max(0, newIndex) };
  }

  return state;
}

export function useFocusManager(options: FocusManagerOptions): FocusManager {
  const {
    areas,
    initialAreaId,
    initialItemId,
    onAreaChange,
    onItemChange,
    onConfirm,
    onCancel,
    enabled = true,
  } = options;

  const { vibrateLight } = useGamepadVibration();
  const { showGamepadUI } = useInputMode();
  
  // 只有在使用手柄时才显示焦点
  const isActive = enabled && showGamepadUI;

  const callbacksRef = useRef({ onAreaChange, onItemChange, onConfirm, onCancel });
  useEffect(() => { callbacksRef.current = { onAreaChange, onItemChange, onConfirm, onCancel }; });

  const areaMap = useMemo(() => {
    const map = new Map<string, FocusArea>();
    areas.forEach(area => map.set(area.id, area));
    return map;
  }, [areas]);

  const [rawFocusState, setRawFocusState] = useState<FocusState>(() => {
    const initialArea = areas.find(a => a.id === initialAreaId) || areas[0];
    const initialIndex = initialArea?.items.findIndex(id => id === initialItemId) ?? 0;
    return {
      areaId: initialArea?.id || null,
      itemId: initialItemId || initialArea?.items[0] || null,
      itemIndex: initialIndex >= 0 ? initialIndex : 0,
    };
  });

  // 派生状态：在渲染时计算约束后的焦点状态
  const focusState = useMemo(() => 
    constrainFocusState(rawFocusState, areas, areaMap), 
    [rawFocusState, areas, areaMap]
  );

  const setFocus = useCallback((areaId: string, itemId?: string) => {
    const area = areaMap.get(areaId);
    if (!area) return;

    const itemIndex = itemId ? area.items.indexOf(itemId) : 0;
    const finalIndex = itemIndex >= 0 ? itemIndex : 0;
    const finalItemId = area.items[finalIndex] || null;

    setRawFocusState(prev => {
      if (prev.areaId === areaId && prev.itemId === finalItemId) return prev;
      if (prev.areaId !== areaId) callbacksRef.current.onAreaChange?.(areaId);
      if (prev.itemId !== finalItemId && finalItemId) callbacksRef.current.onItemChange?.(finalItemId);
      return { areaId, itemId: finalItemId, itemIndex: finalIndex };
    });
  }, [areaMap]);

  const moveFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    setRawFocusState(prev => {
      const constrained = constrainFocusState(prev, areas, areaMap);
      if (!constrained.areaId) return prev;
      const area = areaMap.get(constrained.areaId);
      if (!area || area.items.length === 0) return prev;

      const columns = area.columns || 1;
      const totalItems = area.items.length;
      let newIndex = constrained.itemIndex;

      switch (direction) {
        case 'up': newIndex = constrained.itemIndex - columns; break;
        case 'down': newIndex = constrained.itemIndex + columns; break;
        case 'left': newIndex = constrained.itemIndex - 1; break;
        case 'right': newIndex = constrained.itemIndex + 1; break;
      }

      if (area.loop) {
        if (newIndex < 0) newIndex = totalItems + newIndex;
        else if (newIndex >= totalItems) newIndex = newIndex - totalItems;
      } else {
        if (newIndex < 0 || newIndex >= totalItems) return prev;
      }

      newIndex = Math.max(0, Math.min(newIndex, totalItems - 1));
      if (newIndex === constrained.itemIndex) return prev;

      const newItemId = area.items[newIndex];
      vibrateLight();
      callbacksRef.current.onItemChange?.(newItemId);
      return { ...constrained, itemId: newItemId, itemIndex: newIndex };
    });
  }, [areas, areaMap, vibrateLight]);

  const switchArea = useCallback((direction: 'prev' | 'next') => {
    setRawFocusState(prev => {
      const constrained = constrainFocusState(prev, areas, areaMap);
      if (!constrained.areaId) return prev;
      const currentIndex = areas.findIndex(a => a.id === constrained.areaId);
      if (currentIndex === -1) return prev;

      const newIndex = direction === 'prev'
        ? (currentIndex > 0 ? currentIndex - 1 : areas.length - 1)
        : (currentIndex < areas.length - 1 ? currentIndex + 1 : 0);

      const newArea = areas[newIndex];
      if (!newArea || newArea.items.length === 0) return prev;

      vibrateLight();
      callbacksRef.current.onAreaChange?.(newArea.id);
      const newItemId = newArea.items[0];
      callbacksRef.current.onItemChange?.(newItemId);
      return { areaId: newArea.id, itemId: newItemId, itemIndex: 0 };
    });
  }, [areas, areaMap, vibrateLight]);

  const isFocused = useCallback((itemId: string) => isActive && focusState.itemId === itemId, [isActive, focusState.itemId]);
  const isAreaFocused = useCallback((areaId: string) => isActive && focusState.areaId === areaId, [isActive, focusState.areaId]);
  const getFocusStyle = useCallback((itemId: string): React.CSSProperties => {
    if (!isActive || focusState.itemId !== itemId) return {};
    return { outline: '3px solid var(--primary)', outlineOffset: '2px' };
  }, [isActive, focusState.itemId]);

  useGamepadAction((action: GamepadAction) => {
    if (!enabled) return;
    switch (action) {
      case 'up': moveFocus('up'); break;
      case 'down': moveFocus('down'); break;
      case 'left': moveFocus('left'); break;
      case 'right': moveFocus('right'); break;
      case 'confirm': if (focusState.itemId) callbacksRef.current.onConfirm?.(focusState.itemId); break;
      case 'cancel': callbacksRef.current.onCancel?.(); break;
    }
  }, [enabled, moveFocus, focusState.itemId]);

  return { focusState, setFocus, moveFocus, switchArea, isFocused, isAreaFocused, getFocusStyle };
}

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

export function useGridFocus(options: {
  items: string[];
  columns: number;
  onSelect?: (itemId: string) => void;
  onCancel?: () => void;
  initialIndex?: number;
  enabled?: boolean;
}) {
  const { items, columns, onSelect, onCancel, initialIndex = 0, enabled = true } = options;
  const { vibrateLight } = useGamepadVibration();
  const { showGamepadUI } = useInputMode();
  
  // 只有在使用手柄时才显示焦点
  const isActive = enabled && showGamepadUI;

  const callbacksRef = useRef({ onSelect, onCancel });
  useEffect(() => { callbacksRef.current = { onSelect, onCancel }; });

  const [rawFocusIndex, setRawFocusIndex] = useState(() => constrainListIndex(initialIndex, items.length));

  // 派生状态
  const focusIndex = useMemo(() => constrainListIndex(rawFocusIndex, items.length), [rawFocusIndex, items.length]);

  useGamepadAction((action: GamepadAction) => {
    if (!isActive || items.length === 0) return;

    const constrained = constrainListIndex(rawFocusIndex, items.length);
    const currentRow = Math.floor(constrained / columns);
    const currentCol = constrained % columns;
    const totalRows = Math.ceil(items.length / columns);

    let newIndex = constrained;

    switch (action) {
      case 'up':
        if (currentRow > 0) newIndex = constrained - columns;
        break;
      case 'down':
        if (currentRow < totalRows - 1) {
          const potentialIndex = constrained + columns;
          if (potentialIndex < items.length) newIndex = potentialIndex;
        }
        break;
      case 'left':
        if (currentCol > 0) newIndex = constrained - 1;
        break;
      case 'right':
        if (currentCol < columns - 1 && constrained + 1 < items.length) newIndex = constrained + 1;
        break;
      case 'confirm':
        if (items[constrained]) callbacksRef.current.onSelect?.(items[constrained]);
        return;
      case 'cancel':
        callbacksRef.current.onCancel?.();
        return;
    }

    if (newIndex !== constrained && newIndex >= 0 && newIndex < items.length) {
      vibrateLight();
      setRawFocusIndex(newIndex);
    }
  }, [isActive, items, rawFocusIndex, columns, vibrateLight]);

  const isFocused = useCallback((index: number) => isActive && focusIndex === index, [isActive, focusIndex]);
  const focusedItem = isActive ? (items[focusIndex] || null) : null;

  return { focusIndex, setFocusIndex: setRawFocusIndex, isFocused, focusedItem };
}
