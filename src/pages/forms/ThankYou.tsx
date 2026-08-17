/**
 * ThankYou page — ported from contracting-portal
 *
 * Shown after successful intake form submission.
 * Disables browser back to prevent re-submission.
 * Styled for FYM App dark theme.
 */
import { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';

export function ThankYou() {
  useEffect(() => {
    const disableBack = () => {
      window.history.pushState(null, '', window.location.href);
    };

    disableBack();
    window.addEventListener('popstate', disableBack);

    return () => {
      window.removeEventListener('popstate', disableBack);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass-card p-12 max-w-2xl w-full text-center">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-primary">FYM Financial</h1>
          <p className="text-xs text-muted-foreground mt-1">where transparency & opportunity meet</p>
        </div>

        <div className="mb-6">
          <CheckCircle className="w-20 h-20 text-accent mx-auto" />
        </div>

        <h2 className="text-3xl font-bold text-foreground mb-6">Thank You!</h2>

        <p className="text-lg text-muted-foreground mb-4">
          Your agent intake form has been submitted successfully. The Contracting team will review
          your information and reach out to you shortly.
        </p>

        <p className="text-muted-foreground">
          If you have any questions, please contact{' '}
          <a href="mailto:Contracting@teamfym.com" className="text-primary hover:underline">
            Contracting@teamfym.com
          </a>
        </p>
      </div>
    </div>
  );
}
