import { useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { mapAuthError } from '../lib/errorMapper';
import { notifySuccess } from '../lib/notifications';

export default function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRegistration, setIsRegistration] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const result = isRegistration
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });

      if (result.error) throw result.error;

      if (result.data.session) {
        notifySuccess(isRegistration ? 'Регистрация завершена' : 'Вы вошли в аккаунт');
        navigate('/dashboard');
      } else if (isRegistration) {
        setMessage('Проверьте почту и подтвердите адрес, чтобы войти в аккаунт.');
      } else {
        setError('Не удалось войти. Проверьте email и пароль.');
      }
    } catch (authError) {
      setError(mapAuthError(authError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-text text-center mb-6">Ascend</h1>
        <form onSubmit={handleSubmit} className="bg-bg-secondary p-6 rounded-xl border border-border">
          <h2 className="text-xl font-semibold text-text mb-5">
            {isRegistration ? 'Создать аккаунт' : 'Вход'}
          </h2>
          {error && <p role="alert" className="text-accent-red text-sm mb-4">{error}</p>}
          {message && <p role="status" className="text-accent-green text-sm mb-4">{message}</p>}
          <label className="sr-only" htmlFor="auth-email">Электронная почта</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="Электронная почта"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input-field w-full mb-3 px-3 py-2 rounded-lg"
            required
          />
          <label className="sr-only" htmlFor="auth-password">Пароль</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isRegistration ? 'new-password' : 'current-password'}
            placeholder="Пароль"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input-field w-full mb-4 px-3 py-2 rounded-lg"
            minLength={6}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                {isRegistration ? 'Регистрация...' : 'Вход...'}
              </span>
            ) : isRegistration ? 'Зарегистрироваться' : 'Войти'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setIsRegistration((value) => !value);
              setError(null);
              setMessage(null);
            }}
            className="w-full mt-4 text-sm text-accent-blue hover:underline disabled:opacity-50"
          >
            {isRegistration ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
          </button>
        </form>
      </div>
    </div>
  );
}
