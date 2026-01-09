/**
 * 快艇骰子游戏主应用
 */

import { useState, useEffect } from 'react';
import { MainMenu } from './pages/MainMenu';
import { LocalSetup } from './pages/LocalSetup';
import { OnlineSetup } from './pages/OnlineSetup';
import { Settings } from './pages/Settings';
import { GameBoard } from './components/GameBoard';
import { GameOver } from './components/GameOver';
import { useGameStore } from './store/gameStore';

// 导入i18n配置
import './i18n';

// 导入全局样式
import './styles/global.css';

// 应用页面类型
type AppPage = 'menu' | 'local-setup' | 'online-setup' | 'settings' | 'game';

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('menu');
  const { phase, resetGame, players, startGame, initLocalGame } = useGameStore();
  
  // 初始化主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);
  
  // 处理再来一局
  const handlePlayAgain = () => {
    // 重新初始化玩家（保留配置）
    const playerConfigs = players.map(p => ({
      name: p.name,
      type: p.type
    }));
    initLocalGame(playerConfigs);
    startGame();
  };
  
  // 返回主菜单
  const handleBackToMenu = () => {
    resetGame();
    setCurrentPage('menu');
  };
  
  // 根据当前页面渲染内容
  const renderPage = () => {
    switch (currentPage) {
      case 'menu':
        return (
          <MainMenu
            onLocalGame={() => setCurrentPage('local-setup')}
            onOnlineGame={() => setCurrentPage('online-setup')}
            onSettings={() => setCurrentPage('settings')}
          />
        );
      
      case 'local-setup':
        return (
          <LocalSetup
            onBack={() => setCurrentPage('menu')}
            onStart={() => setCurrentPage('game')}
          />
        );
      
      case 'online-setup':
        return (
          <OnlineSetup
            onBack={() => setCurrentPage('menu')}
            onStart={() => setCurrentPage('game')}
          />
        );
      
      case 'settings':
        return (
          <Settings
            onBack={() => setCurrentPage('menu')}
          />
        );
      
      case 'game':
        return (
          <>
            <GameBoard />
            {phase === 'finished' && (
              <GameOver
                onPlayAgain={handlePlayAgain}
                onBackToMenu={handleBackToMenu}
              />
            )}
          </>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="app">
      {renderPage()}
    </div>
  );
}

export default App;
