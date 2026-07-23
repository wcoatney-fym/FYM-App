import { ReactNode } from 'react';
import { Mail, ExternalLink, ArrowDown } from 'lucide-react';
import type { RoadmapCTA } from '../../lib/onboarding/types';

interface SectionLabelProps {
  n: string;
  label: string;
  variant?: 'light' | 'dark';
}

export function SectionLabel({ n, label, variant = 'light' }: SectionLabelProps) {
  const ruleColor = variant === 'dark' ? 'bg-white/15' : 'bg-fym-ink/10';
  return (
    <div className="flex items-center gap-4 mb-12">
      <span className="font-body text-[11px] tracking-[0.2em] uppercase text-fym-brass font-medium whitespace-nowrap">
        § {n}
      </span>
      <div className={`flex-1 h-px ${ruleColor}`} />
      <span className="font-body text-[11px] tracking-[0.2em] uppercase text-fym-brass font-medium whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-body text-[10px] tracking-[0.22em] uppercase text-fym-brass font-medium ${className}`}>
      {children}
    </span>
  );
}

export function H2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-fym-ink ${className}`}>
      {children}
    </h2>
  );
}

export function H3({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`font-display text-2xl md:text-3xl leading-tight tracking-tight text-fym-ink ${className}`}>
      {children}
    </h3>
  );
}

export function TaskCTA({ cta }: { cta: RoadmapCTA }) {
  const base =
    'inline-flex items-center gap-1.5 text-[12px] font-body font-medium text-fym-brass hover:text-fym-ink transition-colors';

  if (cta.type === 'email') {
    return (
      <a href={`mailto:${cta.to}?subject=${encodeURIComponent(cta.subject)}`} className={base}>
        <Mail className="w-3.5 h-3.5" />
        Email {cta.to.split('@')[0]}
      </a>
    );
  }
  if (cta.type === 'link') {
    return (
      <a href={cta.url} target="_blank" rel="noopener noreferrer" className={base}>
        <ExternalLink className="w-3.5 h-3.5" />
        {cta.label}
      </a>
    );
  }
  return (
    <button
      onClick={() => {
        const el = document.getElementById(cta.to);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      className={base}
    >
      <ArrowDown className="w-3.5 h-3.5" />
      {cta.label}
    </button>
  );
}
