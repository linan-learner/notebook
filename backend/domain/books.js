const { run, get, all } = require('../db')

/** 账本参与者：拥有者 + 所有协作成员（用于前端展示「与谁一起编辑」） */
async function loadParticipantsByBookIds(bookIds) {
  const map = new Map()
  if (!bookIds || !bookIds.length) return map
  const ids = [...new Set(bookIds)]
  const ph = ids.map(() => '?').join(',')
  const ownerRows = await all(
    `SELECT b.id AS book_id, u.id AS user_id, u.username, u.nickname
     FROM books b
     INNER JOIN users u ON u.id = b.user_id
     WHERE b.id IN (${ph})`,
    ids
  )
  const collabRows = await all(
    `SELECT bc.book_id, u.id AS user_id, u.username, u.nickname
     FROM book_collaborators bc
     INNER JOIN users u ON u.id = bc.user_id
     WHERE bc.book_id IN (${ph})`,
    ids
  )
  for (const bid of ids) {
    map.set(bid, [])
  }
  for (const r of ownerRows) {
    const list = map.get(r.book_id) || []
    list.push({
      userId: r.user_id,
      username: r.username,
      nickname: r.nickname ? r.nickname : '',
      role: 'owner'
    })
    map.set(r.book_id, list)
  }
  for (const r of collabRows) {
    const list = map.get(r.book_id) || []
    list.push({
      userId: r.user_id,
      username: r.username,
      nickname: r.nickname ? r.nickname : '',
      role: 'collaborator'
    })
    map.set(r.book_id, list)
  }
  return map
}

/**
 * 无任何本人账本时补一本默认「家庭账本」。
 * 若用户已参与他人协作账本（book_collaborators），则不自动创建，避免「删了最后一本又立刻出现一本」。
 */
async function ensureDefaultBook(userId) {
  const n = await get(`SELECT COUNT(*) as c FROM books WHERE user_id = ?`, [userId])
  if (n && Number(n.c) > 0) return
  const asCollab = await get(`SELECT COUNT(*) as c FROM book_collaborators WHERE user_id = ?`, [userId])
  if (asCollab && Number(asCollab.c) > 0) return
  await run(`INSERT INTO books (user_id, name, sort_order) VALUES (?, ?, 0)`, [userId, '家庭账本'])
}

async function getDefaultBookId(userId) {
  await ensureDefaultBook(userId)
  const b = await get(`SELECT id FROM books WHERE user_id = ? ORDER BY sort_order, id LIMIT 1`, [userId])
  return b ? b.id : null
}

module.exports = {
  loadParticipantsByBookIds,
  ensureDefaultBook,
  getDefaultBookId
}
