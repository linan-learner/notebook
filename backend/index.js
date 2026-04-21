const http = require('http')
const { initDb } = require('./db')
const { attachCollab } = require('./collab')
const { PORT, JWT_SECRET } = require('./config')
const { createApp } = require('./app')

async function start() {
  await initDb()
  const app = createApp()
  const server = http.createServer(app)
  attachCollab(server, { jwtSecret: JWT_SECRET })
  server.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
