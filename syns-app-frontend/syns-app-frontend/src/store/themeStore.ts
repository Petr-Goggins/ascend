import { create } from 'zustand';

export type ThemeName = 'dark-blue' | 'light' | 'gray' | 'black';

export interface ThemeOption {
  id: ThemeName;
  label: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'dark-blue', label: 'Тёмно-синяя', description: 'Классическая тёмная тема' },
  { id: 'light', label: 'Светлая', description: 'Светлый фон, тёмный текст' },
  { id: 'gray', label: 'Серая', description: 'Нейтральные серые тона' },
  { id: 'black', label: 'Чёрная', description: 'Глубокий чёрный с фиолетовым акцентом' },
];

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  initTheme: () => void;
}

const STORAGE_KEY = 'ascend-theme';

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
  for (const themeClass of ['dark', 'light', 'gray', 'black']) {
    document.documentElement.classList.remove(themeClass);
  }
  document.documentElement.classList.add(theme === 'dark-blue' ? 'dark' : theme);
}

function readTheme(): ThemeName {
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEME_OPTIONS.some((option) => option.id === saved) ? saved as ThemeName : 'dark-blue';
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'dark-blue',
  setTheme: (theme: ThemeName) => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    set({ theme });
  },
  initTheme: () => {
    const theme = readTheme();
    applyTheme(theme);
    set({ theme });
  },
}));
