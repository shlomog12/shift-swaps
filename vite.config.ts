import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Where the app is published. Link previews (WhatsApp etc.) need absolute URLs, so index.html gets this
// at build time. Set VITE_APP_URL (ending with "/") to publish elsewhere.
const DEFAULT_APP_URL = 'https://shlomog12.github.io/shift-swaps/';

function appUrl(url: string): Plugin {
  return {
    name: 'app-url',
    transformIndexHtml: (html) => html.replaceAll('%APP_URL%', url),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    // Relative asset paths, so the build works both on GitHub Pages (/shift-swaps/) and on a root domain.
    base: './',
    plugins: [react(), appUrl(env.VITE_APP_URL || DEFAULT_APP_URL)],
  };
});
