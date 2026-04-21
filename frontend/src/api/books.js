/**
 * 账本 API（Books）
 *
 * 这一层封装与账本相关的所有 HTTP 请求：
 * - 查询账本列表
 * - 创建/更新/删除账本
 * - 协作成员管理（设置协作者、成员退出协作）
 *
 * 调用方主要是：
 * - `utils/bookStore.js`
 * - `views/Books.vue`
 * - `views/BookCollaborate.vue`
 */
import { getToken } from '@/utils/authStorage'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * 统一请求头：
 * - 默认 JSON；
 * - 已登录时带 Bearer token 给后端鉴权中间件使用。
 */
function headers() {
  const h = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

/**
 * 将后端错误响应规范化为可读文本。
 * 后端约定错误字段为 `{ error: string }`，若解析失败则兜底“请求失败”。
 */
async function parseError(res) {
  let msg = '请求失败'
  try {
    const j = await res.json()
    if (j && j.error) msg = j.error
  } catch {
    /* ignore */
  }
  return msg
}

export async function fetchBooks() {
  const res = await fetch(`${API_BASE}/api/books`, { headers: headers() })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return Array.isArray(data.books) ? data.books : []
}

/**
 * 创建账本
 *
 * @param {{
 *  name: string,
 *  remark?: string,
 *  sortOrder?: number,
 *  collabEnabled?: boolean,
 *  ownerColumn?: 'solo' | 'collab'
 * }} payload
 */
export async function createBook(payload) {
  const res = await fetch(`${API_BASE}/api/books`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.book
}

/**
 * 更新账本基础信息（名称/备注/排序/协作开关等）
 * @param {number|string} id
 * @param {object} payload
 */
export async function updateBook(id, payload) {
  const res = await fetch(`${API_BASE}/api/books/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.book
}

/**
 * 删除账本（拥有者）
 *
 * 注意：后端会联动删除该账本下流水，并广播账本更新事件给相关协作者。
 */
export async function removeBook(id) {
  const res = await fetch(`${API_BASE}/api/books/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers()
  })
  if (!res.ok) throw new Error(await parseError(res))
}

/**
 * 协作成员退出该账本（不删除账本）
 *
 * 与 removeBook 的差异：
 * - 仅删除当前用户与该账本的协作关系；
 * - 不会删除账本本体与流水数据。
 */
export async function leaveBookCollaboration(bookId) {
  const res = await fetch(
    `${API_BASE}/api/books/${encodeURIComponent(bookId)}/collaboration`,
    {
      method: 'DELETE',
      headers: headers()
    }
  )
  if (!res.ok) throw new Error(await parseError(res))
}

/**
 * 覆盖式保存协作成员列表（仅拥有者）
 *
 * @param {number} bookId
 * @param {number[]} userIds 最终应保留的协作用户 ID 列表
 * @returns {Promise<Array<{userId:number, username:string, nickname:string}>>}
 */
export async function putBookCollaborators(bookId, userIds) {
  const res = await fetch(`${API_BASE}/api/books/${encodeURIComponent(bookId)}/collaborators`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ userIds })
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return Array.isArray(data.collaborators) ? data.collaborators : []
}
