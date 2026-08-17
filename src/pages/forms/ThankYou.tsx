/**
 * ThankYou page — ported from contracting-portal
 *
 * Shown after successful intake form submission.
 * Disables browser back to prevent re-submission.
 */
import { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { PublicFormLayout } from '@/components/forms/PublicFormLayout';

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
    <PublicFormLayout>
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="bg-white rounded-lg shadow-lg p-12 max-w-2xl w-full text-center">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-navy-600">FYM Financial</h1>
          <p className="text-xs text-gray-600 mt-1">where transparency & opportunity meet</p>
        </div>

        <div className="mb-6">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-6">Thank You!</h2>

        <p className="text-lg text-gray-700 mb-4">
          Your agent intake form has been submitted successfully. The Contracting team will review
          your information and reach out to you shortly.
        </p>

        <p className="text-gray-600">
          If you have any questions, please contact{' '}
          <a href="mailto:Contracting@teamfym.com" className="text-navy-600 hover:underline">
            Contracting@teamfym.com
          </a>
        </p>
      </div>
    </div>
    </PublicFormLayout>
  );
}
