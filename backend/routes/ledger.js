const express = require('express')
const { body } = require('express-validator')
const { run, get, all } = require('../db')
const { rowToRecord } = require('../mappers')
const { sendValidationErrors, authMiddleware } = require('../middleware/http')
const { getDefaultBookId } = require('../domain/books')
const { getBookAccess } = require('../domain/access')
const { notifyBookLedgerSubscribers, notifyBookLedgerSubscribersMany } = require('../domain/ledgerNotify')

/**
 * 流水路由（/api/ledger）
 *
 * 负责：
 * - 查询流水（单账本或 all=1）
 * - 新增/更新/删除/批量删除
 * - 账本级权限校验（owner/collaborator 才可读写）
 * - 变更后通知协作订阅者刷新（WebSocket）
 */
const router = express.Router()

/**
 * 流水路由（/api/ledger）
 *
 * 负责：
 * - 查询流水（单账本 / all 全量）
 * - 新增、修改、删除、批量删除流水
 * - 每次变更后通知订阅该账本的客户端实时刷新
 *
 * 权限核心：
 * - 不直接用 `ledger_records.user_id` 做权限判断；
 * - 统一以“当前用户是否对目标 bookId 有访问权”为准（拥有者或协作者）。
 */

const ledgerCreateValidators = [
  body('type').isIn(['income', 'expense']).withMessage('类型须为收入或支出'),
  body('amount').isFloat({ min: 0.01 }).withMessage('金额须大于 0'),
  body('category').optional({ checkFalsy: true }).isString().isLength({ max: 64 }),
  body('note').optional().isString().isLength({ max: 200 }),
  body('account').optional().isString().isLength({ max: 64 }),
  body('member').optional().isString().isLength({ max: 64 }),
  body('merchant').optional().isString().isLength({ max: 64 }),
  body('project').optional().isString().isLength({ max: 64 }),
  body('occurredAt').optional().isISO8601().withMessage('发生时间格式无效'),
  body('createdAt').optional().isISO8601().withMessage('创建时间格式无效'),
  body('id').optional().isString().isLength({ min: 4, max: 80 }),
  body('bookId').optional().isInt({ min: 1 })
]

const ledgerUpdateValidators = [
  body('type').optional().isIn(['income', 'expense']),
  body('amount').optional().isFloat({ min: 0.01 }),
  body('category').optional({ checkFalsy: true }).isString().isLength({ max: 64 }),
  body('note').optional().isString().isLength({ max: 200 }),
  body('account').optional().isString().isLength({ max: 64 }),
  body('member').optional().isString().isLength({ max: 64 }),
  body('merchant').optional().isString().isLength({ max: 64 }),
  body('project').optional().isString().isLength({ max: 64 }),
  body('occurredAt').optional().isISO8601(),
  body('bookId').optional().isInt({ min: 1 })
]

/**
 * 查询流水
 *
 * 支持两种模式：
 * 1) 默认模式（all!=1）：只返回一个账本的数据（query.bookId 或默认账本）；
 * 2) all=1：返回当前用户有权限访问的所有账本流水，用于前端本地缓存整体同步。
 */
/**
 * GET /api/ledger
 *
 * 查询模式：
 * - 默认：返回“当前账本”流水（可用 query.bookId 覆盖）；
 * - all=1：返回用户可见的全部账本流水（本人 + 协作）。
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const allFlag = req.query.all === '1' || req.query.all === 'true'
    const bookIdQ = req.query.bookId != null && req.query.bookId !== '' ? Number(req.query.bookId) : null

    if (!allFlag) {
      let bid = bookIdQ
      if (!bid || Number.isNaN(bid)) {
        bid = await getDefaultBookId(req.userId)
      }
      if (!bid) {
        return res.json({ records: [] })
      }
      const access = await getBookAccess(bid, req.userId)
      if (!access) {
        return res.status(404).json({ error: '账本不存在' })
      }
      const rows = await all(
        `SELECT * FROM ledger_records WHERE book_id = ? ORDER BY datetime(created_at) DESC`,
        [bid]
      )
      res.set('Cache-Control', 'no-store')
      return res.json({ records: rows.map(rowToRecord) })
    }

    const owned = await all(`SELECT id FROM books WHERE user_id = ?`, [req.userId])
    const collab = await all(
      `SELECT b.id FROM books b INNER JOIN book_collaborators bc ON bc.book_id = b.id AND bc.user_id = ?`,
      [req.userId]
    )
    const ids = [...new Set([...owned.map((b) => b.id), ...collab.map((b) => b.id)])]
    if (!ids.length) {
      return res.json({ records: [] })
    }
    const ph = ids.map(() => '?').join(',')
    const rows = await all(
      `SELECT * FROM ledger_records WHERE book_id IN (${ph}) ORDER BY datetime(created_at) DESC`,
      ids
    )
    res.set('Cache-Control', 'no-store')
    res.json({ records: rows.map(rowToRecord) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '读取流水失败' })
  }
})

/**
 * 新增流水
 *
 * bookId 解析规则：
 * - 请求体显式传了 bookId：校验该账本访问权限；
 * - 未传：回退到当前用户默认账本。
 *
 * 成功后广播该账本 ledger_updated，协作者页面可实时刷新。
 */
