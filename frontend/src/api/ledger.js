import { getToken } from '@/utils/authStorage'
import { getCollabSessionId } from '@/utils/collabSession'

const API_BASE = import.meta.env.VITE_API_BASE || ''

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) {
    h.Authorization = `Bearer ${t}`
    h['X-Collab-Session'] = getCollabSessionId()
  }
  return h
}

async function parseError(res) {
  let msg = '请求失败'
  try {
    const j = await res.json()
    if (j && j.error) msg = j.error
  } catch {
    /* ignore */
  }
  return msg
}

/**
 * @param {{ all?: boolean, bookId?: number|null }} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchLedger(opts = {}) {
  const params = new URLSearchParams()
  if (opts.all) params.set('all', '1')
  else if (opts.bookId != null && opts.bookId !== '') params.set('bookId', String(opts.bookId))
  const q = params.toString()
  const res = await fetch(`${API_BASE}/api/ledger${q ? `?${q}` : ''}`, {
    headers: headers(),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return Array.isArray(data.records) ? data.records : []
}

/** @param {object} payload */
export async function createLedgerRecord(payload) {
  const res = await fetch(`${API_BASE}/api/ledger`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.record
}

/** @param {string} id @param {object} patch */
export async function updateLedgerRecord(id, patch) {
  const res = await fetch(`${API_BASE}/api/ledger/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(patch)
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.record
}

/** @param {string} id */
export async function removeLedgerRecord(id) {
  const res = await fetch(`${API_BASE}/api/ledger/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers()
  })
  if (!res.ok) throw new Error(await parseError(res))
}

/** @param {string[]} ids */
export async function removeLedgerRecords(ids) {
  const res = await fetch(`${API_BASE}/api/ledger/batch-delete`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ids })
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return typeof data.deleted === 'number' ? data.deleted : 0
}
