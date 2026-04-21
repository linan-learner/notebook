<template>
  <aside class="sidebar">
    <AppBrand compact class="sidebar-brand" />
    <button type="button" class="back-btn" @click="goBooks">返回</button>
    <RouterLink class="create-btn" :to="{ path: '/record', query: recordQuery }">+ 记一笔</RouterLink>
    <nav class="nav">
      <RouterLink :to="{ path: '/book/home', query: bookQuery }" class="item" :class="{ active: section === 'home' }">概览</RouterLink>
      <RouterLink :to="{ path: '/book/ledger', query: bookQuery }" class="item" :class="{ active: section === 'ledger' }">流水</RouterLink>
      <RouterLink :to="{ path: '/book/report', query: bookQuery }" class="item" :class="{ active: section === 'report' }">报表</RouterLink>
    </nav>
    <div v-if="showCollab" class="collab-hint">
      <p class="collab-title">一起编辑</p>
      <div v-if="partnerOthers.length" class="collab-faces" aria-hidden="true">
        <span
          v-for="(p, idx) in partnerOthers"
          :key="`${p.userId}-${idx}`"
          class="face"
          :title="p.label"
        >{{ p.initial }}</span>
      </div>
      <p class="collab-who">{{ editingWithLine }}</p>
      <p v-if="collabConnected" class="collab-sub collab-sub--ok">
        对方保存流水后，会通过协作通道通知本机并拉取最新数据（通常几秒内）。另每 4 秒与服务器对齐作兜底。
      </p>
      <p v-else class="collab-sub collab-sub--warn">
        协作通道未连接（将自动重试）；期间仍每 4 秒从服务器拉取，以免长时间不一致。
      </p>
    </div>
  </aside>
</template>

<script setup>
import { computed, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useBookStore } from '@/stores/book'
import { useCollabStore } from '@/stores/collab'
import { getToken } from '@/utils/authStorage'
import { getResolvedLoginUsername, getResolvedUserId } from '@/utils/userPrefs'
import { pullLedgerFromServer } from '@/utils/ledgerStore'

const bookStore = useBookStore()
const { books: booksList, currentBookId: storeCurrentBookId } = storeToRefs(bookStore)
const { connected: collabConnected } = storeToRefs(useCollabStore())

const router = useRouter()
const goBooks = () => router.push('/books')

defineProps({
  section: {
    type: String,
    default: 'home'
  }
})

const route = useRoute()
const bookQuery = computed(() => {
  const q = route.query.bookId
  const id = q != null && q !== '' ? q : storeCurrentBookId.value
  return id != null && id !== '' ? { bookId: String(id) } : {}
})

const recordQuery = bookQuery

const currentBook = computed(() => {
  const q = route.query.bookId
  const idRaw = q != null && q !== '' ? q : storeCurrentBookId.value
  const id = idRaw != null && idRaw !== '' ? Number(idRaw) : null
  if (id == null || !Number.isFinite(id)) return null
  const list = booksList.value
  return list.find((x) => Number(x.id) === id) || null
})

const currentBookCollabEnabled = computed(() => {
  const b = currentBook.value
  if (!b) return false
  if (b.role === 'collaborator') return true
  const n = Array.isArray(b.collaborators) ? b.collaborators.length : 0
  return n > 0
})

function participantUserId(p) {
  if (p == null) return null
  if (p.userId != null) return p.userId
  if (p.user_id != null) return p.user_id
  return null
}

/**
 * 仅显示「对方」：已同意协作的好友/拥有者，绝不包含当前登录用户本人。
 * 用用户 id + 登录用户名双重比对；当前用户 id 以 JWT 为准，避免本地残留上一账号 id。
 */
function participantIsCurrentUser(p) {
  const myId = getResolvedUserId()
  const myUser = getResolvedLoginUsername()
  const uid = participantUserId(p)
  const pid = uid != null ? String(uid) : ''
  const mid = myId != null ? String(myId) : ''
  if (pid && mid && pid === mid) return true
  const pu =
    p.username != null
      ? String(p.username).trim().toLowerCase()
      : p.user_name != null
        ? String(p.user_name).trim().toLowerCase()
        : ''
  if (pu && myUser && pu === myUser) return true
  return false
}

