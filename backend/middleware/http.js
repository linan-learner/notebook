const jwt = require('jsonwebtoken')
const { validationResult } = require('express-validator')
const { JWT_SECRET } = require('../config')

/**
 * 校验器统一出口（express-validator）
 *
 * 用法：
 * - 在路由里先挂 validators；
 * - 处理函数开头 `if (sendValidationErrors(res, req)) return`。
 *
 * 这样可统一错误格式，避免每个接口重复拼装 400 响应。
 */
function sendValidationErrors(res, req) {
  const errors = validationResult(req)
  if (errors.isEmpty()) return false
  const first = errors.array({ onlyFirstError: true })[0]
  res.status(400).json({ error: first.msg })
  return true
}

/**
 * 鉴权中间件（Bearer JWT）
 *
 * 成功后在 req 上注入：
 * - req.userId：当前登录用户 id（来自 token payload.sub）
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' })
  }
  try {
    const token = header.slice(7)
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = Number(payload.sub)
    next()
  } catch {
    return res.status(401).json({ error: '登录已失效，请重新登录' })
  }
}

module.exports = {
  sendValidationErrors,
  authMiddleware
}
