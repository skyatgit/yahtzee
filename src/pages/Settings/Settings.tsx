/**
 * 设置页面
 * 语言、主题、手柄等设置
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { changeLanguage, supportedLanguages } from '../../i18n';
import { 
  useLayoutNavigation, 
  useGamepadConnection, 
  useGamepadVibration,
  useIsLandscape,
  generateGridRows,
} from '../../hooks';
import { gamepadService } from '../../services/gamepadService';
import styles from './Settings.module.css';

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const { hasGamepad } = useGamepadConnection();
  const { vibrateMedium } = useGamepadVibration();
  const isLandscape = useIsLandscape();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
  });

  const [vibrationEnabled, setVibrationEnabled] = useState(() => {
    return gamepadService.isVibrationEnabled();
  });

  // 应用主题
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 切换语言
  const handleLanguageChange = useCallback((lang: string) => {
    changeLanguage(lang);
  }, []);

  // 切换主题
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  // 切换震动
  const toggleVibration = useCallback(() => {
    const newValue = !vibrationEnabled;
    setVibrationEnabled(newValue);
    gamepadService.setVibrationEnabled(newValue);
    localStorage.setItem('gamepadVibration', newValue ? 'true' : 'false');

    // 如果开启，测试震动
    if (newValue) {
      vibrateMedium();
    }
  }, [vibrationEnabled, vibrateMedium]);

  // 处理选择
  const handleSelect = useCallback((itemId: string) => {
    if (itemId === 'back') {
      onBack();
    } else if (itemId.startsWith('lang-')) {
      const lang = itemId.replace('lang-', '');
      handleLanguageChange(lang);
    } else if (itemId === 'theme') {
      toggleTheme();
    } else if (itemId === 'vibration') {
      toggleVibration();
    }
  }, [onBack, handleLanguageChange, toggleTheme, toggleVibration]);

  // 根据屏幕方向决定语言按钮列数
  const langColumns = isLandscape ? 4 : 2;

  // 根据响应式列数动态生成导航行
  const rows = useMemo(() => {
    const langCodes = supportedLanguages.map(l => `lang-${l.code}`);
    const langRows = generateGridRows(langCodes, langColumns);
    
    const result: string[][] = [
      ['back'],
      ...langRows,
      ['theme'],
    ];
    
    if (hasGamepad) {
      result.push(['vibration']);
    }
    
    return result;
  }, [langColumns, hasGamepad]);

  // 使用布局导航
  const { isFocused } = useLayoutNavigation({
    rows,
    onSelect: handleSelect,
    onCancel: onBack,
    enabled: hasGamepad,
    horizontalLoop: true,
  });

  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <button
            className={`btn btn-secondary ${isFocused('back') ? styles.focused : ''}`}
            onClick={onBack}
          >
            ← {t('menu.back')}
          </button>
          <h2 className={styles.title}>{t('settings.title')}</h2>
        </div>

        <div className={styles.card}>
          {/* 语言设置 */}
          <div className={styles.section}>
            <label className={styles.label}>{t('settings.language')}</label>
            <div className={styles.languageGrid}>
              {supportedLanguages.map((lang) => (
                <motion.button
                  key={lang.code}
                  className={`
                    ${styles.languageButton} 
                    ${i18n.language === lang.code ? styles.active : ''}
                    ${isFocused(`lang-${lang.code}`) ? styles.focused : ''}
                  `}
                  onClick={() => handleLanguageChange(lang.code)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {lang.name}
                </motion.button>
              ))}
            </div>
          </div>

          {/* 主题设置 */}
          <div className={styles.section}>
            <label className={styles.label}>{t('settings.theme')}</label>
            <motion.button
              className={`${styles.themeToggle} ${isFocused('theme') ? styles.focused : ''}`}
              onClick={toggleTheme}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className={styles.themeIcon}>
                {theme === 'light' ? '☀️' : '🌙'}
              </span>
              <span>
                {theme === 'light' ? t('settings.lightMode') : t('settings.darkMode')}
              </span>
              <div className={`${styles.themeSwitch} ${theme === 'dark' ? styles.dark : ''}`}>
                <div className={styles.themeSwitchKnob} />
              </div>
            </motion.button>
          </div>

          {/* 手柄震动设置（仅手柄连接时显示） */}
          {hasGamepad && (
            <div className={styles.section}>
              <label className={styles.label}>{t('gamepad.vibration')}</label>
              <motion.button
                className={`${styles.themeToggle} ${isFocused('vibration') ? styles.focused : ''}`}
                onClick={toggleVibration}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className={styles.themeIcon}>🎮</span>
                <span>
                  {vibrationEnabled ? t('gamepad.vibrationOn') : t('gamepad.vibrationOff')}
                </span>
                <div className={`${styles.themeSwitch} ${vibrationEnabled ? styles.dark : ''}`}>
                  <div className={styles.themeSwitchKnob} />
                </div>
              </motion.button>
            </div>
          )}
        </div>

        {/* 游戏规则简介 */}
        <div className={styles.rulesCard}>
          <h3 className={styles.rulesTitle}>📖 {t('settings.rulesTitle')}</h3>
          <ul className={styles.rulesList}>
            <li>{t('settings.rule1')}</li>
            <li>{t('settings.rule2')}</li>
            <li>{t('settings.rule3')}</li>
            <li>{t('settings.rule4')}</li>
            <li>{t('settings.rule5')}</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