const partnerOthers = computed(() => {
  const b = currentBook.value
  if (!b) return []
  const raw = Array.isArray(b.participants) ? b.participants : []
  if (raw.length) {
    return raw
      .filter((p) => participantUserId(p) != null && !participantIsCurrentUser(p))
      .map((p) => {
        const label = (p.nickname && String(p.nickname).trim()) || p.username || '用户'
        return { userId: p.userId, label, initial: label.slice(0, 1) }
      })
  }
  if (b.role === 'collaborator') {
    const oid = b.ownerUserId
    const ownerRow = {
      userId: oid,
      username: b.ownerUsername,
      nickname: b.ownerNickname
    }
    if (participantIsCurrentUser(ownerRow)) return []
    const owner =
      (b.ownerNickname && String(b.ownerNickname).trim()) ||
      (b.ownerUsername && String(b.ownerUsername).trim()) ||
      '账本拥有者'
    return [{ userId: oid, label: owner, initial: owner.slice(0, 1) }]
  }
  const cs = Array.isArray(b.collaborators) ? b.collaborators : []
  return cs
    .filter((c) => !participantIsCurrentUser(c))
    .map((c) => {
      const label = (c.nickname && String(c.nickname).trim()) || c.username || '用户'
      return { userId: c.userId, label, initial: label.slice(0, 1) }
    })
})

const editingWithLine = computed(() => {
  const ps = partnerOthers.value
  if (!ps.length) return '协作已开启'
  return `正在与 ${ps.map((p) => p.label).join('、')} 一起编辑`
})

/** 与 WebSocket 无关：只要本账本是协作账本就显示「和谁一起编辑」 */
const showCollab = computed(() => Boolean(getToken()) && currentBookCollabEnabled.value)

/** 协作账本：定时与服务器对齐，避免仅依赖 WS 时偶发不一致 */
let collabPollTimer = null
watch(
  showCollab,
  (v) => {
    if (collabPollTimer != null) {
      clearInterval(collabPollTimer)
      collabPollTimer = null
    }
    if (!v) return
    collabPollTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      pullLedgerFromServer().catch(() => {})
    }, 4000)
  },
  { immediate: true }
)
onUnmounted(() => {
  if (collabPollTimer != null) {
    clearInterval(collabPollTimer)
    collabPollTimer = null
  }
})
</script>

<style scoped>
.sidebar {
  width: 210px;
  flex-shrink: 0;
  border-right: 1px solid var(--nb-line);
  background: #fffdf9;
  padding: 16px 12px;
}

.sidebar-brand {
  margin-bottom: 12px;
}

.back-btn {
  display: block;
  width: 100%;
  margin-bottom: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid var(--nb-line-strong);
  background: var(--nb-surface);
  color: var(--nb-text-secondary);
  font-size: 14px;
  cursor: pointer;
}

.back-btn:hover {
  background: var(--nb-bg-elevated);
}

.create-btn {
  display: block;
  border: 1px solid #efc7a4;
  color: #c17a4d;
  background: #fff8f1;
  border-radius: 10px;
  text-decoration: none;
  font-size: 14px;
  text-align: center;
  padding: 9px 10px;
}

.nav {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item {
  display: block;
  color: var(--nb-text-secondary);
  text-decoration: none;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 14px;
}

.item.active {
  background: #f6a452;
  color: #fff;
}

.collab-hint {
  margin: 12px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
  color: #2f7f4f;
  background: #e8f5ee;
  border-radius: 8px;
  border: 1px solid #c5e6d4;
}

.collab-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #3d8b5c;
  text-transform: none;
}

.collab-faces {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.face {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #5a9e6f 0%, #3d7a52 100%);
  border: 2px solid #e8f5ee;
  box-shadow: 0 1px 2px rgba(45, 92, 56, 0.2);
}

.collab-who {
  margin: 0;
  font-weight: 600;
  color: #1d5c38;
  word-break: break-word;
}

.collab-sub {
  margin: 6px 0 0;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
}

.collab-sub--ok {
  color: #3d8b5c;
  opacity: 0.95;
}

.collab-sub--warn {
  color: #8a6d3a;
  opacity: 0.95;
}
</style>
