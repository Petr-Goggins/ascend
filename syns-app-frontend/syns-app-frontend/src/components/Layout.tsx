import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { signOutUser } from '@/lib/signOut';
import { notifyError } from '@/lib/notifications';
import {
  Home,
  MessageSquare,
  User,
  Calendar,
  Dumbbell,
  Utensils,
  BarChart,
  Award,
  Settings,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import DynamicIsland from './DynamicIsland';
import BottomNav from './BottomNav';
import { useThemeStore } from '@/store/themeStore';

interface LayoutProps {
  children: React.ReactNode;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
}

export default function Layout({ children, sidebarOpen, onOpenSidebar, onCloseSidebar }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const initTheme = useThemeStore((state) => state.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark-blue' : 'light');
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      navigate('/auth');
    } catch (error) {
      console.error('Logout failed', error);
      notifyError('Не удалось выйти из аккаунта. Попробуйте ещё раз.');
    }
  };

  const navItems = [
    { name: 'Главная', path: '/dashboard', icon: Home },
    { name: 'Тренер', path: '/coach', icon: MessageSquare },
    { name: 'План', path: '/plan', icon: Calendar },
    { name: 'Питание', path: '/nutrition', icon: Utensils },
    { name: 'Статистика', path: '/reports', icon: BarChart },
    { name: 'Цикл', path: '/cycle', icon: Calendar },
    { name: 'Чат', path: '/chat', icon: MessageSquare },
    { name: 'Профиль', path: '/profile', icon: User },
    { name: 'Тренировки', path: '/workouts', icon: Dumbbell },
    { name: 'Сон', path: '/sleep', icon: Moon },
    { name: 'Достижения', path: '/achievements', icon: Award },
    { name: 'Настройки', path: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-bg text-text flex">
      {/* Десктопная боковая панель */}
      <aside className="hidden md:flex md:flex-col w-64 bg-bg-secondary border-r border-border shrink-0">
        <div className="p-4 border-b border-border">
          <h1 className="text-2xl font-bold text-accent-blue">Ascend</h1>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                location.pathname === item.path
                  ? 'bg-accent-blue/15 text-accent-blue'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text'
              }`}
            >
              <item.icon size={20} />
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text transition-all"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">Выйти</span>
          </button>
        </div>
      </aside>

      {/* Мобильный оверлей */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onCloseSidebar}
        />
      )}

      {/* Мобильная боковая панель */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-bg-secondary border-r border-border z-50 transform transition-transform md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h1 className="text-2xl font-bold text-accent-blue">Ascend</h1>
          <button onClick={onCloseSidebar} className="text-text-secondary hover:text-text">
            <X size={24} />
          </button>
        </div>
        <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100%-70px)]">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={onCloseSidebar}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                location.pathname === item.path
                  ? 'bg-accent-blue/15 text-accent-blue'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text'
              }`}
            >
              <item.icon size={20} />
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text transition-all"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">Выйти</span>
          </button>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="flex-1 flex flex-col min-h-screen">
        <DynamicIsland />
        <header className="flex items-center justify-between p-4 bg-bg-secondary border-b border-border md:bg-transparent md:border-none">
          <button
            onClick={onOpenSidebar}
            className="md:hidden text-text-secondary hover:text-text"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors"
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center">
              <span className="text-sm font-semibold text-accent-blue">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 pb-20 md:pb-4">{children}</div>
        <BottomNav />
      </main>
    </div>
  );
}