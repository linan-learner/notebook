const path = require('path')
const fs = require('fs')
const sqlite3 = require('sqlite3').verbose()

const defaultDbPath = path.join(__dirname, 'data', 'notebook.db')
const dbPathRaw = process.env.DB_PATH && String(process.env.DB_PATH).trim()
const dbPath = dbPathRaw || defaultDbPath
const dbDir = path.dirname(dbPath)

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new sqlite3.Database(dbPath)

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

async function columnExists(table, col) {
  const rows = await all(`PRAGMA table_info(${table})`)
  return rows.some((r) => r.name === col)
}

async function ensureDefaultBookMigration(userId) {
  const n = await get(`SELECT COUNT(*) as c FROM books WHERE user_id = ?`, [userId])
  if (n && Number(n.c) > 0) return
  await run(`INSERT INTO books (user_id, name, sort_order) VALUES (?, ?, 0)`, [userId, '家庭账本'])
}

async function migrateSchema() {
  if (!(await columnExists('users', 'nickname'))) {
    await run(`ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT ''`)
  }
  if (!(await columnExists('users', 'preferences_json'))) {
    await run(`ALTER TABLE users ADD COLUMN preferences_json TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!(await columnExists('ledger_records', 'book_id'))) {
    await run(`ALTER TABLE ledger_records ADD COLUMN book_id INTEGER`)
  }

  const users = await all(`SELECT id FROM users`)
  for (const u of users) {
    await ensureDefaultBookMigration(u.id)
  }

  await run(`
    UPDATE ledger_records
    SET book_id = (
      SELECT b.id FROM books b WHERE b.user_id = ledger_records.user_id ORDER BY b.id LIMIT 1
    )
    WHERE book_id IS NULL
  `)

  if (!(await columnExists('books', 'collab_enabled'))) {
    await run(`ALTER TABLE books ADD COLUMN collab_enabled INTEGER NOT NULL DEFAULT 1`)
  }
  if (!(await columnExists('books', 'owner_column'))) {
    await run(`ALTER TABLE books ADD COLUMN owner_column TEXT NOT NULL DEFAULT 'solo'`)
    /** 已有协作成员的账本归到「协作」列表（拥有者视图） */
    await run(
      `UPDATE books SET owner_column = 'collab' WHERE id IN (SELECT DISTINCT book_id FROM book_collaborators)`
    )
  }
}

async function initDb() {
  await run(`PRAGMA foreign_keys = ON`)
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await run(`CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id)`)

  await run(`
    CREATE TABLE IF NOT EXISTS ledger_records (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      category TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      account TEXT NOT NULL DEFAULT '',
      member TEXT NOT NULL DEFAULT '',
      merchant TEXT NOT NULL DEFAULT '',
      project TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await run(`CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger_records(user_id)`)

  await run(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      addressee_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(requester_id, addressee_id),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await run(`CREATE INDEX IF NOT EXISTS idx_friends_req ON friendships(requester_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_friends_add ON friendships(addressee_id)`)

  await run(`
    CREATE TABLE IF NOT EXISTS book_collaborators (
      book_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (book_id, user_id),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  await run(`CREATE INDEX IF NOT EXISTS idx_bc_user ON book_collaborators(user_id)`)

  await migrateSchema()
}

module.exports = {
  db,
  run,
  get,
  all,
  columnExists,
  initDb
}
