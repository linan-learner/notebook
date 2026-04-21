/**
 * 认证 API（注册/登录）
 *
 * 这一层只做两件事：
 * 1) 组装 HTTP 请求；
 * 2) 统一把后端错误转换成前端可展示的 Error(message)。
 *
 * 为什么单独抽这一层：
 * - 视图层（login/register）只关心“调用成功还是失败”，不关心 fetch 细节；
 * - 后续如果切换为 axios 或增加重试策略，只改这里。
 */
const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * 安全解析响应体：
 * - 后端有时会返回空 body（例如某些异常链路），直接 res.json() 会抛错；
 * - 因此先读取 text，再尝试 JSON.parse，失败时返回空对象。
 *
 * @param {Response} res
 * @returns {Promise<object>}
 */
async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/**
 * 注册
 * 调用方：`views/register.vue`
 *
 * @param {{ username: string, phone: string, password: string, nickname?: string }} payload
 * @returns {Promise<object>} 后端返回用户基本信息（由业务决定字段）
 */
export async function register({ username, phone, password, nickname }) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, phone, password, nickname })
  })
  const data = await parseJson(res)
  if (!res.ok) {
    throw new Error(data.error || '注册失败')
  }
  return data
}

/**
 * 登录
 * 调用方：`views/login.vue`
 *
 * 为什么参数叫 account：
 * - 后端允许“用户名或手机号”登录，前端统一叫 account 以兼容两种入口。
 *
 * @param {{ account: string, password: string }} payload
 * @returns {Promise<object>} 常见包含 token 与用户信息
 */
export async function login({ account, password }) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password })
  })
  const data = await parseJson(res)
  if (!res.ok) {
    throw new Error(data.error || '登录失败')
  }
  return data
}
