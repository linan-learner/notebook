import { getToken } from '@/utils/authStorage'
import { pullBooksFromServer } from '@/utils/bookStore'
import { pullLedgerFromServer } from '@/utils/ledgerStore'
import { useCollabStore } from '@/stores/collab'

/**
 * 协作同步通道（WebSocket 客户端）
 *
 * 作用：
 * - 接收后端推送（books_updated / ledger_updated）；
 * - 收到推送后触发本地 pull，对齐账本或流水缓存；
 * - 维护断线重连与连接状态提示。
 *
 * 调用入口：
 * - 登录成功后：`startCollabSync()`（见 App.vue / login.vue）
 * - 退出登录或清理时：`stopCollabSync()`
 */
const API_BASE = import.meta.env.VITE_API_BASE || ''

let ws = null
let reconnectTimer = null
let reconnectAttempt = 0
const MAX_BACKOFF_MS = 30000
/** 合并短时间内的多条推送，避免并发多次 pull */
let pullDebounceTimer = null
let pullBooksDebounceTimer = null
const PULL_DEBOUNCE_MS = 80

function collab() {
  return useCollabStore()
}

/**
 * 计算 WebSocket 地址：
 * - 优先使用 VITE_WS_URL；
 * - 否则根据 VITE_API_BASE 推导；
 * - 再否则回退到当前页面 host。
 */
function getCollabWsUrl() {
  const token = getToken()
  if (!token) return null
  const explicit = import.meta.env.VITE_WS_URL
  let originBase
  if (explicit) {
    originBase = String(explicit).replace(/\/$/, '')
  } else if (API_BASE) {
    const u = new URL(API_BASE)
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    originBase = `${wsProto}//${u.host}`
  } else {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    originBase = `${wsProto}//${window.location.host}`
  }
  return `${originBase}/ws/collab?token=${encodeURIComponent(token)}`
}

function clearReconnect() {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  clearReconnect()
  if (!getToken()) return
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_BACKOFF_MS)
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    connect()
  }, delay)
}

/**
 * 防抖拉流水：
 * 服务器短时间推多条 ledger_updated 时，避免并发触发多次网络请求。
 */
function schedulePullLedgerFromServer() {
  if (pullDebounceTimer != null) {
    clearTimeout(pullDebounceTimer)
  }
  pullDebounceTimer = window.setTimeout(() => {
    pullDebounceTimer = null
    pullLedgerFromServer().catch((e) => console.error(e))
  }, PULL_DEBOUNCE_MS)
}

/** 防抖拉账本列表（对应 books_updated）。 */
function schedulePullBooksFromServer() {
  if (pullBooksDebounceTimer != null) {
    clearTimeout(pullBooksDebounceTimer)
  }
  pullBooksDebounceTimer = window.setTimeout(() => {
    pullBooksDebounceTimer = null
    pullBooksFromServer().catch((e) => console.error(e))
  }, PULL_DEBOUNCE_MS)
}

function handleMessage(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return
  }
  if (data.type === 'connected') {
    return
  }
  if (data.type === 'books_updated') {
    schedulePullBooksFromServer()
    return
  }
  if (data.type !== 'ledger_updated') return
  /**
   * 不再根据 originSessionId 跳过拉取：
   * - 仅靠「会话 ID」无法可靠区分多标签 / 多用户，误判会导致协作者永远不同步；
   * - pullLedgerFromServer 会整表替换缓存，多拉一次只是多一次请求，数据仍一致。
   */
  schedulePullLedgerFromServer()
}

function connect() {
  clearReconnect()
  if (!getToken()) {
    collab().setConnected(false)
    return
  }
  const url = getCollabWsUrl()
  if (!url) {
    collab().setConnected(false)
    return
  }
  try {
    ws = new WebSocket(url)
  } catch (e) {
    console.error(e)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    reconnectAttempt = 0
    collab().setConnected(true)
  }

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      handleMessage(ev.data)
    }
  }

  ws.onerror = () => {
    collab().setConnected(false)
  }

  ws.onclose = () => {
    collab().setConnected(false)
    ws = null
    if (getToken()) scheduleReconnect()
  }
}

export function startCollabSync() {
  if (!getToken()) return
  reconnectAttempt = 0
  // 已经连接/连接中则不重复建连，避免同页多连接。
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  connect()
}

/**
 * 主动停止协作同步：
 * - 清理所有定时器；
 * - 关闭 socket；
 * - 重置连接状态。
 */
export function stopCollabSync() {
  if (pullDebounceTimer != null) {
    clearTimeout(pullDebounceTimer)
    pullDebounceTimer = null
  }
  if (pullBooksDebounceTimer != null) {
    clearTimeout(pullBooksDebounceTimer)
    pullBooksDebounceTimer = null
  }
  clearReconnect()
  reconnectAttempt = 0
  collab().setConnected(false)
  if (ws) {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    ws = null
  }
}
