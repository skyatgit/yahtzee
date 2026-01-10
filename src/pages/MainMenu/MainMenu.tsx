/**
 * 主菜单
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import styles from './MainMenu.module.css';

interface MainMenuProps {
  onLocalGame: () => void;
  onOnlineGame: () => void;
  onSettings: () => void;
}

export function MainMenu({ onLocalGame, onOnlineGame, onSettings }: MainMenuProps) {
  const { t } = useTranslation();
  
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
          <motion.button
            className={styles.menuButton}
            onClick={onLocalGame}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className={styles.buttonIcon}>🎮</span>
            <span>{t('menu.localGame')}</span>
          </motion.button>
          
          <motion.button
            className={styles.menuButton}
            onClick={onOnlineGame}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className={styles.buttonIcon}>🌐</span>
            <span>{t('menu.onlineGame')}</span>
          </motion.button>
          
          <motion.button
            className={styles.menuButton}
            onClick={onSettings}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className={styles.buttonIcon}>⚙️</span>
            <span>{t('menu.settings')}</span>
          </motion.button>
        </div>
        
        <div className={styles.footer}>
          {t('menu.footerText')}
        </div>
      </motion.div>
    </div>
  );
}
