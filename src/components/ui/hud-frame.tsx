import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * HUD bracket frame — wraps a card with Jarvis-style corner brackets.
 * Uses CSS pseudo-elements for top-left + bottom-right corners,
 * and inner spans for top-right + bottom-left.
 */
interface HudFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accent color for the brackets. Default: cyan primary */
  accentColor?: string;
}

const HudFrame = React.forwardRef<HTMLDivElement, HudFrameProps>(
  ({ className, accentColor, children, ...props }, ref) => {
    const bracketColor = accentColor || 'hsl(199 89% 48% / 0.5)';
    const bracketSize = '14px';
    const bracketWidth = '2px';

    return (
      <div
        ref={ref}
        className={cn('relative', className)}
        {...props}
      >
        {/* Top-left corner */}
        <span
          className="absolute top-0 left-0 pointer-events-none z-10"
          style={{
            width: bracketSize,
            height: bracketSize,
            borderTop: `${bracketWidth} solid ${bracketColor}`,
            borderLeft: `${bracketWidth} solid ${bracketColor}`,
          }}
        />
        {/* Top-right corner */}
        <span
          className="absolute top-0 right-0 pointer-events-none z-10"
          style={{
            width: bracketSize,
            height: bracketSize,
            borderTop: `${bracketWidth} solid ${bracketColor}`,
            borderRight: `${bracketWidth} solid ${bracketColor}`,
          }}
        />
        {/* Bottom-left corner */}
        <span
          className="absolute bottom-0 left-0 pointer-events-none z-10"
          style={{
            width: bracketSize,
            height: bracketSize,
            borderBottom: `${bracketWidth} solid ${bracketColor}`,
            borderLeft: `${bracketWidth} solid ${bracketColor}`,
          }}
        />
        {/* Bottom-right corner */}
        <span
          className="absolute bottom-0 right-0 pointer-events-none z-10"
          style={{
            width: bracketSize,
            height: bracketSize,
            borderBottom: `${bracketWidth} solid ${bracketColor}`,
            borderRight: `${bracketWidth} solid ${bracketColor}`,
          }}
        />
        {children}
      </div>
    );
  }
);
HudFrame.displayName = 'HudFrame';

export { HudFrame };
