interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-background/80 backdrop-blur-xl border-b border-border/30">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-primary text-sm font-medium glow-sm">
            FY
          </div>
          <span className="text-sm font-medium text-muted-foreground hidden sm:block">FYM Ops</span>
        </div>
      </div>
    </header>
  );
}
