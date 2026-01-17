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
import { gamepadService } from './services/gamepadService';

// 导入i18n配置
import './i18n';

// 导入全局样式
import './styles/global.css';

// 应用页面类型
type AppPage = 'menu' | 'local-setup' | 'online-setup' | 'settings' | 'game';

// 从 URL 获取房间号
const getRoomIdFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
};

// 清除 URL 中的房间号参数
const clearRoomIdFromUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState({}, '', url.pathname);
};

// 检查初始状态
const getInitialState = (): { page: AppPage; roomId: string | null } => {
  const roomId = getRoomIdFromUrl();
  if (roomId) {
    clearRoomIdFromUrl();
    return { page: 'online-setup', roomId: roomId.toUpperCase() };
  }
  return { page: 'menu', roomId: null };
};

const initialState = getInitialState();

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>(initialState.page);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(initialState.roomId);
  const { phase, resetGame, players, startGame, initLocalGame } = useGameStore();
  
  // 初始化主题（默认深色模式）
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);
  
  // 初始化手柄服务和加载震动设置
  useEffect(() => {
    // 加载保存的震动设置
    const savedVibration = localStorage.getItem('gamepadVibration');
    if (savedVibration !== null) {
      gamepadService.setVibrationEnabled(savedVibration === 'true');
    }
    
    // 启动手柄服务
    gamepadService.start();
    
    return () => {
      // 组件卸载时不需要停止服务，保持全局可用
    };
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
  
  // 处理进入联机设置页面
  const handleOnlineGame = () => {
    setInviteRoomId(null); // 清除邀请房间号
    setCurrentPage('online-setup');
  };
  
  // 根据当前页面渲染内容
  const renderPage = () => {
    switch (currentPage) {
      case 'menu':
        return (
          <MainMenu
            onLocalGame={() => setCurrentPage('local-setup')}
            onOnlineGame={handleOnlineGame}
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
            onBack={() => {
              setInviteRoomId(null);
              setCurrentPage('menu');
            }}
            onStart={() => setCurrentPage('game')}
            inviteRoomId={inviteRoomId}
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
            <GameBoard onBackToMenu={handleBackToMenu} />
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
