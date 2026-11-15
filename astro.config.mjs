import { defineConfig } from 'astro/config';

// 部署到 fubug/ValueScope 的 GitHub Pages
export default defineConfig({
  site: 'https://fubug.github.io',
  base: '/ValueScope',
  output: 'static',
  build: {
    assets: 'assets',
  },
});
