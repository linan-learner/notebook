import { defineStore } from 'pinia'
import { getToken } from '@/utils/authStorage'
import * as booksApi from '@/api/books'

/**
 * Book Store（Pinia）
 *
 * 职责：
 * - 保存当前用户“可见账本列表”；
 * - 保存当前选中账本 id（currentBookId）；
 * - 在刷新列表后自动纠正 currentBookId，避免指向已失效账本。
 *
 * 关键设计：
 * - `pinnedBookId` 用于记住“用户显式选择”的账本，拉新列表后优先保留；
 *   这样可避免自动切到第一本，导致协作账本页面显示错乱。
 */
const BOOKS_CACHE_KEY = 'notebook_books_v1'
const CURRENT_BOOK_KEY = 'notebook_current_book_id'

function readBooksFromStorage() {
  try {
    const raw = localStorage.getItem(BOOKS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readCurrentBookIdFromStorage() {
  const v = localStorage.getItem(CURRENT_BOOK_KEY)
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const useBookStore = defineStore('book', {
  state: () => ({
    books: readBooksFromStorage(),
    currentBookId: readCurrentBookIdFromStorage(),
    /**
     * 用户显式选中的账本（例如从 URL / 卡片点击）。
     * 拉取账本列表后优先保留该 id，避免被“自动选第一本”覆盖，导致协作账本流水为空。
     */
    pinnedBookId: readCurrentBookIdFromStorage()
  }),
  actions: {
    /** 将账本列表持久化到 localStorage，供刷新后恢复。 */
    persistBooksToStorage() {
      localStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify(this.books))
    },
    /** 持久化当前账本 id；为空时清理存储。 */
    persistCurrentBookIdToStorage() {
      if (this.currentBookId == null || this.currentBookId === '') {
        localStorage.removeItem(CURRENT_BOOK_KEY)
        return
      }
      localStorage.setItem(CURRENT_BOOK_KEY, String(this.currentBookId))
    },
    /**
     * 设置当前账本（入口方法）
     * 所有页面/路由都应尽量走这里，以确保 pinnedBookId 与持久化同步更新。
     */
    setCurrentBookId(id) {
      if (id == null || id === '') {
        this.currentBookId = null
        this.pinnedBookId = null
      } else {
        const n = Number(id)
        this.currentBookId = Number.isFinite(n) ? n : null
        this.pinnedBookId = this.currentBookId
      }
      this.persistCurrentBookIdToStorage()
    },
    /**
     * 当账本列表变化后，修复 currentBookId：
     * 1) 当前 id 仍存在 -> 保持不变；
     * 2) 否则尝试 pinnedBookId；
     * 3) 都不可用则回退到第一本；
     * 4) 完全无账本则置空。
     */
    pickCurrentBookIfNeeded() {
      if (!this.books.length) {
        this.setCurrentBookId(null)
        return
      }
      const cur = this.currentBookId
      if (cur != null && this.books.some((b) => Number(b.id) === Number(cur))) return
      const pin = this.pinnedBookId
      if (pin != null && this.books.some((b) => Number(b.id) === Number(pin))) {
        this.setCurrentBookId(pin)
        return
      }
      this.setCurrentBookId(this.books[0].id)
    },
    /**
     * 拉取账本列表（登录态）
     *
     * 调用方：
     * - 登录后初始化同步
     * - 账本页定时/可见性刷新
     * - 协作推送后对齐
     */
    async pullBooksFromServer() {
      if (!getToken()) return
      const books = await booksApi.fetchBooks()
      this.books = books
      this.persistBooksToStorage()
      this.pickCurrentBookIfNeeded()
    }
  }
})
