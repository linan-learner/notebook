const express = require('express')
const cors = require('cors')
const authRoutes = require('./routes/auth')
const booksRoutes = require('./routes/books')
const friendsRoutes = require('./routes/friends')
const ledgerRoutes = require('./routes/ledger')

/**
 * Express 应用装配入口（不负责 listen）
 *
 * 为什么拆成 createApp：
 * - 便于测试时复用 app 实例；
 * - 服务器启动（端口监听）与应用组装解耦。
 */
function createApp() {
  const app = express()
  // 允许前端跨域访问；开发期 origin 变化频繁，采用动态放行。
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  )
  // 全局 JSON body 解析
  app.use(express.json())

  // 业务路由挂载（统一 /api 前缀）
  app.use('/api/auth', authRoutes)
  app.use('/api/books', booksRoutes)
  app.use('/api/friends', friendsRoutes)
  app.use('/api/ledger', ledgerRoutes)
  app.get('/api/health', (req, res) => {
    res.json({ ok: true })
  })
  return app
}

module.exports = { createApp }
