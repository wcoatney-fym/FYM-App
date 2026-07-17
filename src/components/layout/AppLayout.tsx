import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { sidebarCollapsed } = useAppStore();
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'ml-16' : 'ml-56'
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
