import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  AlertTriangle,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Trophy,
  ShieldCheck,
  LogOut,
  BarChart3,
  ClipboardList,
  UserPlus,
  Rocket,
  Command,
  TrendingUp,
  BookOpen,
  Activity,
  HeartPulse,
  Swords,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

const agentNav: NavItem[] = [
  { to: '/my-health', label: 'My Book Health', icon: ShieldCheck },
  { to: '/at-risk', label: 'At-Risk', icon: AlertTriangle },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/compete', label: 'Compete', icon: Swords },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const managerNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/production', label: 'Production', icon: TrendingUp },
  { to: '/workboard', label: 'Workboard', icon: ClipboardList },
  { to: '/retention', label: 'Retention', icon: Activity },
  { to: '/coaching', label: 'Coaching', icon: HeartPulse },
  { to: '/compete', label: 'Compete', icon: Swords },
  { to: '/agents', label: 'Agents', icon: Users },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const adminNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agencies', label: 'Agencies', icon: Building2 },
  { to: '/agents', label: 'Agents', icon: Users },
  { to: '/at-risk', label: 'At-Risk', icon: AlertTriangle },
  { to: '/workboard', label: 'Workboard', icon: ClipboardList },
  { to: '/contracting', label: 'Contracting', icon: FileText },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/crm-command', label: 'CRM Command', icon: Command },
  { to: '/production', label: 'Production', icon: TrendingUp },
  { to: '/book', label: 'Book of Business', icon: BookOpen },
  { to: '/financials', label: 'Financials', icon: BarChart3 },
  { to: '/retention', label: 'Retention', icon: Activity },
  { to: '/at-risk', label: 'At-Risk', icon: AlertTriangle },
  { to: '/compete', label: 'Compete', icon: Swords },
  { to: '/onboarding', label: 'Onboarding', icon: Rocket },
  { to: '/provision', label: 'Provision Agents', icon: UserPlus },
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
        'fixed left-0 top-0 h-full flex flex-col transition-all duration-300 z-40',
        'bg-[hsl(var(--sidebar))] border-r border-border/30',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo — gradient accent line at top */}
      <div className="h-[2px] w-full gradient-primary" />
      <div className={cn(
        'flex items-center gap-3 px-4 py-5 border-b border-border/20',
        sidebarCollapsed && 'justify-center px-0'
      )}>
        <div className="w-8 h-8 rounded-lg bg-[hsl(199,89%,48%)]/15 flex items-center justify-center flex-shrink-0 border border-[hsl(199,89%,48%)]/20 glow-sm">
          <ShieldCheck size={16} className="text-[hsl(199,89%,48%)]" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <p className="text-sm font-bold tracking-wide gradient-text">FYM</p>
            <p className="text-[10px] text-[hsl(var(--sidebar-foreground))]/50 uppercase tracking-widest leading-none mt-0.5">
              {role ?? 'loading'}
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 relative group',
                isActive
                  ? 'text-[hsl(var(--sidebar-active))] bg-[hsl(var(--sidebar-active))]/10'
                  : 'text-[hsl(var(--sidebar-foreground))]/60 hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-foreground))]',
                sidebarCollapsed && 'justify-center px-0'
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[hsl(var(--sidebar-active))] shadow-[0_0_8px_hsl(199_89%_48%_/_0.4)]" />
                )}
                <Icon size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User / sign-out */}
      {!sidebarCollapsed && profile && (
        <div className="border-t border-border/20 px-4 py-3">
          <p className="text-xs font-medium text-[hsl(var(--sidebar-foreground))] truncate">
            {profile.full_name ?? 'FYM User'}
          </p>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-[hsl(var(--sidebar-foreground))]/40 hover:text-[hsl(var(--sidebar-active))] mt-1 transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-border/20 text-[hsl(var(--sidebar-foreground))]/40 hover:text-[hsl(var(--sidebar-active))] hover:bg-[hsl(var(--sidebar-hover))] transition-all duration-200"
      >
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
