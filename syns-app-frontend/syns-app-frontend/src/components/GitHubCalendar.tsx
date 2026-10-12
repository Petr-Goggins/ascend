import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Day = { date: string; level: number; detail: string };
type CalendarCell = { date: string; day: number } | null;
interface Props { title: string; days: Day[]; mode?: 'nutrition' | 'workout'; }

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function GitHubCalendar({ title, days, mode = 'workout' }: Props) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<Day | null>(null);
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const cells = useMemo<CalendarCell[]>(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekdayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekdayOffset + daysInMonth) / 7) * 7;

    return Array.from({ length: cellCount }, (_, index) => {
      const day = index - firstWeekdayOffset + 1;
      return day < 1 || day > daysInMonth ? null : { date: dateKey(year, monthIndex, day), day };
    });
  }, [month]);

  const dayColor = (day?: Day) => {
    if (!day) return 'var(--bg-tertiary)';
    if (mode === 'workout') return 'var(--accent-green)';
    if (day.level >= 3) return 'var(--accent-red)';
    if (day.level >= 1) return 'var(--accent-gold)';
    return 'var(--accent-green)';
  };

  const changeMonth = (amount: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setSelected(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-bg-secondary p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-text">{title}</h3>
        <div className="flex gap-2">
          <button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)} className="btn-secondary p-2">
            <ChevronLeft size={15} />
          </button>
          <button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)} className="btn-secondary p-2">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs capitalize text-text-tertiary">
        {month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
      </p>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="pb-1 text-center text-[10px] font-medium text-text-tertiary">
            {weekday}
          </span>
        ))}
        {cells.map((cell, index) => {
          if (!cell) return <span key={`blank-${index}`} aria-hidden="true" />;
          const day = byDate.get(cell.date);
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => setSelected(day ?? { date: cell.date, level: 0, detail: 'Нет данных' })}
              aria-label={`${cell.date}: ${day?.detail || 'Нет данных'}`}
              aria-pressed={selected?.date === cell.date}
              className={`aspect-square w-full min-w-0 rounded-md border text-xs transition hover:brightness-110 ${selected?.date === cell.date ? 'border-accent-blue ring-2 ring-accent-blue' : 'border-border/50'}`}
              style={{ backgroundColor: dayColor(day), color: 'var(--text)' }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-[10px] text-text-tertiary">
        <span className="mr-1">Нет данных</span>
        <span className="h-3 w-3 rounded-sm border border-border/50" style={{ backgroundColor: dayColor() }} />
        {mode === 'workout' ? (
          <>
            <span className="ml-2">Тренировка</span>
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'var(--accent-green)' }} />
          </>
        ) : (
          <>
            <span className="ml-2">Меньше</span>
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'var(--accent-gold)' }} />
            <span className="ml-1">Больше</span>
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'var(--accent-red)' }} />
          </>
        )}
      </div>
      {selected && (
        <div className="mt-4 rounded-lg border border-accent-blue/30 bg-accent-blue/10 p-3 text-xs text-text-secondary">
          <strong className="text-text">{selected.date}</strong>: {selected.detail}
          <button type="button" onClick={() => setSelected(null)} className="ml-2 text-accent-blue">
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
}
