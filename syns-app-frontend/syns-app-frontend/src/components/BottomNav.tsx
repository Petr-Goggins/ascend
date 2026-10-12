import { BarChart3, Dumbbell, Home, User, Utensils } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { label: 'Главная', path: '/dashboard', icon: Home },
  { label: 'Тренировка', path: '/workout', icon: Dumbbell },
  { label: 'Питание', path: '/nutrition', icon: Utensils },
  { label: 'Статистика', path: '/reports', icon: BarChart3 },
  { label: 'Профиль', path: '/profile', icon: User },
];

export default function BottomNav() {
  return <nav aria-label="Мобильная навигация" className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-32px)] max-w-md -translate-x-1/2 items-center justify-evenly rounded-2xl border border-white/10 bg-white/[0.05] px-2 py-2 backdrop-blur-[20px] md:hidden">{items.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} aria-label={label} title={label} className={({ isActive }) => `flex h-10 flex-1 items-center justify-center rounded-xl text-text-secondary transition-transform active:scale-110 ${isActive ? 'bg-accent-blue/20 text-accent-blue' : 'hover:text-text'}`}><Icon size={20} /></NavLink>)}</nav>;
}
