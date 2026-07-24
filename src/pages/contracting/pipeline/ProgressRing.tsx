/**
 * ProgressRing — compact SVG circular progress indicator for pipeline cards.
 * Ported from CRM Portal.
 */

interface ProgressRingProps {
  fraction: number;
  completed: number;
  total: number;
  size?: number;
  complete?: boolean;
}

export function ProgressRing({
  fraction,
  completed,
  total,
  size = 34,
  complete = false,
}: ProgressRingProps) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(fraction, 0), 1));
  const color = complete ? '#059669' : fraction > 0 ? '#2563eb' : '#cbd5e1';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-bold"
        style={{ color: complete ? '#059669' : '#475569' }}
      >
        {completed}/{total}
      </span>
    </div>
  );
}
