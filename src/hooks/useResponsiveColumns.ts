/**
 * 响应式列数检测 Hook
 * 根据窗口大小返回当前的网格列数
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * 预定义的断点配置
 */
export interface BreakpointConfig {
  /** 断点宽度 */
  maxWidth?: number;
  /** 断点高度 */
  maxHeight?: number;
  /** 该断点下的列数 */
  columns: number;
}

/**
 * 使用响应式列数
 * @param defaultColumns 默认列数
 * @param breakpoints 断点配置，按优先级排序（先匹配的优先）
 */
export function useResponsiveColumns(
  defaultColumns: number,
  breakpoints: BreakpointConfig[] = []
): number {
  const getColumns = useCallback(() => {
    if (typeof window === 'undefined') return defaultColumns;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // 按顺序检查断点
    for (const bp of breakpoints) {
      const widthMatch = bp.maxWidth === undefined || width <= bp.maxWidth;
      const heightMatch = bp.maxHeight === undefined || height <= bp.maxHeight;
      
      if (widthMatch && heightMatch) {
        return bp.columns;
      }
    }
    
    return defaultColumns;
  }, [defaultColumns, breakpoints]);
  
  const [columns, setColumns] = useState(getColumns);
  
  useEffect(() => {
    const handleResize = () => {
      setColumns(getColumns());
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // 初始化时也检查一次
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [getColumns]);
  
  return columns;
}

/**
 * 根据列数生成网格导航行
 * @param items 所有项目 ID 列表
 * @param columns 列数
 * @returns 按行分组的项目
 */
export function generateGridRows(items: string[], columns: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

/**
 * 本地游戏设置页面的玩家槽位断点配置
 */
export const LOCAL_SETUP_BREAKPOINTS: BreakpointConfig[] = [
  { maxWidth: 480, columns: 2 },  // 小屏幕 2 列
  // 默认 4 列
];


/**
 * 检测是否横屏
 */
export function useIsLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight;
  });
  
  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
  
  return isLandscape;
}
