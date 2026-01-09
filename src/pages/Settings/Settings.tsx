/**
 * 设置页面
 * 语言、主题等设置
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { changeLanguage, supportedLanguages } from '../../i18n';
import styles from './Settings.module.css';

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
  });
  
  // 应用主题
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  // 切换语言
  const handleLanguageChange = (lang: string) => {
    changeLanguage(lang);
  };
  
  // 切换主题
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };
  
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <button className="btn btn-secondary" onClick={onBack}>
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
                  className={`${styles.languageButton} ${i18n.language === lang.code ? styles.active : ''}`}
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
              className={styles.themeToggle}
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
        </div>
        
        {/* 游戏规则简介 */}
        <div className={styles.rulesCard}>
          <h3 className={styles.rulesTitle}>📖 游戏规则</h3>
          <ul className={styles.rulesList}>
            <li>每回合可以摇3次骰子</li>
            <li>点击骰子可以锁定/解锁</li>
            <li>每回合必须选择一个记分项</li>
            <li>上半区达到63分可获得35分奖励</li>
            <li>快艇(5个相同)得50分，额外快艇每次+100分</li>
            <li>游戏共13回合，总分最高者获胜</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
