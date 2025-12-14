import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#0f172a',
        accent: '#22d3ee',
        panel: '#111827',
        grid: '#1f2937'
      },
      boxShadow: {
        glow: '0 10px 50px rgba(34, 211, 238, 0.3)'
      }
    }
  },
  plugins: []
};

export default config;
