import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--shadcn-border))',
        input: 'hsl(var(--shadcn-input))',
        ring: 'hsl(var(--shadcn-ring))',
        background: 'hsl(var(--shadcn-background))',
        foreground: 'hsl(var(--shadcn-foreground))',
        primary: {
          DEFAULT: 'hsl(var(--shadcn-primary))',
          foreground: 'hsl(var(--shadcn-primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--shadcn-secondary))',
          foreground: 'hsl(var(--shadcn-secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--shadcn-destructive))',
          foreground: 'hsl(var(--shadcn-destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--shadcn-muted))',
          foreground: 'hsl(var(--shadcn-muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--shadcn-accent))',
          foreground: 'hsl(var(--shadcn-accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--shadcn-popover))',
          foreground: 'hsl(var(--shadcn-popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--shadcn-card))',
          foreground: 'hsl(var(--shadcn-card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate],
}
