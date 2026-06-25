import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// 获取构建平台
const platform = process.env.BUILD_PLATFORM || 'default';

// 平台特定的输出目录
const outDir = platform === 'default' ? 'dist' : `dist/${platform}`;

function copyLocalesPlugin() {
  return {
    name: 'copy-locales',
    closeBundle() {
      const outputDir = resolve(__dirname, outDir);
      const localesDir = resolve(outputDir, 'lib', 'locales');
      if (!existsSync(localesDir)) mkdirSync(localesDir, { recursive: true });
      for (const file of ['zh.json', 'en.json']) {
        const src = resolve(__dirname, 'lib', 'locales', file);
        const dest = resolve(localesDir, file);
        if (existsSync(src)) copyFileSync(src, dest);
      }
    },
  };
}

export default defineConfig({
  base: '',
  plugins: [
    preact(),
    crx({ manifest }),
    copyLocalesPlugin(),
  ],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        offscreen: 'src/offscreen/offscreen.html',
        sidepanel: 'src/sidepanel/index.html',
        popup: 'src/popup/index.html',
      },
    },
  },
});
