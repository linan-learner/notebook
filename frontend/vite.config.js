import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/**
 * GitHub Pages 部署时，站点在子路径：`https://用户名.github.io/仓库名/`
 * 必须把 `base` 设成 `/仓库名/`（前后都要有斜杠），否则 JS/CSS 资源路径会 404。
 * 本地 `vite dev` 仍用 `/`，只有 `vite build` 使用下面这个前缀。
 */
const GITHUB_PAGES_BASE = '/notebook/'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? GITHUB_PAGES_BASE : '/',
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
}))