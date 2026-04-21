/**
 * 协作会话 ID：仅用于在收到 WS 时判断是否为本标签页发起的变更（与 X-Collab-Session 对齐）。
 *
 * 必须使用「当前标签页内存」生成，不能用 sessionStorage/localStorage：
 * - sessionStorage 在同源多标签之间共享，会导致标签 A 的变更被标签 B 误判为「自己发的」而跳过拉取；
 * - 旧版在异常时回退固定字符串，会让所有浏览器会话 ID 相同，协作者永远跳过拉取 → 不同步。
 */
let tabSessionId = null

export function getCollabSessionId() {
  if (!tabSessionId) {
    tabSessionId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2, 12)}_${Math.random().toString(16).slice(2, 12)}`
  }
  return tabSessionId
}
