/**
 * 本地游戏设置页面
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PlayerType } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import styles from './LocalSetup.module.css';

interface PlayerConfig {
  name: string;
  type: PlayerType;
}

interface LocalSetupProps {
  onBack: () => void;
  onStart: () => void;
}

// 生成默认玩家名称
const getDefaultName = (index: number, type: PlayerType, t: (key: string) => string): string => {
  if (type === 'human') {
    return `${t('setup.human')}${index + 1}`;
  } else {
    return `${t('setup.ai')}${index + 1}`;
  }
};

export function LocalSetup({ onBack, onStart }: LocalSetupProps) {
  const { t } = useTranslation();
  const { initLocalGame, startGame } = useGameStore();

  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerConfig[]>([
    { name: getDefaultName(0, 'human', t), type: 'human' },
    { name: getDefaultName(1, 'ai', t), type: 'ai' }
  ]);

  // 更新玩家数量
  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    const newPlayers: PlayerConfig[] = [];
    for (let i = 0; i < count; i++) {
      if (i < players.length) {
        newPlayers.push(players[i]);
      } else {
        // 新增的玩家默认为电脑
        newPlayers.push({
          name: getDefaultName(i, 'ai', t),
          type: 'ai'
        });
      }
    }
    setPlayers(newPlayers);
  };

  // 更新玩家名称
  const updatePlayerName = (index: number, name: string) => {
    const newPlayers = [...players];
    newPlayers[index] = { ...newPlayers[index], name };
    setPlayers(newPlayers);
  };

  // 切换玩家类型
  const togglePlayerType = (index: number) => {
    const newPlayers = [...players];
    const currentType = newPlayers[index].type;
    const newType: PlayerType = currentType === 'human' ? 'ai' : 'human';

    // 自动更新名称为对应类型的默认名称
    newPlayers[index] = {
      ...newPlayers[index],
      type: newType,
      name: getDefaultName(index, newType, t)
    };
    setPlayers(newPlayers);
  };
  
  // 开始游戏
  const handleStart = () => {
    initLocalGame(players);
    startGame();
    onStart();
  };
  
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.header}>
          <button className="btn" onClick={onBack}>
            ← {t('menu.back')}
          </button>
          <h2 className={styles.title}>{t('menu.localGame')}</h2>
        </div>
        
        <div className={styles.card}>
          {/* 玩家数量 */}
          <div className={styles.section}>
            <label className={styles.label}>{t('setup.playerCount')}</label>
            <div className={styles.countSelector}>
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  className={`${styles.countButton} ${playerCount === count ? styles.active : ''}`}
                  onClick={() => handlePlayerCountChange(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          
          {/* 玩家列表 */}
          <div className={styles.section}>
            <label className={styles.label}>{t('setup.players')}</label>
            <div className={styles.playerList}>
              {players.map((player, index) => (
                <div key={index} className={styles.playerCard}>
                  <div className={styles.playerNumber}>{index + 1}</div>
                  <input
                    type="text"
                    className={styles.playerInput}
                    value={player.name}
                    onChange={(e) => updatePlayerName(index, e.target.value)}
                    maxLength={8}
                  />
                  <button
                    className={`${styles.typeButton} ${player.type === 'human' ? styles.human : styles.ai}`}
                    onClick={() => togglePlayerType(index)}
                  >
                    {player.type === 'human' ? '👤' : '🤖'}
                    <span>{t(`setup.${player.type}`)}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* 开始按钮 */}
        <button className="btn btn-primary btn-large btn-full" onClick={handleStart}>
          {t('menu.start')}
        </button>
      </motion.div>
    </div>
  );
}
