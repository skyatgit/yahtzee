/**
 * 主菜单
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useListFocus, useGamepadConnection } from '../../hooks';
import styles from './MainMenu.module.css';

interface MainMenuProps {
  onLocalGame: () => void;
  onOnlineGame: () => void;
  onSettings: () => void;
}

export function MainMenu({ onLocalGame, onOnlineGame, onSettings }: MainMenuProps) {
  const { t } = useTranslation();
  const { hasGamepad } = useGamepadConnection();
  
  // 菜单项目列表
  const menuItems = useMemo(() => [
    { id: 'local', label: t('menu.localGame'), icon: '🎮', action: onLocalGame },
    { id: 'online', label: t('menu.onlineGame'), icon: '🌐', action: onOnlineGame },
    { id: 'settings', label: t('menu.settings'), icon: '⚙️', action: onSettings },
  ], [t, onLocalGame, onOnlineGame, onSettings]);
  
  // 手柄导航焦点
  const { isFocused } = useListFocus({
    items: menuItems.map(item => item.id),
    onSelect: (itemId) => {
      const item = menuItems.find(m => m.id === itemId);
      item?.action();
    },
    enabled: hasGamepad,
  });
  
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className={styles.header}>
          <div className={styles.logo}>🎲</div>
          <h1 className={styles.title}>{t('menu.title')}</h1>
          <p className={styles.subtitle}>{t('menu.subtitle')}</p>
        </div>
        
        <div className={styles.diceDecoration}>
          {['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'].map((d, i) => (
            <span key={i} className={styles.decorDice}>{d}</span>
          ))}
        </div>
        
        <div className={styles.menuButtons}>
          {menuItems.map((item, index) => (
            <motion.button
              key={item.id}
              className={`${styles.menuButton} ${isFocused(index) ? styles.focused : ''}`}
              onClick={item.action}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className={styles.buttonIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </motion.button>
          ))}
        </div>
        
        <div className={styles.footer}>
          {t('menu.footerText')}
        </div>
      </motion.div>
    </div>
  );
}