/**
 * POST /api/ledger
 * 新增一条流水记录。
 *
 * bookId 解析规则：
 * - 请求显式传 bookId：先校验访问权限；
 * - 未传：自动落到用户默认账本（getDefaultBookId）。
 */
router.post('/', authMiddleware, ledgerCreateValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return

  const {
    type,
    amount,
    category = '',
    note = '',
    account = '',
    member = '我',
    merchant = '',
    project = ''
  } = req.body

  let { occurredAt, createdAt, id, bookId: bodyBookId } = req.body
  const now = new Date().toISOString()
  const newId =
    id && String(id).trim() ? String(id).trim() : `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
  occurredAt = occurredAt || now
  createdAt = createdAt || now

  let resolvedBookId = bodyBookId != null && bodyBookId !== '' ? Number(bodyBookId) : null
  if (resolvedBookId != null && !Number.isNaN(resolvedBookId)) {
    const access = await getBookAccess(resolvedBookId, req.userId)
    if (!access) {
      return res.status(404).json({ error: '账本不存在' })
    }
  } else {
    resolvedBookId = await getDefaultBookId(req.userId)
  }
  if (!resolvedBookId) {
    return res.status(500).json({ error: '无法分配账本' })
  }

  const dup = await get(`SELECT id FROM ledger_records WHERE id = ?`, [newId])
  if (dup) {
    return res.status(409).json({ error: '该记录已存在' })
  }

  try {
    await run(
      `INSERT INTO ledger_records (
        id, user_id, book_id, type, category, amount, note, account, member, merchant, project, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        req.userId,
        resolvedBookId,
        type,
        category,
        Number(amount),
        note,
        account,
        member,
        merchant,
        project,
        occurredAt,
        createdAt
      ]
    )
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: '保存流水失败' })
  }

  const row = await get(`SELECT * FROM ledger_records WHERE id = ?`, [newId])
  await notifyBookLedgerSubscribers(resolvedBookId, req)
  res.status(201).json({ record: rowToRecord(row) })
})

/**
 * 批量删除流水
 *
 * 安全策略：
 * - 先查候选记录，再逐条做账本权限校验；
 * - 仅删除当前用户有访问权限的记录（无权限的静默跳过）。
 */
/**
 * POST /api/ledger/batch-delete
 * 批量删除流水（只删除当前用户有权限访问的记录）。
 */
router.post('/batch-delete', authMiddleware, async (req, res) => {
  const ids = req.body && Array.isArray(req.body.ids) ? req.body.ids : null
  if (!ids || !ids.length) {
    return res.status(400).json({ error: '请提供要删除的 id 列表' })
  }
  const clean = ids.map((x) => String(x)).filter(Boolean)
  if (!clean.length) {
    return res.status(400).json({ error: '请提供要删除的 id 列表' })
  }
  const placeholders = clean.map(() => '?').join(',')
  try {
    const candidates = await all(`SELECT id, book_id FROM ledger_records WHERE id IN (${placeholders})`, clean)
    const allowed = []
    const bookIds = []
    for (const c of candidates) {
      const acc = await getBookAccess(c.book_id, req.userId)
      if (acc) {
        allowed.push(c.id)
        if (c.book_id != null) bookIds.push(c.book_id)
      }
    }
    if (!allowed.length) {
      return res.json({ deleted: 0 })
    }
    const ph2 = allowed.map(() => '?').join(',')
    const result = await run(`DELETE FROM ledger_records WHERE id IN (${ph2})`, allowed)
    if (result.changes > 0) {
      await notifyBookLedgerSubscribersMany(bookIds, req)
    }
    res.json({ deleted: result.changes })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '批量删除失败' })
  }
})

