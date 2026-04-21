const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const { JWT_SECRET, SALT_ROUNDS } = require('../config')
const { run, get } = require('../db')
const { sendValidationErrors, authMiddleware } = require('../middleware/http')
const { ensureDefaultBook } = require('../domain/books')

const router = express.Router()

const registerValidators = [
  body('username')
    .trim()
    .isLength({ min: 2, max: 32 })
    .withMessage('用户名为 2～32 个字符'),
  body('phone')
    .trim()
    .matches(/^1\d{10}$/)
    .withMessage('请输入有效的 11 位手机号'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('密码至少 6 位'),
  body('nickname').optional().isString().isLength({ max: 64 }).withMessage('昵称过长')
]

router.post('/register', registerValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return

  const { username, phone, password } = req.body
  const nickname = typeof req.body.nickname === 'string' ? req.body.nickname.trim().slice(0, 64) : ''

  const existing = await get(`SELECT id FROM users WHERE username = ? OR phone = ?`, [username, phone])
  if (existing) {
    return res.status(409).json({ error: '用户名或手机号已被注册' })
  }

  let passwordHash
  try {
    passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  } catch {
    return res.status(500).json({ error: '服务器错误' })
  }

  try {
    const ins = await run(
      `INSERT INTO users (username, phone, password_hash, nickname) VALUES (?, ?, ?, ?)`,
      [username, phone, passwordHash, nickname]
    )
    if (ins.lastID) {
      await ensureDefaultBook(ins.lastID)
    }
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: '用户名或手机号已被注册' })
    }
    console.error(err)
    return res.status(500).json({ error: '注册失败' })
  }

  res.status(201).json({ ok: true, message: '注册成功' })
})

const loginValidators = [
  body('account').trim().notEmpty().withMessage('请输入手机号或用户名'),
  body('password').notEmpty().withMessage('请输入密码')
]

router.post('/login', loginValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return

  const { account, password } = req.body

  const user = await get(
    `SELECT id, username, phone, password_hash, nickname, preferences_json FROM users WHERE username = ? OR phone = ?`,
    [account, account]
  )

  if (!user) {
    return res.status(401).json({ error: '账号或密码错误' })
  }

  const match = await bcrypt.compare(password, user.password_hash)
  if (!match) {
    return res.status(401).json({ error: '账号或密码错误' })
  }

  const token = jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: '7d' })

  let preferences = {}
  try {
    preferences = user.preferences_json ? JSON.parse(user.preferences_json) : {}
  } catch {
    preferences = {}
  }

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      phone: user.phone,
      nickname: user.nickname || '',
      preferences
    }
  })
})

router.get('/me', authMiddleware, async (req, res) => {
  const row = await get(
    `SELECT id, username, phone, created_at, nickname, preferences_json FROM users WHERE id = ?`,
    [req.userId]
  )
  if (!row) {
    return res.status(404).json({ error: '用户不存在' })
  }
  let preferences = {}
  try {
    preferences = row.preferences_json ? JSON.parse(row.preferences_json) : {}
  } catch {
    preferences = {}
  }
  res.json({
    user: {
      id: row.id,
      username: row.username,
      phone: row.phone,
      created_at: row.created_at,
      nickname: row.nickname || '',
      preferences
    }
  })
})

const profileValidators = [body('nickname').optional().isString().isLength({ max: 64 }).withMessage('昵称过长')]

router.put('/profile', authMiddleware, profileValidators, async (req, res) => {
  if (sendValidationErrors(res, req)) return

  const { nickname, preferences } = req.body
  const updates = []
  const params = []

  if (nickname !== undefined) {
    updates.push('nickname = ?')
    params.push(String(nickname).trim().slice(0, 64))
  }
  if (preferences !== undefined) {
    if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
      return res.status(400).json({ error: 'preferences 须为对象' })
    }
    updates.push('preferences_json = ?')
    params.push(JSON.stringify(preferences))
  }

  if (!updates.length) {
    const row = await get(
      `SELECT id, username, phone, created_at, nickname, preferences_json FROM users WHERE id = ?`,
      [req.userId]
    )
    let prefs = {}
    try {
      prefs = row.preferences_json ? JSON.parse(row.preferences_json) : {}
    } catch {
      prefs = {}
    }
    return res.json({
      user: {
        id: row.id,
        username: row.username,
        phone: row.phone,
        created_at: row.created_at,
        nickname: row.nickname || '',
        preferences: prefs
      }
    })
  }

  params.push(req.userId)
  try {
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: '保存失败' })
  }

  const row = await get(
    `SELECT id, username, phone, created_at, nickname, preferences_json FROM users WHERE id = ?`,
    [req.userId]
  )
  let prefs = {}
  try {
    prefs = row.preferences_json ? JSON.parse(row.preferences_json) : {}
  } catch {
    prefs = {}
  }
  res.json({
    user: {
      id: row.id,
      username: row.username,
      phone: row.phone,
      created_at: row.created_at,
      nickname: row.nickname || '',
      preferences: prefs
    }
  })
})

module.exports = router
