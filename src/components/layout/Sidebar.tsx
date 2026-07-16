import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  AlertTriangle,
  Settings,
  Headphones,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agencies', icon: Building2, label: 'Agencies' },
  { to: '/agents', icon: Users, label: 'Agents' },
  { to: '/contracting', icon: FileText, label: 'Contracting' },
  { to: '/at-risk', icon: AlertTriangle, label: 'At-Risk' },
  { to: '/crm-ops', icon: Headphones, label: 'CRM Ops' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-[#1e3a5f] text-white transition-all duration-300 flex flex-col',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-white/10">
        {!sidebarCollapsed && (
          <span className="text-lg font-bold tracking-tight whitespace-nowrap">
            FYM Command
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto p-1.5 rounded-md hover:bg-white/10 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <Icon size={20} className="shrink-0" />
            {!sidebarCollapsed && <span className="whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        {!sidebarCollapsed && (
          <p className="text-xs text-white/50">FYM Financial v1.0</p>
        )}
      </div>
    </aside>
  );
}
