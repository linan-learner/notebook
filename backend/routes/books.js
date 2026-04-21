const express = require('express')
const { body } = require('express-validator')
const { run, get, all } = require('../db')
const { rowToBook } = require('../mappers')
const { sendValidationErrors, authMiddleware } = require('../middleware/http')
const { loadParticipantsByBookIds, ensureDefaultBook } = require('../domain/books')
const { areAcceptedFriends } = require('../domain/access')
const { notifyBooksUpdated } = require('../collab')

const router = express.Router()

/**
 * 账本路由（/api/books）
 *
 * 负责：
 * - 账本 CRUD；
 * - 协作成员列表维护；
 * - 成员退出协作；
 * - 删除账本时的完整清理（流水 + 协作关系联动）；
 * - 关键变更后通过 WebSocket 通知相关用户刷新账本列表。
 *
 * 设计取舍：
 * - “协作成员保存”采用覆盖式 PUT（传最终 userIds），前端更容易保证与界面勾选状态一致；
 * - 删除账本时使用事务，确保“删流水 + 删账本”一致提交，避免半成功状态。
 */

const bookCreateValidators = [
  body('name').trim().isLength({ min: 1, max: 64 }).withMessage('账本名称 1～64 字'),
  body('remark').optional().isString().isLength({ max: 200 }),
  body('sortOrder').optional().isInt({ min: 0 }),
  body('collabEnabled').optional().isBoolean().withMessage('多人协作须为布尔值'),
  body('ownerColumn').optional().isIn(['solo', 'collab']).withMessage('ownerColumn 须为 solo 或 collab')
]

const bookUpdateValidators = [
  body('name').optional().trim().isLength({ min: 1, max: 64 }),
  body('remark').optional().isString().isLength({ max: 200 }),
  body('sortOrder').optional().isInt({ min: 0 }),
  body('collabEnabled').optional().isBoolean().withMessage('多人协作须为布尔值')
]

const collaboratorsPutValidators = [
  body('userIds').isArray().withMessage('userIds 须为数组'),
  body('userIds.*').optional().isInt({ min: 1 })
]

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureDefaultBook(req.userId)
    const owned = await all(`SELECT * FROM books WHERE user_id = ? ORDER BY sort_order, id`, [req.userId])
    const shared = await all(
      `SELECT b.*, ou.username AS owner_username, ou.nickname AS owner_nickname
       FROM books b
       INNER JOIN book_collaborators bc ON bc.book_id = b.id AND bc.user_id = ?
       INNER JOIN users ou ON ou.id = b.user_id
       ORDER BY b.sort_order, b.id`,
      [req.userId]
    )

    const ownedIds = owned.map((r) => r.id)
    const collabMap = new Map()
    if (ownedIds.length) {
      const ph = ownedIds.map(() => '?').join(',')
      const crs = await all(
        `SELECT bc.book_id, bc.user_id, u.username, u.nickname
         FROM book_collaborators bc
         INNER JOIN users u ON u.id = bc.user_id
         WHERE bc.book_id IN (${ph})`,
        ownedIds
      )
      for (const c of crs) {
        if (!collabMap.has(c.book_id)) collabMap.set(c.book_id, [])
        collabMap.get(c.book_id).push({
          userId: c.user_id,
          username: c.username,
          nickname: c.nickname || ''
        })
      }
    }

    const allBookIds = [...new Set([...owned.map((r) => r.id), ...shared.map((r) => r.id)])]
    const participantMap = await loadParticipantsByBookIds(allBookIds)

    const books = [
      ...owned.map((row) => ({
        ...rowToBook(row),
        role: 'owner',
        collaborators: collabMap.get(row.id) || [],
        participants: participantMap.get(row.id) || []
      })),
      ...shared.map((row) => {
        const plist = participantMap.get(row.id) || []
        return {
          ...rowToBook(row),
          role: 'collaborator',
          ownerUserId: row.user_id,
          ownerUsername: row.owner_username || '',
          ownerNickname: row.owner_nickname || '',
          collaborators: plist
            .filter((p) => p.role === 'collaborator')
            .map((p) => ({
              userId: p.userId,
              username: p.username,
              nickname: p.nickname || ''
            })),
          participants: plist
        }
      })
    ]
    res.json({ books })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '读取账本失败' })
  }
})

