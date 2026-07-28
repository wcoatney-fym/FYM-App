import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface SubTab {
  to: string;
  label: string;
}

interface SubTabLayoutProps {
  tabs: SubTab[];
}

/**
 * Horizontal tab bar rendered above page content for grouped nav sections.
 * Each tab is a NavLink — active state handled by react-router.
 */
export function SubTabLayout({ tabs }: SubTabLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="border-b border-border/40 bg-card/50 px-6">
        <nav className="flex gap-1 -mb-px">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  'px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 whitespace-nowrap',
                  isActive
                    ? 'border-[hsl(199,89%,48%)] text-[hsl(199,89%,48%)]'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
