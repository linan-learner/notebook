import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '@/views/login.vue'
import Register from '@/views/register.vue'
import Books from '@/views/Books.vue'
import BookHome from '@/views/BookHome.vue'
import Ledger from '@/views/Ledger.vue'
import Report from '@/views/Report.vue'
import Record from '@/views/Record.vue'
import Friends from '@/views/Friends.vue'
import BookCollaborate from '@/views/BookCollaborate.vue'
import { getToken } from '@/utils/authStorage'
import { useBookStore } from '@/stores/book'
import { APP_NAME } from '@/constants/brand'

/**
 * 前端路由总入口
 *
 * 这个文件主要解决 3 个问题：
 * 1) 页面路径 -> 组件映射（routes）；
 * 2) 路由守卫（beforeEach）：登录校验 + bookId 与 store 的同步；
 * 3) 页面标题（afterEach）：`功能名 · 多多记账`。
 */
/**
 * 使用 Hash 模式（#/path），便于部署到 GitHub Pages 等静态托管：
 * 刷新任意子路径不会向服务器请求不存在的物理文件，避免 404。
 * 若以后用自有服务器并配置好 fallback，可改回 createWebHistory。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'root',
      redirect: () => (getToken() ? '/books' : '/login')
    },
    { path: '/login', name: 'login', component: Login, meta: { title: '登录' } },
    { path: '/register', name: 'register', component: Register, meta: { title: '注册' } },
    { path: '/books', name: 'books', component: Books, meta: { title: '我的账本' } },
    { path: '/friends', name: 'friends', component: Friends, meta: { title: '好友' } },
    {
      path: '/book/collaborate',
      name: 'book-collaborate',
      component: BookCollaborate,
      meta: { title: '协作成员' }
    },
    { path: '/book', redirect: '/book/home' },
    { path: '/book/home', name: 'book-home', component: BookHome, meta: { title: '概览' } },
    { path: '/book/ledger', name: 'ledger', component: Ledger, meta: { title: '流水' } },
    { path: '/book/report', name: 'report', component: Report, meta: { title: '报表' } },
    { path: '/record', name: 'record', component: Record, meta: { title: '记一笔' } }
  ]
})

/**
 * 全局前置守卫
 *
 * A. 访问受保护页面时，未登录重定向到 /login
 * B. 如果 URL 里显式带了 ?bookId=xxx，则同步到 store.currentBookId
 * C. 如果进入 /book/* 或 /record 但 URL 没带 bookId，尝试从 store 补上，
 *    这样刷新页面后仍能定位到当前账本（避免“地址栏没 bookId 导致展示错账本”）。
 */
router.beforeEach((to) => {
  if (
    to.path.startsWith('/book') ||
    to.path === '/record' ||
    to.path === '/books' ||
    to.path === '/friends'
  ) {
    if (!getToken()) {
      return '/login'
    }
  }
  const raw = to.query.bookId
  if (raw != null && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) {
      useBookStore().setCurrentBookId(n)
    }
  } else if (to.path.startsWith('/book/') || to.path === '/record') {
    const bid = useBookStore().currentBookId
    if (bid != null) {
      return { path: to.path, query: { ...to.query, bookId: String(bid) }, replace: true }
    }
  }
  return true
})

/**
 * 全局后置守卫：统一浏览器标签标题
 *
 * 规则：
 * - 若路由定义了 `meta.title`：`<title> · 多多记账`
 * - 否则只显示品牌名。
 */
router.afterEach((to) => {
  const t = to.meta && typeof to.meta.title === 'string' ? to.meta.title.trim() : ''
  document.title = t ? `${t} · ${APP_NAME}` : APP_NAME
})

export default router
