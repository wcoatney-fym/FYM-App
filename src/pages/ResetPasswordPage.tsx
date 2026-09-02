import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

/**
 * One-time password viewer page.
 * Route: /reset-password/:token
 *
 * Public — no auth gate. The token UUID is the only credential.
 * Calls the akhojh `view-password-token` edge function to decrypt
 * and return the password exactly once.
 *
 * Not indexable: <meta name="robots" content="noindex, nofollow" />
 */

const PORTAL_URL = import.meta.env.VITE_PORTAL_SUPABASE_URL as string;

type ViewState =
  | { kind: 'loading' }
  | { kind: 'success'; password: string; agencyName: string; agencySlug: string }
  | { kind: 'already_viewed' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Set noindex meta tag
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', message: 'No token provided.' });
      return;
    }

    const fetchPassword = async () => {
      try {
        const res = await fetch(
          `${PORTAL_URL}/functions/v1/view-password-token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          },
        );

        const data = await res.json();

        if (res.ok && data.password) {
          setState({
            kind: 'success',
            password: data.password,
            agencyName: data.agency_name,
            agencySlug: data.agency_slug,
          });
        } else if (data.error === 'already_viewed') {
          setState({ kind: 'already_viewed' });
        } else if (data.error === 'expired') {
          setState({ kind: 'expired' });
        } else {
          setState({ kind: 'error', message: data.message || data.error || 'Something went wrong.' });
        }
      } catch {
        setState({ kind: 'error', message: 'Network error. Please try again.' });
      }
    };

    fetchPassword();
  }, [token]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '1rem',
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        padding: '2.5rem 2rem',
        textAlign: 'center',
      }}>
        {/* FYM Logo / Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            FYM Agency Portal
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
            Password Reset
          </p>
        </div>

        {state.kind === 'loading' && (
          <div style={{ padding: '2rem 0' }}>
            <div style={{
              width: '32px', height: '32px', border: '3px solid #e2e8f0',
              borderTopColor: '#3b82f6', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto',
            }} />
            <p style={{ color: '#64748b', marginTop: '1rem' }}>Retrieving your password...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {state.kind === 'success' && (
          <div>
            <p style={{ color: '#334155', marginBottom: '0.5rem' }}>
              Hi <strong>{state.agencyName}</strong>, here is your new portal password:
            </p>

            <div style={{
              backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '1rem',
              marginTop: '1rem', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: '0.75rem',
            }}>
              <code style={{
                fontSize: '1.25rem', fontWeight: 600, color: '#0f172a',
                letterSpacing: '0.5px', wordBreak: 'break-all',
              }}>
                {state.password}
              </code>
              <button
                onClick={() => handleCopy(state.password)}
                style={{
                  flexShrink: 0, padding: '0.5rem 1rem', borderRadius: '6px',
                  border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                  backgroundColor: copied ? '#10b981' : '#3b82f6', color: '#fff',
                  transition: 'background-color 0.2s',
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <div style={{
              backgroundColor: '#fef3c7', borderRadius: '8px', padding: '0.75rem 1rem',
              marginTop: '1.25rem', textAlign: 'left',
            }}>
              <p style={{ color: '#92400e', fontSize: '0.8125rem', margin: 0, fontWeight: 600 }}>
                ⚠️ This password will not be shown again.
              </p>
              <p style={{ color: '#92400e', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
                Save it now. If you lose it, contact FYM support for a new one.
              </p>
            </div>

            {state.agencySlug && (
              <a
                href={`https://agency.teamfym.com/agency/${state.agencySlug}`}
                style={{
                  display: 'inline-block', marginTop: '1.5rem', padding: '0.75rem 1.5rem',
                  backgroundColor: '#3b82f6', color: '#fff', borderRadius: '8px',
                  textDecoration: 'none', fontWeight: 600, fontSize: '0.9375rem',
                }}
              >
                Go to Portal →
              </a>
            )}
          </div>
        )}

        {state.kind === 'already_viewed' && (
          <div style={{ padding: '1rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
            <h2 style={{ color: '#1e293b', fontSize: '1.125rem', fontWeight: 600 }}>
              Link Already Used
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.9375rem', lineHeight: 1.5 }}>
              This password link has already been viewed. Your password was shown once when the link was first opened.
            </p>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '1rem' }}>
              If you didn't save it, contact FYM support at{' '}
              <a href="mailto:will@teamfym.com" style={{ color: '#3b82f6' }}>will@teamfym.com</a>
            </p>
          </div>
        )}

        {state.kind === 'expired' && (
          <div style={{ padding: '1rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⏰</div>
            <h2 style={{ color: '#1e293b', fontSize: '1.125rem', fontWeight: 600 }}>
              Link Expired
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.9375rem', lineHeight: 1.5 }}>
              This password reset link has expired. Contact FYM support for a new password.
            </p>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '1rem' }}>
              <a href="mailto:will@teamfym.com" style={{ color: '#3b82f6' }}>will@teamfym.com</a>
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div style={{ padding: '1rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>❌</div>
            <h2 style={{ color: '#1e293b', fontSize: '1.125rem', fontWeight: 600 }}>
              Something Went Wrong
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>{state.message}</p>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '1rem' }}>
              Contact FYM support at{' '}
              <a href="mailto:will@teamfym.com" style={{ color: '#3b82f6' }}>will@teamfym.com</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
