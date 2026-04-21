/**
 * =============================================================================
 * 流水（Ledger）数据层 — 架构说明
 * =============================================================================
 *
 * 【这一层做什么】
 * - 在浏览器里用 localStorage 缓存「流水记录」列表（离线/未登录时也可用本地逻辑）。
 * - 用户已登录时，与后端 `/api/ledger` 对齐：拉取全量写入缓存，增删改走接口后再更新缓存。
 * - 与「账本」的关系：每条记录可带 `bookId`；当前正在看的账本来自 `bookStore`（见 getCurrentBookId）。
 *
 * 【数据流（简化）】
 *   登录成功 → syncNotebookFromServer()
 *     → 先 pullBooksFromServer()   // 必须先有账本列表，迁云时才能校验 bookId
 *     → 再 pullUserProfile()（可选）
 *     → 最后 pullLedgerFromServer() // 拉流水 + 必要时「本地迁云」
 *
 * 【读路径】
 *   各页面调用 getRecords(bookIdOverride)，从缓存里按账本过滤后展示。
 *   过滤规则：未登录返回全部本地数据；已登录时只显示当前账本（或 URL 指定的 bookId）。
 *
 * 【写路径】
 *   addRecord / updateRecord / deleteRecord：已登录则调 API，成功后更新 localStorage 并
 *   dispatch `ledger:updated`，侧边栏、首页等可订阅刷新。
 *
 * 【迁云（migrate）何时触发】
 *   当服务端返回的流水为空、但本地 localStorage 里还有旧数据时，认为用户是「老数据首次同步」，
 *   逐条 POST 到服务器。此时必须用 getBooksFromCache() 校验 bookId：若本地记录仍指向已删除的
 *   账本，不能直接 POST，否则会 404「账本不存在」——因此有 resolveBookIdForLocalRecord。
 *
 * 【依赖注意】
 *   本模块 re-export 了 getCurrentBookId / setCurrentBookId，方便其它 util 少写一层 import；
 *   实际状态仍在 Pinia 的 bookStore 中。
 * =============================================================================
 */

import { getToken } from '@/utils/authStorage'
import * as ledgerApi from '@/api/ledger'
import { getBooksFromCache, getCurrentBookId, pullBooksFromServer, setCurrentBookId } from '@/utils/bookStore'
import { pullUserProfile, getStoredPreferences } from '@/utils/userPrefs'

// ---------------------------------------------------------------------------
// 常量：本地缓存键、与 UI 联动的事件名
// ---------------------------------------------------------------------------

const RECORD_KEY = 'notebook_records_v1'
const LEDGER_UPDATED_EVENT = 'ledger:updated'

export const RECORD_TYPES = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' }
]

export const CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '学习', '其他'],
  income: ['工资', '兼职', '投资', '红包', '退款', '其他']
}

const DEFAULT_ACCOUNTS = ['现金', '银行卡', '微信', '支付宝', '信用卡', '其他']

export function getAccountOptions() {
  const p = getStoredPreferences()
  const acc = p.accounts
  if (Array.isArray(acc) && acc.length) return acc.map(String)
  return DEFAULT_ACCOUNTS
}

export function getCategoryOptions(type) {
  const p = getStoredPreferences()
  const c = p.categories && p.categories[type]
  if (Array.isArray(c) && c.length) return c.map(String)
  return CATEGORIES[type] || []
}

/** 供非组件代码使用，与 bookStore 保持同步 */
export { getCurrentBookId, setCurrentBookId }

// ---------------------------------------------------------------------------
// 本地缓存：读写 localStorage + 通知订阅者
// ---------------------------------------------------------------------------

