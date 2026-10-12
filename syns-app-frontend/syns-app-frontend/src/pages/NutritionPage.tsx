import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { supabase } from '../lib/supabase';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import CircularProgress from '@/components/CircularProgress';
import QuestionnaireRequired from '@/components/QuestionnaireRequired';
import { isQuestionnaireComplete } from '@/lib/questionnaire';
import { calculateNutritionTargets } from '@/lib/nutritionTargets';

type ProductSearchResult = {
  id: number | string;
  name: string;
  brand: string | null;
  proteins: number;
  fats: number;
  carbs: number;
  calories: number;
  source: 'ВкусВилл' | 'Локальный каталог';
  price?: number;
  rating?: number;
  url?: string | null;
  ingredients?: string | null;
  nutrition_info?: string | null;
};

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Завтрак' },
  { value: 'lunch', label: 'Обед' },
  { value: 'dinner', label: 'Ужин' },
  { value: 'snack', label: 'Перекус' },
] as const;
type MealType = (typeof MEAL_TYPES)[number]['value'];
type MealLog = { id: string; custom_name: string | null; product_id: number | null; grams: number; proteins: number; fats: number; carbs: number; calories: number };

export default function NutritionPage({ onOpenSidebar: _onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { profile, fetchProfile, loading: profileLoading } = useProfileStore();
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);
  const [dailyTotals, setDailyTotals] = useState({ calories: 0, proteins: 0, fats: 0, carbs: 0 });
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [portionGrams, setPortionGrams] = useState('100');
  const portionInputRef = useRef<HTMLInputElement>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState('');
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualProduct, setManualProduct] = useState({
    name: '',
    proteins: '',
    fats: '',
    carbs: '',
    calories: '',
  });
  const questionnaireComplete = Boolean(user && profile?.id === user.id && isQuestionnaireComplete(profile));
  const nutritionTargets = useMemo(() => profile?.id === user?.id
    ? calculateNutritionTargets({
      gender: profile.gender,
      age: profile.age,
      weight: profile.weight,
      height: profile.height,
      activityLevel: profile.activity_level,
      goal: profile.goal,
      targetChangeKgWeek: profile.target_change_kg_week,
    })
    : null, [profile, user?.id]);

  useEffect(() => {
    if (user && profile?.id !== user.id) void fetchProfile(user.id);
  }, [user, profile?.id, fetchProfile]);

  useEffect(() => {
    if (!selectedProduct) return;
    portionInputRef.current?.focus();
    portionInputRef.current?.select();
  }, [selectedProduct]);

  useEffect(() => {
    if (!user || !mealType) {
      setMealLogs([]);
      return;
    }
    let active = true;
    const loadMealLogs = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('id, custom_name, product_id, grams, proteins, fats, carbs, calories')
        .eq('user_id', user.id)
        .eq('log_date', today)
        .eq('meal_type', mealType)
        .order('created_at', { ascending: true });
      if (!active) return;
      if (error) {
        console.error('Meal log load failed', error);
        toast.error('Не удалось загрузить приём пищи');
        setMealLogs([]);
        return;
      }
      setMealLogs((data ?? []) as MealLog[]);
    };
    void loadMealLogs();
    return () => { active = false; };
  }, [user, mealType, logsRefreshKey]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadDailyTotals = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('calories, proteins, fats, carbs')
        .eq('user_id', user.id)
        .eq('log_date', today);
      if (error) {
        console.error('Nutrition totals load failed', error);
        if (active) toast.error('Не удалось загрузить дневную сводку питания');
        return;
      }
      if (!active) return;
      setDailyTotals((data ?? []).reduce((total, meal) => ({
        calories: total.calories + Number(meal.calories || 0),
        proteins: total.proteins + Number(meal.proteins || 0),
        fats: total.fats + Number(meal.fats || 0),
        carbs: total.carbs + Number(meal.carbs || 0),
      }), { calories: 0, proteins: 0, fats: 0, carbs: 0 }));
    };
    void loadDailyTotals();
    return () => { active = false; };
  }, [user, logsRefreshKey]);

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !mealType) {
      toast.error('Сначала выберите приём пищи');
      return;
    }
    if (!questionnaireComplete) {
      toast.error('Сначала заполните анкету тренера');
      return;
    }
    if (!manualProduct.name.trim()) {
      toast.error('Введите название продукта');
      return;
    }
    try {
      const { error } = await supabase.from('nutrition_logs').insert({
        user_id: user.id,
        custom_name: manualProduct.name,
        proteins: Number(manualProduct.proteins) || 0,
        fats: Number(manualProduct.fats) || 0,
        carbs: Number(manualProduct.carbs) || 0,
        calories: Number(manualProduct.calories) || 0,
        grams: 100,
        meal_type: mealType,
        log_date: new Date().toISOString().split('T')[0],
      });
      if (error) throw error;
      toast.success('Продукт добавлен!');
      setManualProduct({ name: '', proteins: '', fats: '', carbs: '', calories: '' });
      setLogsRefreshKey((current) => current + 1);
      setManualEntryOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? `Ошибка: ${error.message}` : 'Ошибка добавления продукта');
    }
  };

  const handleAddProduct = async () => {
    if (!user || !mealType || !selectedProduct || addingProduct) return;
    if (!questionnaireComplete) {
      toast.error('Сначала заполните анкету тренера');
      return;
    }
    const grams = Math.round(Number(portionGrams));
    if (!Number.isFinite(grams) || grams < 1) {
      toast.error('Укажите количество продукта в граммах');
      return;
    }
    const factor = grams / 100;
    setAddingProduct(true);
    try {
      const { error } = await supabase.from('nutrition_logs').insert({
        user_id: user.id,
        product_id: selectedProduct.source === 'Локальный каталог' && typeof selectedProduct.id === 'number'
          ? selectedProduct.id
          : null,
        custom_name: selectedProduct.name,
        proteins: Number(selectedProduct.proteins || 0) * factor,
        fats: Number(selectedProduct.fats || 0) * factor,
        carbs: Number(selectedProduct.carbs || 0) * factor,
        calories: Number(selectedProduct.calories || 0) * factor,
        grams,
        meal_type: mealType,
        log_date: new Date().toISOString().split('T')[0],
      });
      if (error) throw error;
      toast.success(`${selectedProduct.name} добавлен в дневник`);
      setSelectedProduct(null);
      setPortionGrams('100');
      setLogsRefreshKey((current) => current + 1);
    } catch (error) {
      console.error('Searched product logging failed', error);
      toast.error(error instanceof Error ? `Не удалось записать продукт: ${error.message}` : 'Не удалось записать продукт');
    } finally {
      setAddingProduct(false);
    }
  };

  const searchProducts = async () => {
    if (!mealType) {
      toast.error('Сначала выберите приём пищи');
      return;
    }
    const query = productQuery.trim();
    if (query.length < 2) {
      setProductResults([]);
      setProductSearchError('Введите не менее двух символов для поиска по локальному каталогу.');
      return;
    }
    setProductSearchLoading(true);
    setProductSearchError('');
    setManualEntryOpen(false);
    setProductResults([]);
    setSelectedProduct(null);
    const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
    const mcpUrl = import.meta.env.VITE_VKUSVILL_API_URL;
    let providerError = '';
    try {
      try {
        const url = new URL(`${apiUrl.replace(/\/+$/, '')}/products/search`, window.location.origin);
        url.searchParams.set('query', query);
        if (mcpUrl) url.searchParams.set('mcp_url', mcpUrl);
        const response = await fetch(url.toString());
        const payload = await response.json().catch(() => null) as ProductSearchResult[] | { detail?: string } | null;
        if (response.ok && Array.isArray(payload)) {
          const vkusvillItems = payload.map((item) => ({ ...item, source: 'ВкусВилл' as const }));
          if (vkusvillItems.length) {
            setProductResults(vkusvillItems);
            return;
          }
        } else {
          const detail = payload && !Array.isArray(payload) ? payload.detail : null;
          if (detail) providerError = `ВкусВилл: ${detail}`;
        }
      } catch (error) {
        console.error('VkusVill product search failed', error);
        providerError = 'Не удалось подключиться к ВкусВилл.';
      }
      const { data, error } = await supabase
        .from('food_products')
        .select('id, name, brand, proteins, fats, carbs, calories')
        .ilike('name', `%${query}%`)
        .limit(15);
      if (error) throw error;
      const localItems = ((data ?? []) as Omit<ProductSearchResult, 'source'>[])
        .map((item) => ({ ...item, source: 'Локальный каталог' as const }));
      setProductResults(localItems);
      setProductSearchError(localItems.length
        ? (providerError ? `${providerError} Показаны результаты из локального каталога.` : '')
        : `${providerError ? `${providerError} ` : ''}Ничего не найдено. Добавьте продукт вручную ниже.`);
    } catch (error) {
      console.error('Local product search failed', error);
      const missingCatalog = typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'PGRST205';
      setProductSearchError(missingCatalog
        ? `${providerError ? `${providerError} ` : ''}Локальный каталог продуктов не создан в Supabase. Примените миграции проекта; пока можно добавить продукт вручную.`
        : `${providerError ? `${providerError} ` : ''}Не удалось выполнить поиск по локальному каталогу. Можно добавить продукт вручную.`);
    } finally {
      setProductSearchLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-text mb-6">Питание</h1>
      {!profileLoading && !questionnaireComplete && (
        <div className="mb-6"><QuestionnaireRequired /></div>
      )}

      <section className="card-modern mb-6 flex flex-wrap items-center gap-6">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Итого за сегодня</h2>
          {nutritionTargets
            ? <CircularProgress value={dailyTotals.calories} max={nutritionTargets.calories} size={140} color="var(--accent-orange)" label={`${Math.round(dailyTotals.calories)}`} sublabel={`из ${nutritionTargets.calories} ккал`} />
            : <div className="flex h-[140px] w-[140px] flex-col items-center justify-center rounded-full border-8 border-bg-tertiary text-center">
              <span className="text-2xl font-bold text-text">{Math.round(dailyTotals.calories)}</span>
              <span className="mt-1 text-xs text-text-secondary">ккал съедено</span>
              <span className="mt-1 text-[10px] text-text-tertiary">норма не рассчитана</span>
            </div>}
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3 text-center">
          <p className="text-sm text-text"><span className="font-bold">{Math.round(dailyTotals.proteins)} / {nutritionTargets?.protein ?? '—'} г</span><br /><span className="text-xs text-text-secondary">Белки · съедено / цель</span></p>
          <p className="text-sm text-text"><span className="font-bold">{Math.round(dailyTotals.fats)} / {nutritionTargets?.fat ?? '—'} г</span><br /><span className="text-xs text-text-secondary">Жиры · съедено / цель</span></p>
          <p className="text-sm text-text"><span className="font-bold">{Math.round(dailyTotals.carbs)} / {nutritionTargets?.carbs ?? '—'} г</span><br /><span className="text-xs text-text-secondary">Углеводы · съедено / цель</span></p>
        </div>
        {!nutritionTargets && <p className="basis-full text-xs text-text-tertiary">Чтобы рассчитать личную норму КБЖУ, укажите в анкете пол, возраст от 18 лет, рост, вес и уровень активности.</p>}
      </section>

      <section className="card-modern mb-6">
        <h2 className="mb-3 text-lg font-semibold text-text">Выберите приём пищи</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Приёмы пищи">
          {MEAL_TYPES.map((meal) => (
            <button
              type="button"
              aria-pressed={mealType === meal.value}
              key={meal.value}
              onClick={() => {
                setMealType(meal.value);
                setProductQuery('');
                setProductResults([]);
                setSelectedProduct(null);
                setProductSearchError('');
                setManualEntryOpen(false);
              }}
              className={`rounded-xl border px-4 py-4 text-sm font-semibold transition ${mealType === meal.value ? 'border-accent-blue bg-accent-blue/10 text-accent-blue' : 'border-border bg-bg-tertiary text-text-secondary hover:border-accent-blue hover:text-text'}`}
            >
              {meal.label}
            </button>
          ))}
        </div>
        {mealType && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="font-semibold text-text">{MEAL_TYPES.find((meal) => meal.value === mealType)?.label} за сегодня</h3>
            {mealLogs.length ? (
              <ul className="mt-3 divide-y divide-border">
                {mealLogs.map((meal) => (
                  <li key={meal.id} className="flex items-center justify-between gap-3 py-3">
                    <div><p className="text-sm text-text">{meal.custom_name || `Продукт #${meal.product_id ?? ''}`}</p><p className="text-xs text-text-tertiary">{meal.grams} г · Б {Math.round(Number(meal.proteins) || 0)} г · Ж {Math.round(Number(meal.fats) || 0)} г · У {Math.round(Number(meal.carbs) || 0)} г</p></div>
                    <span className="shrink-0 text-sm font-semibold text-text">{Math.round(Number(meal.calories) || 0)} ккал</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-text-secondary">Записей пока нет.</p>}
          </div>
        )}
      </section>

      {mealType && (
        <>
          <section className="card-modern mb-6 space-y-4">
            <div><h2 className="text-lg font-semibold text-text">Поиск продуктов</h2><p className="text-xs text-text-tertiary">Сначала ищем во ВкусВилл, затем в локальном каталоге.</p></div>
            <div className="flex gap-2"><input value={productQuery} onChange={(event) => { setProductQuery(event.target.value); setProductResults([]); setSelectedProduct(null); setProductSearchError(''); setManualEntryOpen(false); }} onKeyDown={(event) => { if (event.key === 'Enter') void searchProducts(); }} className="input-field min-w-0 flex-1 px-3 py-2.5 text-text" placeholder="Например, творог" /><button type="button" onClick={() => void searchProducts()} disabled={productSearchLoading} className="btn-primary flex items-center gap-2 px-4 py-2.5 disabled:opacity-50"><Search size={17} /> Искать</button></div>
            {productSearchError && <div className="space-y-3"><p className="text-sm text-text-secondary">{productSearchError}</p>{productQuery.trim().length >= 2 && productResults.length === 0 && !productSearchLoading && <button type="button" onClick={() => setManualEntryOpen(true)} className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm"><Plus size={16} /> Добавить продукт вручную</button>}</div>}
            {productResults.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{productResults.map((product) => <div key={`${product.source}-${product.id}`} className="rounded-lg border border-border px-3 py-3 transition hover:border-accent-blue"><div className="flex items-start justify-between gap-2 text-sm text-text"><span>{product.name}</span><span className="shrink-0 rounded-full bg-accent-blue/10 px-2 py-0.5 text-[10px] text-accent-blue">{product.source}</span></div><p className="mt-1 text-xs text-text-tertiary">{product.brand ? `${product.brand} · ` : ''}{product.price ? `${product.price} ₽ · ` : ''}{product.rating ? `★ ${product.rating.toFixed(1)} · ` : ''}Б {product.proteins || '—'} г · Ж {product.fats || '—'} г · У {product.carbs || '—'} г · {product.calories || '—'} ккал</p><button type="button" onClick={() => { setSelectedProduct(product); setPortionGrams('100'); }} className="btn-secondary mt-3 w-full px-3 py-2 text-sm">Выбрать продукт · указать граммовку</button>{product.nutrition_info && <p className="mt-2 text-xs text-text-secondary">Пищевая ценность на 100 г: {product.nutrition_info}</p>}{product.ingredients && <details className="mt-1 text-xs text-text-secondary"><summary className="cursor-pointer">Состав</summary><p className="mt-1">{product.ingredients}</p></details>}{product.url && <a href={product.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent-blue underline">Открыть товар</a>}</div>)}</div>}
          </section>

          {manualEntryOpen && (
        <section className="card-modern mb-6">
          <h2 id="manual-entry" className="mb-4 text-lg font-semibold text-text">Добавить продукт вручную</h2>
          <form onSubmit={handleAddManual} className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <input
              type="text"
              placeholder="Название продукта"
              value={manualProduct.name}
              onChange={(e) => setManualProduct({ ...manualProduct, name: e.target.value })}
              className="bg-bg border border-border rounded-lg px-3 py-2.5 text-text w-full"
              required
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input
              type="number"
              placeholder="Белки (г)"
              value={manualProduct.proteins}
              onChange={(e) => setManualProduct({ ...manualProduct, proteins: e.target.value })}
              className="bg-bg border border-border rounded-lg px-3 py-2 text-text w-full"
              step="0.1"
            />
            <input
              type="number"
              placeholder="Жиры (г)"
              value={manualProduct.fats}
              onChange={(e) => setManualProduct({ ...manualProduct, fats: e.target.value })}
              className="bg-bg border border-border rounded-lg px-3 py-2 text-text w-full"
              step="0.1"
            />
            <input
              type="number"
              placeholder="Углеводы (г)"
              value={manualProduct.carbs}
              onChange={(e) => setManualProduct({ ...manualProduct, carbs: e.target.value })}
              className="bg-bg border border-border rounded-lg px-3 py-2 text-text w-full"
              step="0.1"
            />
            <input
              type="number"
              placeholder="Калории"
              value={manualProduct.calories}
              onChange={(e) => setManualProduct({ ...manualProduct, calories: e.target.value })}
              className="bg-bg border border-border rounded-lg px-3 py-2 text-text w-full"
              step="1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-1 self-center text-sm text-text-secondary">Приём пищи: {MEAL_TYPES.find((meal) => meal.value === mealType)?.label}</span>
            <button type="submit" disabled={!questionnaireComplete} className="bg-blue-500 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition disabled:cursor-not-allowed disabled:opacity-50">
              <Plus size={18} /> Добавить
            </button>
            <button type="button" onClick={() => setManualEntryOpen(false)} className="btn-secondary px-4 py-2 text-sm">Отмена</button>
          </div>
        </form>
        </section>
          )}
        </>
      )}

      {selectedProduct && mealType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !addingProduct) setSelectedProduct(null);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="portion-dialog-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <h2 id="portion-dialog-title" className="text-lg font-semibold text-text">{selectedProduct.name}</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Добавляем в приём пищи: {MEAL_TYPES.find((meal) => meal.value === mealType)?.label}
            </p>
            <label className="mt-4 block text-sm font-medium text-text">
              Количество, граммы
              <input
                ref={portionInputRef}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={portionGrams}
                onChange={(event) => setPortionGrams(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddProduct();
                  if (event.key === 'Escape' && !addingProduct) setSelectedProduct(null);
                }}
                className="input-field mt-2 w-full px-3 py-2.5 text-text"
              />
            </label>
            <div className="mt-4 rounded-lg bg-bg-tertiary p-3 text-sm text-text-secondary">
              Порция: {Math.max(0, Number(portionGrams) || 0)} г · около{' '}
              {Math.round((Number(selectedProduct.calories) || 0) * Math.max(0, Number(portionGrams) || 0) / 100)} ккал
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={addingProduct} onClick={() => setSelectedProduct(null)} className="btn-secondary px-4 py-2 text-sm">
                Отмена
              </button>
              <button type="button" disabled={addingProduct || !questionnaireComplete} onClick={() => void handleAddProduct()} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                {addingProduct ? 'Добавляем…' : <><Plus size={16} /> Добавить в дневник</>}
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}