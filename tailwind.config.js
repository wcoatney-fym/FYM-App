/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '13': 'repeat(13, minmax(0, 1fr))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        // Activation hub palette (mirrors teamfym.com)
        fym: {
          ink: '#1a1a1a',
          paper: '#faf8f5',
          brass: '#b68b3c',
          muted: '#7a7a7a',
          cream2: '#f0ece4',
          rule: '#333333',
        },
        // Portal intake form palette (ported from contracting-portal)
        navy: {
          50: '#EEF2F8',
          100: '#D4DFEE',
          200: '#A9BFE0',
          300: '#7A9DD0',
          400: '#4E7DBF',
          500: '#2A5A9E',
          600: '#1E4785',
          700: '#17366B',
          800: '#112752',
          900: '#0B1A3A',
          950: '#060F22',
        },
        gold: {
          50: '#FBF7EB',
          100: '#F5ECD0',
          200: '#EBD9A2',
          300: '#E0C574',
          400: '#D4A843',
          500: '#C9A227',
          600: '#A3821F',
          700: '#7C6318',
          800: '#564410',
          900: '#302509',
          950: '#1A1405',
        },
        steel: {
          50: '#F8F9FA',
          100: '#F1F3F5',
          200: '#E2E6EA',
          300: '#CED4DA',
          400: '#ADB5BD',
          500: '#868E96',
          600: '#6C757D',
          700: '#495057',
          800: '#343A40',
          900: '#212529',
          950: '#0D0F11',
        },
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
