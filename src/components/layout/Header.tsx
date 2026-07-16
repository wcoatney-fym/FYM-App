import { useAppStore } from '@/store/app-store';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { useMockData } = useAppStore();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-4">
        {useMockData && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
            Mock Data
          </Badge>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-sm font-medium">
            FY
          </div>
          <span className="text-sm font-medium text-slate-700 hidden sm:block">FYM Ops</span>
        </div>
      </div>
    </header>
  );
}
