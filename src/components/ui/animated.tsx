import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/* ── Staggered container ─────────────────────────────────────── */
const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

interface StaggerProps {
  children: React.ReactNode;
  className?: string;
  /** Pass-through for region semantics (rendered on a wrapper) */
  role?: string;
  'aria-label'?: string;
}

/** Stagger-animate direct children on mount.
 *  Respects `prefers-reduced-motion` — skips animation entirely. */
export function StaggerContainer({ children, className, role, 'aria-label': ariaLabel }: StaggerProps) {
  const shouldReduce = useReducedMotion();
  const inner = (
    <motion.div
      variants={containerVariants}
      initial={shouldReduce ? 'visible' : 'hidden'}
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
  // Wrap in a semantic element when role/aria-label are provided
  if (role || ariaLabel) {
    return <div role={role} aria-label={ariaLabel}>{inner}</div>;
  }
  return inner;
}

/** Wrap each card/item inside a StaggerContainer.
 *  Reduced-motion: renders without animation. */
export function StaggerItem({ children, className }: StaggerProps) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div variants={shouldReduce ? undefined : itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/* ── Fade-in on mount ────────────────────────────────────────── */
interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export function FadeIn({ children, className, delay = 0, duration = 0.5 }: FadeInProps) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      initial={shouldReduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduce ? { duration: 0 } : { duration, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── CountUp numeric animation ───────────────────────────────── */
interface CountUpProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  /** Format function — overrides default toLocaleString */
  format?: (n: number) => string;
}

export function CountUp({
  end,
  duration = 0.4,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
  format,
}: CountUpProps) {
  const [display, setDisplay] = useState('0');
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const hasAnimated = useRef(false);

  // Respect prefers-reduced-motion — snap to final value immediately
  const prefersReduced = typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    : false;

  useEffect(() => {
    // Only animate on initial mount. After that, snap instantly so
    // filter changes feel immediate instead of waiting 1.2s.
    if (hasAnimated.current || prefersReduced) {
      if (format) {
        setDisplay(format(end));
      } else {
        setDisplay(
          end.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        );
      }
      hasAnimated.current = true;
      return;
    }

    startRef.current = null;

    function step(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * end;

      if (format) {
        setDisplay(format(current));
      } else {
        setDisplay(
          current.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        );
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        hasAnimated.current = true;
        // Snap to final value
        if (format) {
          setDisplay(format(end));
        } else {
          setDisplay(
            end.toLocaleString('en-US', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          );
        }
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, duration, decimals, format, prefersReduced]);

  return (
    <span className={cn('font-data', className)}>
      {prefix}{display}{suffix}
    </span>
  );
}

/* ── Radial Gauge (arc meter) ────────────────────────────────── */
interface RadialGaugeProps {
  value: number;        // 0-100
  label?: string;
  size?: number;        // px, default 140
  strokeWidth?: number; // px, default 10
  className?: string;
  /** Color thresholds: [critical, warning, good] */
  thresholds?: [number, number]; // [belowIsCritical, belowIsWarning]
}

export function RadialGauge({
  value,
  label,
  size = 140,
  strokeWidth = 10,
  className,
  thresholds = [85, 90],
}: RadialGaugeProps) {
  const prefersReducedGauge = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.max(0, Math.min(100, value));

  // Determine color based on thresholds
  let strokeColor = 'hsl(142 71% 45%)'; // emerald — good
  let glowColor = 'hsl(142 71% 45% / 0.3)';
  if (clampedValue < thresholds[0]) {
    strokeColor = 'hsl(0 84% 60%)'; // red — critical
    glowColor = 'hsl(0 84% 60% / 0.3)';
  } else if (clampedValue < thresholds[1]) {
    strokeColor = 'hsl(38 92% 50%)'; // amber — warning
    glowColor = 'hsl(38 92% 50% / 0.3)';
  }

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(217 33% 14%)"
          strokeWidth={strokeWidth}
        />
        {/* Animated value arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clampedValue / 100) }}
          transition={prefersReducedGauge ? { duration: 0 } : { duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
          style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
          role="meter"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ? `${label}: ${clampedValue}%` : `${clampedValue}%`}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp
          end={clampedValue}
          duration={1.5}
          suffix="%"
          decimals={1}
          className="text-2xl font-bold text-foreground"
        />
        {label && (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