/**
 * 更新单条流水
 *
 * 额外规则：
 * - 协作者允许改“本账本内”的流水；
 * - 但协作者不允许把流水改挂到其他账本（防止越权迁移数据）。
 */
/**
 * PUT /api/ledger/:id
 * 更新单条流水。
 *
 * 特别规则：
 * - 协作成员不能把流水改到其它账本（防止“跨账本搬运”越权）。
 */
router.put('/:id', authMiddleware, ledgerUpdateValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return

  const { id } = req.params
  const row = await get(`SELECT * FROM ledger_records WHERE id = ?`, [id])
  if (!row) {
    return res.status(404).json({ error: '记录不存在' })
  }
  const acc0 = await getBookAccess(row.book_id, req.userId)
  if (!acc0) {
    return res.status(404).json({ error: '记录不存在' })
  }

  const p = req.body
  let nextBookId = row.book_id != null ? row.book_id : await getDefaultBookId(req.userId)
  if (p.bookId !== undefined && p.bookId !== null) {
    const bid = Number(p.bookId)
    if (acc0.role === 'collaborator' && bid !== row.book_id) {
      return res.status(403).json({ error: '协作成员不能更改账本归属' })
    }
    const accessTarget = await getBookAccess(bid, req.userId)
    if (!accessTarget) {
      return res.status(404).json({ error: '账本不存在' })
    }
    nextBookId = bid
  }

  const next = {
    type: p.type !== undefined ? p.type : row.type,
    category: p.category !== undefined ? p.category : row.category,
    amount: p.amount !== undefined ? Number(p.amount) : Number(row.amount),
    note: p.note !== undefined ? p.note : row.note,
    account: p.account !== undefined ? p.account : row.account,
    member: p.member !== undefined ? p.member : row.member,
    merchant: p.merchant !== undefined ? p.merchant : row.merchant,
    project: p.project !== undefined ? p.project : row.project,
    occurred_at: p.occurredAt !== undefined ? p.occurredAt : row.occurred_at,
    book_id: nextBookId
  }

  try {
    /** 拥有者或协作成员均可改本账内任意流水（已用 getBookAccess 校验账本权限） */
    const upd = await run(
      `UPDATE ledger_records SET type = ?, category = ?, amount = ?, note = ?, account = ?, member = ?, merchant = ?, project = ?, occurred_at = ?, book_id = ?
       WHERE id = ?`,
      [
        next.type,
        next.category,
        next.amount,
        next.note,
        next.account,
        next.member,
        next.merchant,
        next.project,
        next.occurred_at,
        next.book_id,
        id
      ]
    )
    if (!upd.changes) {
      return res.status(404).json({ error: '记录不存在' })
    }
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: '更新失败' })
  }

  const updated = await get(`SELECT * FROM ledger_records WHERE id = ?`, [id])
  await notifyBookLedgerSubscribers(next.book_id, req)
  if (row.book_id != null && row.book_id !== next.book_id) {
    await notifyBookLedgerSubscribers(row.book_id, req)
  }
  res.json({ record: rowToRecord(updated) })
})

/**
 * 删除单条流水
 */
/**
 * DELETE /api/ledger/:id
 * 删除单条流水（权限由账本访问权决定）。
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const rec = await get(`SELECT book_id FROM ledger_records WHERE id = ?`, [req.params.id])
  if (!rec) {
    return res.status(404).json({ error: '记录不存在' })
  }
  const acc = await getBookAccess(rec.book_id, req.userId)
  if (!acc) {
    return res.status(404).json({ error: '记录不存在' })
  }
  const result = await run(`DELETE FROM ledger_records WHERE id = ?`, [req.params.id])
  if (!result.changes) {
    return res.status(404).json({ error: '记录不存在' })
  }
  await notifyBookLedgerSubscribers(rec.book_id, req)
  res.json({ ok: true })
})

module.exports = router
