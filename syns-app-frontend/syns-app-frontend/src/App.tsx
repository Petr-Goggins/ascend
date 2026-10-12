import { useEffect, useState, type ComponentType } from 'react';
import {
  createBrowserRouter,
  Outlet,
  redirect,
  RouterProvider,
  useOutletContext,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import WorkoutLogPage from './pages/WorkoutLogPage';
import SleepLogPage from './pages/SleepLogPage';
import AchievementsPage from './pages/AchievementsPage';
import SettingsPage from './pages/SettingsPage';
import PlanPage from './pages/PlanPage';
import NutritionPage from './pages/NutritionPage';
import ProgressPage from './pages/ProgressPage';
import CoachPage from './pages/CoachPage';
import ReportsPage from './pages/ReportsPage';
import CyclePage from './pages/CyclePage';

interface SidebarPageProps {
  onOpenSidebar: () => void;
}

interface SidebarContext {
  onOpenSidebar: () => void;
}

async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session ?? null;
  useAuthStore.getState().setUser(session?.user ?? null);
  return session;
}

async function requireSession() {
  return (await getSession()) ? null : redirect('/auth');
}

async function requireGuest() {
  return (await getSession()) ? redirect('/dashboard') : null;
}

function RouteError() {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-6">
      <p role="alert" className="text-text-secondary">
        Не удалось проверить сессию. Проверьте соединение и обновите страницу.
      </p>
    </main>
  );
}

function AuthenticatedLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const onOpenSidebar = () => setSidebarOpen(true);

  return (
    <Layout
      sidebarOpen={sidebarOpen}
      onOpenSidebar={onOpenSidebar}
      onCloseSidebar={() => setSidebarOpen(false)}
    >
      <Outlet context={{ onOpenSidebar }} />
    </Layout>
  );
}

function PageWithSidebar({ Page }: { Page: ComponentType<SidebarPageProps> }) {
  const { onOpenSidebar } = useOutletContext<SidebarContext>();
  return <Page onOpenSidebar={onOpenSidebar} />;
}

const router = createBrowserRouter([
  {
    path: '/auth',
    loader: requireGuest,
    element: <AuthPage />,
    errorElement: <RouteError />,
  },
  {
    path: '/',
    loader: requireSession,
    element: <AuthenticatedLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, loader: () => redirect('/dashboard') },
      { path: 'dashboard', element: <PageWithSidebar Page={DashboardPage} /> },
      { path: 'coach', element: <PageWithSidebar Page={CoachPage} /> },
      { path: 'plan', element: <PageWithSidebar Page={PlanPage} /> },
      { path: 'nutrition', element: <PageWithSidebar Page={NutritionPage} /> },
      { path: 'reports', element: <PageWithSidebar Page={ReportsPage} /> },
      { path: 'cycle', element: <PageWithSidebar Page={CyclePage} /> },
      { path: 'chat', element: <PageWithSidebar Page={ChatPage} /> },
      { path: 'profile', element: <PageWithSidebar Page={ProfilePage} /> },
      { path: 'workouts', element: <PageWithSidebar Page={WorkoutLogPage} /> },
      { path: 'workout', element: <PageWithSidebar Page={WorkoutLogPage} /> },
      { path: 'sleep', element: <PageWithSidebar Page={SleepLogPage} /> },
      { path: 'achievements', element: <PageWithSidebar Page={AchievementsPage} /> },
      { path: 'settings', element: <PageWithSidebar Page={SettingsPage} /> },
      { path: 'progress', element: <PageWithSidebar Page={ProgressPage} /> },
      { path: '*', loader: () => redirect('/dashboard') },
    ],
  },
]);

export default function App() {
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      useAuthStore.getState().setUser(session?.user ?? null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1A1A2E',
            color: '#E6EDF3',
            border: '1px solid #34344A',
            borderRadius: '12px',
            padding: '12px 16px',
          },
        }}
      />
      <RouterProvider router={router} />
    </>
  );
}
