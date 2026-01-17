/**
 * 焦点指示器组件
 * 为手柄导航提供可视化焦点反馈
 */

import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import styles from './FocusIndicator.module.css';

interface FocusIndicatorProps {
  /** 是否获得焦点 */
  focused: boolean;
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 焦点类型 */
  variant?: 'outline' | 'glow' | 'scale';
  /** 点击回调 */
  onClick?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** HTML 标签类型 */
  as?: 'div' | 'button' | 'li';
}

/**
 * 焦点指示器包装组件
 * 包裹可聚焦元素，在手柄导航时显示焦点状态
 */
export const FocusIndicator = forwardRef<HTMLDivElement, FocusIndicatorProps>(
  function FocusIndicator(
    {
      focused,
      children,
      className = '',
      variant = 'outline',
      onClick,
      disabled = false,
      as = 'div',
    },
    ref
  ) {
    const Component = motion[as] as typeof motion.div;
    
    return (
      <Component
        ref={ref}
        className={`
          ${styles.wrapper}
          ${styles[variant]}
          ${focused ? styles.focused : ''}
          ${disabled ? styles.disabled : ''}
          ${className}
        `}
        onClick={disabled ? undefined : onClick}
        animate={focused ? {
          scale: variant === 'scale' ? 1.05 : 1,
        } : {
          scale: 1,
        }}
        transition={{ duration: 0.15 }}
        tabIndex={focused ? 0 : -1}
        role="button"
        aria-disabled={disabled}
      >
        {children}
        {/* 焦点光晕效果 */}
        {variant === 'glow' && focused && (
          <motion.div
            className={styles.glowEffect}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </Component>
    );
  }
);
