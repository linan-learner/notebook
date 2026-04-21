/**
 * 账本（Books）访问的兼容层 — 与 Pinia 的关系
 *
 * 【为什么要有这一层】
 * - 业务状态（账本列表、当前选中账本 id）实际存放在 `stores/book.js`（Pinia）。
 * - 部分工具模块（如 ledgerStore、路由守卫）不能或不方便直接 `useBookStore()`，
 *   因此在这里提供函数式 API，内部仍委托给同一 store，保证全局只有一份数据。
 *
 * 【调用约定】
 * - 拉取列表：pullBooksFromServer()，会更新 books 并持久化到 localStorage，必要时自动纠正 currentBookId。
 * - 读缓存：getBooksFromCache() / getCurrentBookId()（同步，来自内存中的 store）。
 *
 * 流水侧若要根据「当前仍存在的账本」校验 bookId，须先 await pullBooksFromServer() 再读 getBooksFromCache()。
 */
import { useBookStore } from '@/stores/book'

export function getBooksFromCache() {
  return useBookStore().books
}

export function getCurrentBookId() {
  return useBookStore().currentBookId
}

export function setCurrentBookId(id) {
  useBookStore().setCurrentBookId(id)
}

export async function pullBooksFromServer() {
  return useBookStore().pullBooksFromServer()
}
