import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/**
 * 生产构建时静态资源前缀（base）：
 * - GitHub Pages：`https://用户.github.io/仓库名/` → 填 `/notebook/`（与仓库名一致）
 * - Vercel / 自有域名根路径：`https://xxx.vercel.app/` → 构建前设置环境变量 `VITE_BASE=/`
 *
 * 未设置 `VITE_BASE` 时，默认仍用 `/notebook/`，方便直接打 GitHub Pages 包。
 */
const DEFAULT_PROD_BASE = '/notebook/'

function normalizeBase(raw) {
  let s = String(raw).trim()
  if (!s || s === '/') return '/'
  if (!s.startsWith('/')) s = `/${s}`
  if (!s.endsWith('/')) s = `${s}/`
  return s
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const fileEnv = loadEnv(mode, path.resolve(__dirname, '.'), '')
  const raw = fileEnv.VITE_BASE ?? process.env.VITE_BASE
  const prodBase =
    raw != null && String(raw).trim() !== '' ? normalizeBase(raw) : DEFAULT_PROD_BASE

  return {
    base: command === 'build' ? prodBase : '/',
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
  }
})