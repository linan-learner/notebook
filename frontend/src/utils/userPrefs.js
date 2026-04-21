import { getToken, getUserIdFromToken, getUsernameFromToken } from '@/utils/authStorage'
import { fetchMe } from '@/api/user'

const PREFS_KEY = 'notebook_user_preferences_v1'
const NICKNAME_KEY = 'notebook_user_nickname_v1'
const USER_ID_KEY = 'notebook_user_id_v1'
const USERNAME_KEY = 'notebook_login_username_v1'

export function getStoredUserId() {
  const v = localStorage.getItem(USER_ID_KEY)
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 当前登录账号用户名（唯一），用于与参与者 username 比对 */
export function getStoredLoginUsername() {
  return localStorage.getItem(USERNAME_KEY) || ''
}

/** 当前会话用户 id：以 JWT 为准，避免换账号后本地仍残留上一用户的 id */
export function getResolvedUserId() {
  return getUserIdFromToken() ?? getStoredUserId()
}

/** 当前会话登录名：优先 JWT，避免本地残留 */
export function getResolvedLoginUsername() {
  const fromJwt = getUsernameFromToken().trim().toLowerCase()
  if (fromJwt) return fromJwt
  return getStoredLoginUsername().trim().toLowerCase()
}

export function applyUserFromMe(data) {
  const u = data && data.user ? data.user : data
  if (!u) return
  if (u.id != null && Number.isFinite(Number(u.id))) {
    localStorage.setItem(USER_ID_KEY, String(Number(u.id)))
  }
  if (u.username != null && String(u.username).trim()) {
    localStorage.setItem(USERNAME_KEY, String(u.username).trim())
  }
  if (u.nickname != null) {
    localStorage.setItem(NICKNAME_KEY, String(u.nickname))
  }
  if (u.preferences && typeof u.preferences === 'object') {
    localStorage.setItem(PREFS_KEY, JSON.stringify(u.preferences))
  }
}

export function getStoredNickname() {
  return localStorage.getItem(NICKNAME_KEY) || ''
}

export function getStoredPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw)
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
  } catch {
    return {}
  }
}

export async function pullUserProfile() {
  if (!getToken()) return
  const data = await fetchMe()
  applyUserFromMe(data)
}
