const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const { URL } = require('url')

/** @type {Map<number, Set<import('ws')>>} */
const clientsByUser = new Map()

function addClient(userId, ws) {
  let set = clientsByUser.get(userId)
  if (!set) {
    set = new Set()
    clientsByUser.set(userId, set)
  }
  set.add(ws)
  ws._nbUserId = userId
}

function removeClient(ws) {
  const userId = ws._nbUserId
  if (userId == null) return
  const set = clientsByUser.get(userId)
  if (set) {
    set.delete(ws)
    if (set.size === 0) clientsByUser.delete(userId)
  }
}

/**
 * @param {number} userId
 * @param {{ originSessionId?: string | null, bookId?: number | null }} [opts]
 */
function notifyLedgerChange(userId, opts = {}) {
  const set = clientsByUser.get(userId)
  if (!set) return
  const originSessionId = opts.originSessionId || null
  const payload = JSON.stringify({
    type: 'ledger_updated',
    originSessionId,
    bookId: opts.bookId != null && opts.bookId !== '' ? Number(opts.bookId) : undefined
  })
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload)
      } catch (err) {
        console.error(err)
      }
    }
  }
}

/** 账本列表/协作关系变化（受邀者需拉取 /api/books） */
function notifyBooksUpdated(userId) {
  const uid = Number(userId)
  if (!uid || Number.isNaN(uid)) return
  const set = clientsByUser.get(uid)
  if (!set) return
  const payload = JSON.stringify({ type: 'books_updated' })
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload)
      } catch (err) {
        console.error(err)
      }
    }
  }
}

/**
 * @param {import('http').Server} server
 * @param {{ jwtSecret: string, path?: string }} options
 */
function attachCollab(server, options) {
  const jwtSecret = options.jwtSecret
  const path = options.path || '/ws/collab'
  const wss = new WebSocket.Server({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    let pathname
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname
    } catch {
      return
    }
    if (pathname !== path) return

    const url = new URL(request.url || '/', 'http://localhost')
    const token = url.searchParams.get('token')
    if (!token) {
      socket.destroy()
      return
    }

    let userId
    try {
      const payload = jwt.verify(token, jwtSecret)
      userId = Number(payload.sub)
      if (!userId || Number.isNaN(userId)) {
        socket.destroy()
        return
      }
    } catch {
      socket.destroy()
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      addClient(userId, ws)
      ws.on('close', () => removeClient(ws))
      ws.on('error', () => removeClient(ws))
      try {
        ws.send(JSON.stringify({ type: 'connected' }))
      } catch {
        /* ignore */
      }
    })
  })
}

module.exports = { attachCollab, notifyLedgerChange, notifyBooksUpdated }
