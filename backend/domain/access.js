const { get } = require('../db')

/**
 * 访问控制领域函数（Domain: access）
 *
 * 为什么单独放 domain：
 * - 路由层会多次复用“某用户是否有某账本访问权”；
 * - 把规则集中在这里，避免每个路由都手写 SQL 判断，减少不一致风险。
 */

/**
 * 判定用户对某账本的访问权限（拥有者 / 协作者）。
 *
 * 调用方：
 * - `routes/books.js`
 * - `routes/ledger.js`
 *
 * @param {number|string} bookId
 * @param {number} userId
 * @returns {Promise<null | { book: any, role: 'owner' | 'collaborator' }>}
 */
async function getBookAccess(bookId, userId) {
  const bid = Number(bookId)
  if (bookId == null || bookId === '' || Number.isNaN(bid)) return null
  const book = await get(`SELECT * FROM books WHERE id = ?`, [bid])
  if (!book) return null
  if (book.user_id === userId) return { book, role: 'owner' }
  const bc = await get(`SELECT 1 AS ok FROM book_collaborators WHERE book_id = ? AND user_id = ?`, [bid, userId])
  if (bc) return { book, role: 'collaborator' }
  return null
}

/**
 * 判定两名用户是否已互为“已接受好友”。
 *
 * 用途：
 * - 创建/更新协作成员时，要求只能邀请好友，避免随意拉陌生人进账本。
 */
async function areAcceptedFriends(a, b) {
  if (a === b) return false
  const row = await get(
    `SELECT id FROM friendships WHERE status = 'accepted' AND (
      (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    )`,
    [a, b, b, a]
  )
  return Boolean(row)
}

module.exports = { getBookAccess, areAcceptedFriends }
