import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  AlertTriangle,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Trophy,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

const agentNav: NavItem[] = [
  { to: '/my-health', label: 'My Book Health', icon: ShieldCheck },
  { to: '/at-risk', label: 'At-Risk', icon: AlertTriangle },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const managerNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workboard', label: 'Workboard', icon: AlertTriangle },
  { to: '/agents', label: 'Agents', icon: Users },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const adminNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agencies', label: 'Agencies', icon: Building2 },
  { to: '/agents', label: 'Agents', icon: Users },
  { to: '/at-risk', label: 'At-Risk', icon: AlertTriangle },
  { to: '/contracting', label: 'Contracting', icon: FileText },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/crm-ops', label: 'CRM Ops', icon: Headphones },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const { role, profile, signOut } = useAuth();

  const navItems =
    role === 'agent' ? agentNav :
    role === 'manager' ? managerNav :
    adminNav;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-[#1e3a5f] text-white flex flex-col transition-all duration-300 z-40',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-white/10', sidebarCollapsed && 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={16} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <p className="text-sm font-bold tracking-wide">FYM</p>
            <p className="text-[10px] text-white/50 uppercase tracking-widest leading-none mt-0.5">
              {role ?? 'loading'}
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors rounded-none',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/8 hover:text-white',
                sidebarCollapsed && 'justify-center px-0'
              )
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* User / sign-out */}
      {!sidebarCollapsed && profile && (
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-xs font-medium text-white truncate">{profile.full_name ?? 'FYM User'}</p>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white mt-1 transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-white/10 text-white/50 hover:text-white hover:bg-white/8 transition-colors"
      >
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
