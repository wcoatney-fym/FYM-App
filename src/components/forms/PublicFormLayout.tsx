/**
 * PublicFormLayout — light-theme wrapper for public intake form pages.
 *
 * The FYM App uses a global dark theme (CSS vars + body styles). Public intake
 * forms were ported from the portal which used a light theme. This wrapper
 * resets the background, text color, and color-scheme so all child elements
 * render with standard light-theme Tailwind utilities (bg-white, text-gray-700,
 * border-gray-300, etc.) without fighting the dark globals.
 */
export function PublicFormLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen public-form-light"
      style={{
        colorScheme: 'light',
        backgroundColor: '#F8F9FA', // steel-50
        color: '#212529',           // steel-900
      }}
    >
      {children}
    </div>
  );
}
