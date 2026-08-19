import { useState, useEffect, useCallback } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ViewAsBanner } from './ViewAsBanner';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAsStore } from '@/store/view-as-store';
import { AgencyFilterProvider } from '@/contexts/AgencyFilterContext';
import { OrgDataProvider } from '@/contexts/OrgDataCache';
import { cn } from '@/lib/utils';
import { PolicySearchPalette } from '@/components/search/PolicySearchPalette';
import { ClientDetailDrawer } from '@/components/client-detail';
import type { DrawerPolicy } from '@/components/client-detail/ClientDetailDrawer';

export function AppLayout() {
  const { sidebarCollapsed } = useAppStore();
  const { session, loading } = useAuth();
  const isViewingAs = useViewAsStore((s) => s.active);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPolicy, setSearchPolicy] = useState<DrawerPolicy | null>(null);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSearchSelect = useCallback((policy: DrawerPolicy) => {
    setSearchPolicy(policy);
  }, []);

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
        <StatusBar onSearchClick={() => setSearchOpen(true)} />
        <AgencyFilterProvider>
          <OrgDataProvider>
            <Outlet />
          </OrgDataProvider>
        </AgencyFilterProvider>
      </main>

      {/* Global policy search palette (⌘K) */}
      <PolicySearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectPolicy={handleSearchSelect}
      />

      {/* Drawer opened from search results */}
      {searchPolicy && (
        <ClientDetailDrawer
          policy={searchPolicy}
          onClose={() => setSearchPolicy(null)}
          actionsEnabled={true}
        />
      )}
    </div>
  );
}
