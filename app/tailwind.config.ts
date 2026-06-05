import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Original Framer palette
        bg: '#070E13',
        surface: '#0A0A0A',
        'surface-2': '#111111',
        'surface-3': '#1A1A1A',
        border: '#262626',
        'border-light': '#3A3A3A',
        gold: '#F24F09',
        'gold-deep': '#BF3612',
        'gold-light': '#FF6A24',
        primary: '#F24F09',
        secondary: '#BF3612',
        deep: '#731C13',
        text: '#FFFFFF',
        'text-muted': '#B8B8B8',
        'text-dim': '#6D6D6D',
      },
      fontFamily: {
        hero: ['var(--font-athiti)', 'sans-serif'],
        display: ['var(--font-oswald)', 'sans-serif'],
        sub: ['var(--font-cinzel)', 'serif'],
        control: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        caption: ['"Projekt Blackbird"', '"Projekt Blackbird Placeholder"', 'sans-serif'],
        brand: ['"Projekt Blackbird"', '"Projekt Blackbird Placeholder"', 'sans-serif'],
        accent: ['var(--font-offside)', 'sans-serif'],
        method: ['var(--font-overpass)', 'sans-serif'],
        section: ['var(--font-oswald)', 'var(--font-anton)', 'sans-serif'],
        price: ['var(--font-karma)', 'serif'],
        headline: ['var(--font-oswald)', 'sans-serif'],
        copy: ['var(--font-dm-sans)', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      backdropBlur: {
        glass: '16px',
        'glass-md': '24px',
      },
      boxShadow: {
        glass: '0 0 0 1px rgba(242, 79, 9, 0.08), 0 4px 24px rgba(0, 0, 0, 0.3)',
        'glass-lg': '0 0 0 1px rgba(242, 79, 9, 0.1), 0 8px 40px rgba(0, 0, 0, 0.4)',
        'gold-glow': '0 0 24px rgba(242, 79, 9, 0.22)',
      },
    },
  },
  plugins: [],
};

export default config;