function readRaw() {
  const raw = localStorage.getItem(RECORD_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRaw(records) {
  localStorage.setItem(RECORD_KEY, JSON.stringify(records))
  window.dispatchEvent(new CustomEvent(LEDGER_UPDATED_EVENT))
}

// ---------------------------------------------------------------------------
// 迁云辅助：bookId 解析与 payload 构造（与 pullLedgerFromServer 解耦，便于单测与阅读）
// ---------------------------------------------------------------------------

/**
 * 当前用户仍拥有的账本 id 集合（来自 Pinia 缓存，调用前应先 pullBooksFromServer）。
 * @returns {Set<number>}
 */
function buildValidBookIdSet() {
  const books = getBooksFromCache()
  return new Set(books.map((b) => Number(b.id)).filter((id) => Number.isFinite(id)))
}

/**
 * 迁云时若记录没有合法 bookId，把流水挂到哪本账上：
 * - 优先「当前选中」且该 id 仍在服务端账本列表中；
 * - 否则退化为任意一本（集合中第一个），保证至少能上传；
 * - 若用户已无任何账本，返回 null，对应记录跳过。
 *
 * @param {Set<number>} validIds
 * @param {number | null | undefined} currentBookId getCurrentBookId()
 */
function pickFallbackBookIdForMigration(validIds, currentBookId) {
  if (currentBookId != null && validIds.has(Number(currentBookId))) {
    return Number(currentBookId)
  }
  if (validIds.size > 0) {
    return [...validIds][0]
  }
  return null
}

/**
 * 为一条「仅存在本地」的记录决定上传时使用的 bookId。
 * - 记录上的 bookId 仍指向某本存在的账本 → 沿用；
 * - 指向已删除账本 / 无效 → 用 fallback（避免 POST 报「账本不存在」）。
 *
 * @param {object} r 本地流水对象
 * @param {Set<number>} validIds
 * @param {number | null} fallbackBid
 * @returns {number | null}
 */
function resolveBookIdForLocalRecord(r, validIds, fallbackBid) {
  if (r.bookId != null && r.bookId !== '') {
    const n = Number(r.bookId)
    if (Number.isFinite(n) && validIds.has(n)) return n
  }
  return fallbackBid
}

/**
 * 与后端 POST /api/ledger 创建接口字段对齐（迁云批量上传用）。
 * @param {object} r 本地单条记录
 * @param {number} bookId 已解析后的合法账本 id
 */
function buildMigrateCreatePayload(r, bookId) {
  return {
    type: r.type,
    category: r.category,
    amount: r.amount,
    note: r.note || '',
    account: r.account || '',
    member: r.member || '我',
    merchant: r.merchant || '',
    project: r.project || '',
    occurredAt: r.occurredAt || r.createdAt,
    id: r.id,
    createdAt: r.createdAt,
    bookId
  }
}

/**
 * 服务端尚无流水、本地有缓存：批量上传本地记录，再拉一次全量覆盖本地。
 * @param {Array} localRecords readRaw()
 * @returns {Promise<Array>} 与服务端 fetchLedger({ all: true }) 一致
 */
async function migrateLocalRecordsToServer(localRecords) {
  const validIds = buildValidBookIdSet()
  const fallbackBid = pickFallbackBookIdForMigration(validIds, getCurrentBookId())

  for (const r of localRecords) {
    const bookId = resolveBookIdForLocalRecord(r, validIds, fallbackBid)
    if (bookId == null) continue
    const payload = buildMigrateCreatePayload(r, bookId)
    await ledgerApi.createLedgerRecord(payload)
  }

  return ledgerApi.fetchLedger({ all: true })
}

// ---------------------------------------------------------------------------
// 对外：同步入口与拉取流水
// ---------------------------------------------------------------------------

/**
 * 登录后推荐入口：按正确顺序拉账本 →（可选）用户偏好 → 流水。
 * @param {{ skipProfile?: boolean }} options skipProfile 为 true 时跳过用户偏好（如登录页加速）
 */
export async function syncNotebookFromServer(options = {}) {
  if (!getToken()) return
  await pullBooksFromServer()
  if (!options.skipProfile) {
    await pullUserProfile()
  }
  await pullLedgerFromServer()
}

/**
 * 从服务端拉取当前用户可见的全部流水（all=1），写入本地缓存。
 * 特殊：若远端为空而本地有数据，则走 migrateLocalRecordsToServer（老数据迁云）。
 */
export async function pullLedgerFromServer() {
  if (!getToken()) return
  try {
    const local = readRaw()
    let remote = await ledgerApi.fetchLedger({ all: true })

    const shouldMigrate = remote.length === 0 && local.length > 0
    if (shouldMigrate) {
      remote = await migrateLocalRecordsToServer(local)
    }

    writeRaw(remote)
  } catch (e) {
    console.error(e)
    throw e
  }
}

// ---------------------------------------------------------------------------
// 读：按账本过滤（视图层主要用这个）
// ---------------------------------------------------------------------------

/**
 * 读取缓存中的流水，按时间倒序；已登录时按账本过滤。
 *
 * @param {number | null | undefined} [bookIdOverride] 传入有限数字时与路由 `?bookId=` 一致，优先于 store 当前账本
 */
export function getRecords(bookIdOverride) {
  const list = readRaw().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  if (!getToken()) return list
  const bid =
    bookIdOverride !== undefined && bookIdOverride !== null && Number.isFinite(Number(bookIdOverride))
      ? Number(bookIdOverride)
      : getCurrentBookId()
  if (bid == null || Number.isNaN(bid)) return list
  return list.filter((r) => r.bookId == null || Number(r.bookId) === bid)
}

// ---------------------------------------------------------------------------
// 写：单条增删改（登录走 API，未登录仅本地）
// ---------------------------------------------------------------------------

export async function addRecord(record) {
  if (getToken()) {
    const bookId = record.bookId != null ? record.bookId : getCurrentBookId()
    const created = await ledgerApi.createLedgerRecord({ ...record, bookId })
    const records = readRaw()
    records.push(created)
    writeRaw(records)
    return created
  }
  const next = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...record
  }
  const records = readRaw()
  records.push(next)
  writeRaw(records)
  return next
}

export function getRecordById(id) {
  return readRaw().find((item) => item.id === id) || null
}

export async function updateRecord(id, patch) {
  if (getToken()) {
    const updated = await ledgerApi.updateLedgerRecord(id, patch)
    const records = readRaw()
    const index = records.findIndex((item) => item.id === id)
    if (index < 0) return null
    records[index] = updated
    writeRaw(records)
    return updated
  }
  const records = readRaw()
  const index = records.findIndex((item) => item.id === id)
  if (index < 0) return null
  records[index] = { ...records[index], ...patch }
  writeRaw(records)
  return records[index]
}

export async function deleteRecord(id) {
  if (getToken()) {
    await ledgerApi.removeLedgerRecord(id)
    const records = readRaw().filter((item) => item.id !== id)
    writeRaw(records)
    return true
  }
  const records = readRaw()
  const next = records.filter((item) => item.id !== id)
  if (next.length === records.length) return false
  writeRaw(next)
  return true
}

export async function deleteRecords(ids) {
  if (getToken()) {
    const deleted = await ledgerApi.removeLedgerRecords(ids)
    const set = new Set(ids)
    const records = readRaw().filter((item) => !set.has(item.id))
    writeRaw(records)
    return deleted
  }
  const set = new Set(ids)
  const records = readRaw()
  const next = records.filter((item) => !set.has(item.id))
  const deleted = records.length - next.length
  if (deleted > 0) writeRaw(next)
  return deleted
}

// ---------------------------------------------------------------------------
// 统计与展示
// ---------------------------------------------------------------------------

function recordCalendarDate(item) {
  const raw = item.occurredAt || item.createdAt
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getSummary(records = getRecords()) {
  const now = new Date()
  const y = now.getFullYear()
  const mo = now.getMonth()
  const monthRecords = records.filter((item) => {
    const d = recordCalendarDate(item)
    if (!d) return false
    return d.getFullYear() === y && d.getMonth() === mo
  })

  const income = monthRecords
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const expense = monthRecords
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + Number(item.amount), 0)

  return {
    monthIncome: income,
    monthExpense: expense,
    balance: income - expense
  }
}

export function formatCurrency(value) {
  return Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// ---------------------------------------------------------------------------
// 订阅：同标签页 CustomEvent + 跨标签 storage 事件
// ---------------------------------------------------------------------------

export function onLedgerUpdated(handler) {
  window.addEventListener(LEDGER_UPDATED_EVENT, handler)
  window.addEventListener('storage', handler)
}

export function offLedgerUpdated(handler) {
  window.removeEventListener(LEDGER_UPDATED_EVENT, handler)
  window.removeEventListener('storage', handler)
}
