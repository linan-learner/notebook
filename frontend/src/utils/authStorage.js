const TOKEN_KEY = 'notebook_auth_token'

/**
 * 认证令牌存取工具
 *
 * 约定：
 * - 勾选“记住我” -> token 存 localStorage（跨浏览器会话）；
 * - 未勾选 -> token 存 sessionStorage（仅当前标签页/会话）。
 */
export function saveToken(token, remember) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token)
    sessionStorage.removeItem(TOKEN_KEY)
  } else {
    sessionStorage.setItem(TOKEN_KEY, token)
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
}

function getAuthPayloadFromToken() {
  const t = getToken()
  if (!t) return null
  const parts = t.split('.')
  if (parts.length < 2) return null
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad) base64 += '='.repeat(4 - pad)
  try {
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

/**
 * 从 JWT 解析当前用户 id（payload.sub）
 *
 * 为什么要有这个函数：
 * - 避免依赖“本地缓存的用户信息”可能过期；
 * - 在协作参与者过滤时，可直接用 token 中的真实登录身份做比对。
 */
export function getUserIdFromToken() {
  const payload = getAuthPayloadFromToken()
  if (!payload || payload.sub == null) return null
  const n = Number(payload.sub)
  return Number.isFinite(n) ? n : null
}

/**
 * 读取 JWT 内的 username（登录账号）
 *
 * 用途：
 * - 某些数据只带 username、不带 userId 时，用它来识别“当前用户本人”。
 */
export function getUsernameFromToken() {
  const payload = getAuthPayloadFromToken()
  return payload && typeof payload.username === 'string' ? payload.username : ''
}
