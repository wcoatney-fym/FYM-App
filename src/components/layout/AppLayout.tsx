import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ViewAsBanner } from './ViewAsBanner';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAsStore } from '@/store/view-as-store';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { sidebarCollapsed } = useAppStore();
  const { session, loading } = useAuth();
  const isViewingAs = useViewAsStore((s) => s.active);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin glow-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background">
      <ViewAsBanner />
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'ml-16' : 'ml-56',
          isViewingAs && 'pt-9'
        )}
      >
        <StatusBar />
        <Outlet />
      </main>
    </div>
  );
}
