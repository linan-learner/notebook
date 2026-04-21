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

export async function fetchFriends() {
  const res = await fetch(`${API_BASE}/api/friends`, { headers: headers() })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return Array.isArray(data.friends) ? data.friends : []
}

export async function fetchFriendPending() {
  const res = await fetch(`${API_BASE}/api/friends/pending`, { headers: headers() })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return {
    incoming: Array.isArray(data.incoming) ? data.incoming : [],
    outgoing: Array.isArray(data.outgoing) ? data.outgoing : []
  }
}

export async function requestFriend(account) {
  const res = await fetch(`${API_BASE}/api/friends/request`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ account })
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function acceptFriend(friendshipId) {
  const res = await fetch(`${API_BASE}/api/friends/accept/${encodeURIComponent(friendshipId)}`, {
    method: 'POST',
    headers: headers()
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function removeFriend(peerUserId) {
  const res = await fetch(`${API_BASE}/api/friends/${encodeURIComponent(peerUserId)}`, {
    method: 'DELETE',
    headers: headers()
  })
  if (!res.ok) throw new Error(await parseError(res))
}
