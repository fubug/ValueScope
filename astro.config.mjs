import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  base: '/ValueScope',
  integrations: [react()],
  build: {
    assets: '_assets',
  },
});
