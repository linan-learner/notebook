import { getToken } from '@/utils/authStorage'

const API_BASE = import.meta.env.VITE_API_BASE || ''

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) h.Authorization = `Bearer ${t}`
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

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: headers() })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function updateProfile(payload) {
  const res = await fetch(`${API_BASE}/api/auth/profile`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
