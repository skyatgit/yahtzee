/**
 * i18n 国际化配置
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 导入语言文件
import schinese from './locales/schinese.json';
import tchinese from './locales/tchinese.json';
import english from './locales/english.json';
import japanese from './locales/japanese.json';

// 支持的语言列表
export const supportedLanguages = [
  { code: 'schinese', name: '简体中文' },
  { code: 'tchinese', name: '繁體中文' },
  { code: 'english', name: 'English' },
  { code: 'japanese', name: '日本語' }
];

// 从本地存储获取语言设置，默认简体中文
const savedLanguage = localStorage.getItem('language') || 'schinese';

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      schinese: { translation: schinese },
      tchinese: { translation: tchinese },
      english: { translation: english },
      japanese: { translation: japanese }
    },
    lng: savedLanguage,
    fallbackLng: 'schinese',
    interpolation: {
      escapeValue: false
    }
  });

// 切换语言并保存到本地存储
export const changeLanguage = (lang: string) => {
  void i18n.changeLanguage(lang);
  localStorage.setItem('language', lang);
};

export { i18n };
