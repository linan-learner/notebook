const { notifyLedgerChange } = require('../collab')
const { get, all } = require('../db')

function collabOriginSession(req) {
  return req.get('x-collab-session') || null
}

/** 通知账本拥有者及所有协作成员（含多端同步） */
async function notifyBookLedgerSubscribers(bookId, req) {
  const bid = Number(bookId)
  if (!bid || Number.isNaN(bid)) return
  const book = await get(`SELECT id, user_id FROM books WHERE id = ?`, [bid])
  if (!book) return
  const origin = collabOriginSession(req)
  const targets = new Set([book.user_id])
  const collabs = await all(`SELECT user_id FROM book_collaborators WHERE book_id = ?`, [bid])
  for (const c of collabs) targets.add(c.user_id)
  for (const uid of targets) {
    notifyLedgerChange(uid, { originSessionId: origin, bookId: bid })
  }
}

async function notifyBookLedgerSubscribersMany(bookIds, req) {
  const seen = new Set()
  for (const raw of bookIds || []) {
    const bid = raw != null && raw !== '' ? Number(raw) : null
    if (bid == null || Number.isNaN(bid) || seen.has(bid)) continue
    seen.add(bid)
    await notifyBookLedgerSubscribers(bid, req)
  }
}

module.exports = {
  collabOriginSession,
  notifyBookLedgerSubscribers,
  notifyBookLedgerSubscribersMany
}
