import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths, so the build works both on GitHub Pages (/shift-swaps/) and on a root domain.
  base: './',
  plugins: [react()],
});
