export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  { id: 'first', title: 'Первая тренировка', description: 'Добавьте запись в workout_logs' },
  { id: 'streak', title: '5 дней подряд', description: 'Тренируйтесь пять дней подряд' },
  { id: 'thirty', title: '30 тренировок', description: 'Добавьте 30 записей тренировок' },
  { id: 'squat', title: '+5 кг к приседу', description: 'Покажите рост веса в приседаниях' },
  { id: 'cardio', title: 'Кардио-ритм', description: 'Выполните десять кардио-тренировок' },
  { id: 'stretch', title: 'Гибкость', description: 'Запишите пять тренировок на растяжку' },
  { id: 'sleep', title: 'Восстановление', description: 'Спите восемь часов четырнадцать дней' },
  { id: 'hundred', title: '100 тренировок', description: 'Добавьте 100 записей тренировок' },
];
