import { create } from 'zustand';
import type { ChatMessage, ChatRole, Profile } from '@/types';
import { supabase } from '@/lib/supabase';
import { usePlanStore } from '@/store/planStore';
import { useCoachStore } from '@/store/coachStore';
import { calculateCyclePhase, getPhaseRecommendation } from '@/lib/cycle';
import { withRequestTimeout } from '@/lib/requestTimeout';

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  fetchMessages: (userId: string) => Promise<void>;
  sendMessage: (userId: string, profile: Profile | null, content: string) => Promise<void>;
  clearMessages: (userId: string) => Promise<void>;
  reset: () => void;
}

function buildContext(profile: Profile | null): string {
  if (!profile) return 'Профиль не заполнен.';
  const parts: string[] = [];
  const weakMuscles = Array.isArray(profile.weak_muscles) ? profile.weak_muscles : [];
  const equipment = Array.isArray(profile.equipment) ? profile.equipment : [];
  const fasting = Array.isArray(profile.fasting) ? profile.fasting : [];
  const diet = Array.isArray(profile.diet) ? profile.diet : [];
  if (profile.gender && profile.gender !== 'not_specified') parts.push(`Пол: ${profile.gender}`);
  if (profile.age) parts.push(`Возраст: ${profile.age}`);
  if (profile.height) parts.push(`Рост: ${profile.height} см`);
  if (profile.weight) parts.push(`Вес: ${profile.weight} кг`);
  if (profile.goal) parts.push(`Цель: ${profile.goal}`);
  if (profile.activity_level) parts.push(`Активность: ${profile.activity_level}`);
  if (profile.training_level) parts.push(`Уровень: ${profile.training_level}`);
  if (profile.days_per_week) parts.push(`Дней/нед: ${profile.days_per_week}`);
  if (weakMuscles.length) parts.push(`Отстающие: ${weakMuscles.join(', ')}`);
  if (equipment.length) parts.push(`Оборудование: ${equipment.join(', ')}`);
  if (fasting.length) parts.push(`Пост: ${fasting.join(', ')}`);
  if (diet.length) parts.push(`Диета: ${diet.join(', ')}`);
  // Cycle phase
  if (profile.gender === 'female' && profile.cycle_last_period) {
    const cycleInfo = calculateCyclePhase(profile.cycle_last_period, profile.cycle_length);
    const rec = getPhaseRecommendation(cycleInfo.phase);
    parts.push(`Фаза цикла: ${rec.label} (день ${cycleInfo.dayOfCycle})`);
  }
  // Coach data
  const coach = useCoachStore.getState().coachData;
  if (coach) {
    if (coach.focus_type) parts.push(`Фокус: ${coach.focus_type}`);
    const injuries = Array.isArray(coach.injuries) ? coach.injuries : [];
    if (injuries.length) parts.push(`Травмы: ${injuries.join(', ')}`);
    if (coach.priority) parts.push(`Приоритет: ${coach.priority}`);
    if (coach.sleep_hours) parts.push(`Сон: ${coach.sleep_hours}`);
    if (coach.stress_level) parts.push(`Стресс: ${coach.stress_level}`);
  }
  // Current plan summary
  const plan = usePlanStore.getState().plan;
  if (plan) {
    parts.push(`План: ${plan.name}, ${plan.days_per_week} дн/нед, цель: ${plan.goal}`);
  }
  return parts.length ? parts.join('; ') : 'Профиль пуст.';
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  fetchMessages: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      set({ messages: data ?? [], error: null });
    } catch (error) {
      console.error('Chat history load failed', error);
      set({ error: 'Не удалось загрузить историю чата. Проверьте подключение к Supabase.' });
    }
  },
  sendMessage: async (userId: string, profile: Profile | null, content: string) => {
    if (!content.trim()) return;

    // optimistic insert of user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      user_id: userId,
      role: 'user' as ChatRole,
      content,
      created_at: new Date().toISOString(),
    };
    set({ messages: [...get().messages, tempUserMsg], loading: true, error: null });

    const context = buildContext(profile);
    let savedUser: ChatMessage | null = null;
    let persistenceError: string | null = null;
    try {
      const result = await supabase.from('chat_messages').insert({ user_id: userId, role: 'user', content }).select().single();
      if (result.error) throw result.error;
      savedUser = result.data as ChatMessage;
    } catch (error) {
      console.error('Chat history user message was not saved', error);
      persistenceError = 'Сообщение не удалось сохранить в историю чата.';
    }
    if (savedUser) set({ messages: get().messages.map((m) => (m.id === tempUserMsg.id ? savedUser! : m)) });

    let reply: string;
    let requestError: string | null = null;
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
      reply = await withRequestTimeout(async (signal) => {
        const response = await fetch(`${apiUrl}/ai/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, user_data: { context, ...(profile ?? {}) } }),
          signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { detail?: string } | null;
          throw new Error(payload?.detail || `HTTP ${response.status}`);
        }
        const data = await response.json() as { reply?: string };
        if (!data.reply?.trim()) throw new Error('Пустой ответ от AI-сервера');
        return data.reply.trim();
      }, 90_000, 'ИИ не ответил за 90 секунд. Попробуйте ещё раз.');
    } catch (error) {
      console.error('AI request failed', error);
      const message = error instanceof Error ? error.message : '';
      requestError = /failed to fetch|load failed|networkerror|connecterror/i.test(message)
        ? 'Не удалось связаться с сервисом ИИ. Проверьте интернет и доступность backend.'
        : message || 'Не удалось получить ответ от сервиса ИИ.';
      reply = `Не удалось получить ответ от ИИ. ${requestError}`;
    }

    const assistantMessage: ChatMessage = {
      id: `ai-${Date.now()}`,
      user_id: userId,
      role: 'assistant',
      content: reply,
      created_at: new Date().toISOString(),
    };
    try {
      const result = await supabase.from('chat_messages').insert({ user_id: userId, role: 'assistant', content: reply }).select().single();
      if (result.error) throw result.error;
      Object.assign(assistantMessage, result.data as ChatMessage);
    } catch (error) {
      console.error('Chat history AI message was not saved', error);
      persistenceError = 'Ответ показан, но его не удалось сохранить в истории.';
    }
    set({
      messages: [...get().messages, assistantMessage],
      loading: false,
      error: requestError || persistenceError,
    });
  },
  clearMessages: async (userId: string) => {
    const { error } = await supabase.from('chat_messages').delete().eq('user_id', userId);
    if (error) {
      console.error('Chat history clear failed', error);
      set({ error: 'Не удалось очистить историю чата.' });
      return;
    }
    set({ messages: [], error: null });
  },
  reset: () => set({ messages: [], loading: false, error: null }),
}));
