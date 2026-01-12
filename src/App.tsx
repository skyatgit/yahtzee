/**
 * 快艇骰子游戏主应用
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
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

/**
 * 主菜单页面包装器
 */
function MenuPage() {
  const navigate = useNavigate();
  
  return (
    <MainMenu
      onLocalGame={() => navigate('/local')}
      onOnlineGame={() => navigate('/online')}
      onSettings={() => navigate('/settings')}
    />
  );
}

/**
 * 本地游戏设置页面包装器
 */
function LocalSetupPage() {
  const navigate = useNavigate();
  
  return (
    <LocalSetup
      onBack={() => navigate('/')}
      onStart={() => navigate('/game')}
    />
  );
}

/**
 * 联机游戏设置页面包装器
 */
function OnlineSetupPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roomId = searchParams.get('room');
  
  // 清除 URL 中的房间号参数（保持 URL 整洁）
  useEffect(() => {
    if (roomId) {
      setSearchParams({}, { replace: true });
    }
  }, [roomId, setSearchParams]);
  
  return (
    <OnlineSetup
      onBack={() => navigate('/')}
      onStart={() => navigate('/game')}
      inviteRoomId={roomId?.toUpperCase() || null}
    />
  );
}

/**
 * 设置页面包装器
 */
function SettingsPage() {
  const navigate = useNavigate();
  
  return (
    <Settings
      onBack={() => navigate('/')}
    />
  );
}

/**
 * 游戏页面包装器
 */
function GamePage() {
  const navigate = useNavigate();
  const { phase, resetGame, players, startGame, initLocalGame } = useGameStore();
  
  // 如果没有玩家（直接访问 /game），重定向到主菜单
  useEffect(() => {
    if (players.length === 0) {
      navigate('/', { replace: true });
    }
  }, [players.length, navigate]);
  
  // 处理再来一局
  const handlePlayAgain = () => {
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
    navigate('/');
  };
  
  if (players.length === 0) {
    return null; // 等待重定向
  }
  
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
}

/**
 * 主应用组件
 */
function AppContent() {
  // 初始化主题（默认深色模式）
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);
  
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/local" element={<LocalSetupPage />} />
        <Route path="/online" element={<OnlineSetupPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/game" element={<GamePage />} />
        {/* 未匹配路由重定向到主菜单 */}
        <Route path="*" element={<MenuPage />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