/**
 * 创建账本（拥有者就是当前登录用户）
 * 前端可指定 ownerColumn（solo/collab）控制新建后展示在哪一列。
 */
router.post('/', authMiddleware, bookCreateValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return
  const name = String(req.body.name).trim()
  const remark = typeof req.body.remark === 'string' ? req.body.remark.slice(0, 200) : ''
  const sortOrder =
    req.body.sortOrder !== undefined && req.body.sortOrder !== null ? Number(req.body.sortOrder) : 0
  const collabIns = req.body.collabEnabled === true ? 1 : 0
  const ownerCol =
    req.body.ownerColumn === 'collab' || req.body.ownerColumn === 'solo' ? req.body.ownerColumn : 'solo'

  try {
    const r = await run(
      `INSERT INTO books (user_id, name, remark, sort_order, collab_enabled, owner_column) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, name, remark, Number.isFinite(sortOrder) ? sortOrder : 0, collabIns, ownerCol]
    )
    const row = await get(`SELECT * FROM books WHERE id = ?`, [r.lastID])
    res.status(201).json({ book: rowToBook(row) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '创建账本失败' })
  }
})

/**
 * 覆盖式保存协作成员（仅拥有者）
 *
 * 调用语义：
 * - 前端提交“最终勾选 userIds”；
 * - 后端先全删旧协作关系，再批量插入新关系；
 * - 最后通知：拥有者 + 新旧协作者，触发他们刷新账本列表。
 */
router.put('/:bookId/collaborators', authMiddleware, collaboratorsPutValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return
  const bookId = Number(req.params.bookId)
  const row = await get(`SELECT * FROM books WHERE id = ? AND user_id = ?`, [bookId, req.userId])
  if (!row) {
    return res.status(404).json({ error: '账本不存在或无权限' })
  }

  const rawIds = Array.isArray(req.body.userIds) ? req.body.userIds : []
  const want = [...new Set(rawIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n !== req.userId))]

  const prevBc = await all(`SELECT user_id FROM book_collaborators WHERE book_id = ?`, [bookId])
  const prevIds = prevBc.map((r) => r.user_id)

  for (const uid of want) {
    if (!(await areAcceptedFriends(req.userId, uid))) {
      return res.status(400).json({ error: `用户 ${uid} 不是您的好友，请先添加好友` })
    }
  }

  try {
    await run(`DELETE FROM book_collaborators WHERE book_id = ?`, [bookId])
    for (const uid of want) {
      await run(`INSERT INTO book_collaborators (book_id, user_id) VALUES (?, ?)`, [bookId, uid])
    }
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: '保存协作成员失败' })
  }

  const notifySet = new Set([req.userId, ...want, ...prevIds])
  for (const uid of notifySet) {
    notifyBooksUpdated(uid)
  }

  const crs = await all(
    `SELECT bc.user_id AS userId, u.username, u.nickname
     FROM book_collaborators bc
     INNER JOIN users u ON u.id = bc.user_id
     WHERE bc.book_id = ?`,
    [bookId]
  )
  res.json({ collaborators: crs.map((c) => ({ ...c, nickname: c.nickname || '' })) })
})

/**
 * 更新账本信息（仅拥有者）
 */
router.put('/:bookId', authMiddleware, bookUpdateValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return
  const bookId = Number(req.params.bookId)
  const row = await get(`SELECT * FROM books WHERE id = ? AND user_id = ?`, [bookId, req.userId])
  if (!row) {
    return res.status(404).json({ error: '账本不存在' })
  }

  const name = req.body.name !== undefined ? String(req.body.name).trim() : row.name
  const remark = req.body.remark !== undefined ? String(req.body.remark).slice(0, 200) : row.remark
  const sortOrder =
    req.body.sortOrder !== undefined && req.body.sortOrder !== null ? Number(req.body.sortOrder) : row.sort_order
  const nextCollab =
    req.body.collabEnabled !== undefined
      ? req.body.collabEnabled
        ? 1
        : 0
      : row.collab_enabled != null
        ? row.collab_enabled
        : 1

  try {
    await run(
      `UPDATE books SET name = ?, remark = ?, sort_order = ?, collab_enabled = ? WHERE id = ? AND user_id = ?`,
      [
        name,
        remark,
        Number.isFinite(sortOrder) ? sortOrder : row.sort_order,
        nextCollab,
        bookId,
        req.userId
      ]
    )
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: '更新失败' })
  }

  const updated = await get(`SELECT * FROM books WHERE id = ?`, [bookId])
  res.json({ book: rowToBook(updated) })
})

/**
 * 协作成员退出（不删账本，仅移除本人协作关系）
 *
 * 业务语义：相当于“从我的列表移除该协作账本”。
 */
router.delete('/:bookId/collaboration', authMiddleware, async (req, res) => {
  const bookId = Number(req.params.bookId)
  if (!bookId || Number.isNaN(bookId)) {
    return res.status(400).json({ error: '参数无效' })
  }
  const row = await get(
    `SELECT 1 AS ok FROM book_collaborators WHERE book_id = ? AND user_id = ?`,
    [bookId, req.userId]
  )
  if (!row) {
    return res.status(404).json({ error: '您不是该账本的协作成员' })
  }
  const bookRow = await get(`SELECT user_id FROM books WHERE id = ?`, [bookId])
  try {
    const result = await run(`DELETE FROM book_collaborators WHERE book_id = ? AND user_id = ?`, [
      bookId,
      req.userId
    ])
    if (!result.changes) {
      return res.status(404).json({ error: '记录不存在' })
    }
    notifyBooksUpdated(req.userId)
    if (bookRow && bookRow.user_id != null) {
      notifyBooksUpdated(bookRow.user_id)
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '退出协作失败' })
  }
})

/**
 * 删除账本（仅拥有者）
 *
 * 关键规则：
 * - 若用户只剩最后一本本人账本，且没有任何协作身份账本，则不允许删除；
 * - 删除时开启事务：先删该账本流水，再删账本本体；
 * - 成功后通知拥有者与所有协作者刷新列表。
 */
router.delete('/:bookId', authMiddleware, async (req, res) => {
  const bookId = Number(req.params.bookId)
  const row = await get(`SELECT * FROM books WHERE id = ? AND user_id = ?`, [bookId, req.userId])
  if (!row) {
    return res.status(404).json({ error: '账本不存在' })
  }

  const cnt = await get(`SELECT COUNT(*) as c FROM books WHERE user_id = ?`, [req.userId])
  if (cnt && Number(cnt.c) <= 1) {
    const asMember = await get(`SELECT COUNT(*) as c FROM book_collaborators WHERE user_id = ?`, [req.userId])
    if (!asMember || Number(asMember.c) < 1) {
      return res.status(400).json({ error: '至少保留一个账本' })
    }
  }

  const collabNotify = await all(`SELECT user_id FROM book_collaborators WHERE book_id = ?`, [bookId])

  try {
    await run('BEGIN IMMEDIATE')
    await run(`DELETE FROM ledger_records WHERE book_id = ?`, [bookId])
    const del = await run(`DELETE FROM books WHERE id = ? AND user_id = ?`, [bookId, req.userId])
    if (!del.changes) {
      await run('ROLLBACK')
      return res.status(404).json({ error: '账本不存在' })
    }
    await run('COMMIT')
  } catch (err) {
    await run('ROLLBACK').catch(() => {})
    console.error(err)
    return res.status(500).json({ error: '删除失败' })
  }

  const notifySet = new Set([req.userId, ...collabNotify.map((r) => r.user_id)])
  for (const uid of notifySet) {
    notifyBooksUpdated(uid)
  }
  res.json({ ok: true })
})

module.exports = router
