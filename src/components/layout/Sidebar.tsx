import { NavLink, useLocation } from 'react-router-dom';
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
  ClipboardList,
  Command,
  TrendingUp,
  HeartPulse,
  GraduationCap,
  FileSpreadsheet,
  Target,
  Megaphone,
  Activity,
  Briefcase,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  /** If set, sidebar item is active when path starts with this prefix */
  activePrefix?: string;
}

/** Agent nav — single nav for all agents regardless of RTS status.
 *  Only the content of My Contracting changes (pre-RTS vs post-RTS). */
const agentNav: NavItem[] = [
  { to: '/my-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/my-contracting', label: 'My Contracting', icon: Briefcase },
  { to: '/my-production', label: 'My Production', icon: TrendingUp },
  { to: '/at-risk', label: 'Needs Attention', icon: AlertTriangle },
  { to: '/my-goal', label: 'My Goal', icon: Target },
  { to: '/my-health', label: 'Book Health', icon: ShieldCheck },
  { to: '/training', label: 'Training', icon: GraduationCap },
  { to: '/quality/coaching-pipeline', label: 'Coaching', icon: HeartPulse, activePrefix: '/quality/coaching' },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const managerNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/my-team', label: 'My Team', icon: Users },
  { to: '/people/agents', label: 'Agents', icon: FileSpreadsheet, activePrefix: '/people' },
  { to: '/production', label: 'Production', icon: TrendingUp, activePrefix: '/production' },
  { to: '/quality/retention', label: 'Quality', icon: ShieldCheck, activePrefix: '/quality' },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/workboard', label: 'Workboard', icon: ClipboardList },
  { to: '/daily-pulse', label: 'Daily Pulse', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const fymAdminNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/recruiting', label: 'Recruiting', icon: Megaphone, activePrefix: '/recruiting' },
  { to: '/contracting', label: 'Contracting', icon: FileText },
  { to: '/daily-pulse', label: 'Daily Pulse', icon: Activity },
  { to: '/production', label: 'Production', icon: TrendingUp, activePrefix: '/production' },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/quality/retention', label: 'Quality', icon: ShieldCheck, activePrefix: '/quality' },
  { to: '/people/agencies', label: 'Agencies & Agents', icon: Building2, activePrefix: '/people' },
  { to: '/training', label: 'Training', icon: GraduationCap },
  { to: '/crm-command', label: 'CRM Command', icon: Command },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const agencyAdminNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/people/agents', label: 'Agents', icon: Users, activePrefix: '/people' },
  { to: '/production', label: 'Production', icon: TrendingUp, activePrefix: '/production' },
  { to: '/quality/retention', label: 'Quality', icon: ShieldCheck, activePrefix: '/quality' },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/workboard', label: 'Workboard', icon: ClipboardList },
  { to: '/contracting', label: 'Contracting', icon: FileText },
  { to: '/crm-command', label: 'CRM Command', icon: Command },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const { profile, signOut } = useAuth();
  const { effectiveRole, isFymAdmin, isViewingAs, isOrgWide } = useEffectiveAuth();
  const location = useLocation();

  const navItems =
    effectiveRole === 'agent' ? agentNav :
    effectiveRole === 'manager' ? managerNav :
    isOrgWide ? fymAdminNav :
    agencyAdminNav;

  const roleLabel = isViewingAs
    ? `${effectiveRole} (view as)`
    : isFymAdmin
      ? 'fym admin'
      : (effectiveRole ?? 'loading');

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
              {roleLabel}
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map(({ to, label, icon: Icon, activePrefix }) => {
          // Group tabs use prefix matching; standalone tabs use exact or default NavLink matching
          const isPrefixActive = activePrefix
            ? location.pathname.startsWith(activePrefix)
            : false;

          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/' && !activePrefix}
              className={({ isActive: routerActive }) => {
                const active = activePrefix ? isPrefixActive : routerActive;
                return cn(
                  'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 relative group',
                  active
                    ? 'text-[hsl(var(--sidebar-active))] bg-[hsl(var(--sidebar-active))]/10'
                    : 'text-[hsl(var(--sidebar-foreground))]/60 hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-foreground))]',
                  sidebarCollapsed && 'justify-center px-0'
                );
              }}
            >
              {({ isActive: routerActive }) => {
                const active = activePrefix ? isPrefixActive : routerActive;
                return (
                  <>
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[hsl(var(--sidebar-active))] shadow-[0_0_8px_hsl(199_89%_48%_/_0.4)]" />
                    )}
                    <Icon size={18} className="flex-shrink-0" />
                    {!sidebarCollapsed && label}
                  </>
                );
              }}
            </NavLink>
          );
        })}
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
