const express = require('express')
const { body } = require('express-validator')
const { run, get, all } = require('../db')
const { sendValidationErrors, authMiddleware } = require('../middleware/http')

const router = express.Router()

const friendRequestValidators = [body('account').trim().notEmpty().withMessage('请输入用户名或手机号')]

router.get('/', authMiddleware, async (req, res) => {
  try {
    const friends = await all(
      `SELECT u.id, u.username, u.nickname
       FROM friendships f
       INNER JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)`,
      [req.userId, req.userId, req.userId]
    )
    res.json({ friends: friends.map((u) => ({ ...u, nickname: u.nickname || '' })) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '读取好友失败' })
  }
})

router.get('/pending', authMiddleware, async (req, res) => {
  try {
    const incoming = await all(
      `SELECT f.id, f.requester_id AS requesterId, u.username, u.nickname, f.created_at AS createdAt
       FROM friendships f
       INNER JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = ? AND f.status = 'pending'
       ORDER BY f.id DESC`,
      [req.userId]
    )
    const outgoing = await all(
      `SELECT f.id, f.addressee_id AS addresseeId, u.username, u.nickname, f.created_at AS createdAt
       FROM friendships f
       INNER JOIN users u ON u.id = f.addressee_id
       WHERE f.requester_id = ? AND f.status = 'pending'
       ORDER BY f.id DESC`,
      [req.userId]
    )
    res.json({
      incoming: incoming.map((r) => ({ ...r, nickname: r.nickname || '' })),
      outgoing: outgoing.map((r) => ({ ...r, nickname: r.nickname || '' }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '读取请求失败' })
  }
})

router.post('/request', authMiddleware, friendRequestValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return
  const account = String(req.body.account).trim()
  const target = await get(`SELECT id FROM users WHERE username = ? OR phone = ?`, [account, account])
  if (!target) {
    return res.status(404).json({ error: '未找到该用户' })
  }
  const tid = target.id
  if (tid === req.userId) {
    return res.status(400).json({ error: '不能添加自己为好友' })
  }

  const existing = await get(`SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ?`, [
    req.userId,
    tid
  ])
  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: '对方已是您的好友' })
    }
    return res.status(409).json({ error: '已发送过好友请求' })
  }

  const reverse = await get(`SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ?`, [
    tid,
    req.userId
  ])
  if (reverse) {
    if (reverse.status === 'pending') {
      await run(`UPDATE friendships SET status = 'accepted' WHERE id = ?`, [reverse.id])
      return res.json({ ok: true, accepted: true, message: '已互为好友' })
    }
    if (reverse.status === 'accepted') {
      return res.status(409).json({ error: '对方已是您的好友' })
    }
  }

  try {
    const ins = await run(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')`,
      [req.userId, tid]
    )
    res.status(201).json({ ok: true, friendshipId: ins.lastID })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '发送失败' })
  }
})

router.post('/accept/:friendshipId', authMiddleware, async (req, res) => {
  const fid = Number(req.params.friendshipId)
  if (!fid || Number.isNaN(fid)) {
    return res.status(400).json({ error: '参数无效' })
  }
  const row = await get(`SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'`, [
    fid,
    req.userId
  ])
  if (!row) {
    return res.status(404).json({ error: '请求不存在' })
  }
  try {
    await run(`UPDATE friendships SET status = 'accepted' WHERE id = ?`, [fid])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '接受失败' })
  }
})

router.delete('/:peerUserId', authMiddleware, async (req, res) => {
  const peer = Number(req.params.peerUserId)
  if (!peer || Number.isNaN(peer)) {
    return res.status(400).json({ error: '参数无效' })
  }
  const result = await run(
    `DELETE FROM friendships WHERE status = 'accepted' AND (
      (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    )`,
    [req.userId, peer, peer, req.userId]
  )
  if (!result.changes) {
    return res.status(404).json({ error: '好友关系不存在' })
  }
  await run(
    `DELETE FROM book_collaborators WHERE user_id = ? AND book_id IN (SELECT id FROM books WHERE user_id = ?)`,
    [peer, req.userId]
  )
  await run(
    `DELETE FROM book_collaborators WHERE user_id = ? AND book_id IN (SELECT id FROM books WHERE user_id = ?)`,
    [req.userId, peer]
  )
  res.json({ ok: true })
})

module.exports = router
