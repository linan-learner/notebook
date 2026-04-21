<template>
  <div class="books-page">
    <header class="top-nav">
      <AppBrand />
      <nav class="nav-links" aria-label="主导航">
        <RouterLink class="nav-link" to="/books" active-class="active">我的账本</RouterLink>
        <RouterLink class="nav-link" to="/friends" active-class="active">好友</RouterLink>
      </nav>
    </header>

    <main class="wrap">
      <p v-if="loadError" class="err">{{ loadError }}</p>

      <div class="two-columns">
        <section class="column">
          <h2 class="col-title">本人账本</h2>
          <p class="col-desc">
            仅您可编辑。若右侧已有协作账本，可删除最后一本本人账本；若没有任何协作账本，须至少保留一本。
          </p>
          <div class="cards">
            <article
              v-for="b in ownedBooks"
              :key="'o-' + b.id"
              class="book-card"
              @click="goBook(b.id)"
            >
              <div class="thumb">账本</div>
              <div class="book-body">
                <h3>{{ b.name }}</h3>
                <p class="sub">
                  本人账本
                  <span> · 流水与云端同步</span>
                </p>
                <div class="card-actions">
                  <button
                    type="button"
                    class="delete-btn"
                    :disabled="cannotRemoveLastOwnedBook"
                    :title="
                      cannotRemoveLastOwnedBook
                        ? '仅剩一本且未参与任何协作账本时须保留'
                        : '删除该账本'
                    "
                    @click.stop="confirmDeleteBook(b)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </article>
            <article class="book-card ghost" @click="openCreateModal('solo')">
              <div class="plus">+</div>
              <div class="ghost-body">
                <h3>新建账本</h3>
                <p class="ghost-hint">仅本人使用，不与他人共享编辑</p>
              </div>
            </article>
          </div>
        </section>

        <section class="column">
          <h2 class="col-title">协作账本</h2>
          <p class="col-desc">好友共享给您的账本，以及您在此新建的协作账本（仅出现在本列）。</p>
          <div class="cards">
            <article
              v-for="b in collabBooks"
              :key="'c-' + b.id"
              class="book-card"
              @click="goBook(b.id)"
            >
              <div class="thumb">协作</div>
              <div class="book-body">
                <h3>{{ b.name }}</h3>
                <p class="sub">{{ coEditorsSubtitle(b) }}</p>
                <div class="card-actions">
                  <button
                    v-if="b.role === 'owner'"
                    type="button"
                    class="collab-btn"
                    title="修改协作名单；上方已显示当前一起编辑的成员"
                    @click.stop="goCollaborate(b.id)"
                  >
                    管理协作成员
                  </button>
                  <button
                    type="button"
                    class="leave-btn"
                    :disabled="b.role === 'owner' && cannotRemoveLastOwnedBook"
                    :title="
                      b.role === 'collaborator'
                        ? '从您的列表中移除（对方账本保留）'
                        : cannotRemoveLastOwnedBook
                          ? '仅剩一本且未参与任何协作账本时须保留'
                          : '删除该协作账本及流水，并解除好友协作'
                    "
                    @click.stop="confirmExitCollab(b)"
                  >
                    退出协作
                  </button>
                </div>
              </div>
            </article>
            <article class="book-card ghost" @click="openCreateModal('collab')">
              <div class="plus">+</div>
              <div class="ghost-body">
                <h3>新建协作账本</h3>
                <p class="ghost-hint">须选择至少一位好友，一起编辑、同步流水</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>

    <Teleport to="body">
      <div v-if="createOpen" class="modal-backdrop" @click.self="closeCreateModal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <h3 id="create-title">{{ createModalTitle }}</h3>
          <form class="create-form" @submit.prevent="submitCreate">
          <label class="field">
            <span>账本名称</span>
            <input
              ref="createNameInput"
              v-model.trim="createName"
              type="text"
              maxlength="64"
              placeholder="例如：家庭账本"
            />
          </label>
          <template v-if="createMode === 'collab'">
            <ul v-if="friends.length" class="friend-pick">
              <li v-for="f in friends" :key="f.id">
                <label class="check">
                  <input
                    type="checkbox"
                    :checked="createFriendIds.has(f.id)"
                    @change="toggleFriend(f.id, ($event.target)?.checked)"
                  />
                  <span>{{ f.nickname || f.username }}</span>
                </label>
              </li>
            </ul>
            <p v-else class="empty-friends">
              暂无好友，请先到
              <RouterLink to="/friends" @click="closeCreateModal">好友</RouterLink>
              页面添加。
            </p>
          </template>
          <div class="modal-actions">
            <button type="button" class="btn" :disabled="createSubmitting" @click="closeCreateModal">取消</button>
            <button type="submit" class="btn primary" :disabled="createSubmitting">
              {{ createSubmitting ? '创建中…' : '创建' }}
            </button>
          </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppBrand from '@/components/AppBrand.vue'
import * as booksApi from '@/api/books'
import * as friendsApi from '@/api/friends'
import { useBookStore } from '@/stores/book'
import { getBooksFromCache, getCurrentBookId, pullBooksFromServer, setCurrentBookId } from '@/utils/bookStore'
import { pullLedgerFromServer } from '@/utils/ledgerStore'
import { getResolvedUserId } from '@/utils/userPrefs'

const router = useRouter()
const route = useRoute()
const bookStore = useBookStore()
const { books } = storeToRefs(bookStore)
const loadError = ref('')

/** 本人账本：仅本人列表（solo），不含「协作栏新建」的拥有者账本 */
const ownedBooks = computed(() =>
  books.value.filter((b) => b.role === 'owner' && b.ownerColumn !== 'collab')
)

/** 协作账本：他人共享 + 本人在协作栏创建的账本（ownerColumn === collab） */
const collabBooks = computed(() =>
  books.value.filter(
    (b) => b.role === 'collaborator' || (b.role === 'owner' && b.ownerColumn === 'collab')
  )
)

const totalOwnedCount = computed(() => books.value.filter((b) => b.role === 'owner').length)

/** 仅剩一本本人拥有且未参与任何协作账本时，不可删/不可以拥有者身份退出 */
const cannotRemoveLastOwnedBook = computed(() => {
  if (totalOwnedCount.value > 1) return false
  if (totalOwnedCount.value === 1 && collabBooks.value.length > 0) return false
  return true
})

const createOpen = ref(false)
/** @type {import('vue').Ref<'solo' | 'collab'>} */
const createMode = ref('solo')
const createName = ref('')
const friends = ref([])
const createFriendIds = ref(new Set())
const createSubmitting = ref(false)
/** @type {import('vue').Ref<HTMLInputElement | null>} */
const createNameInput = ref(null)

const createModalTitle = computed(() =>
  createMode.value === 'solo' ? '新建本人账本' : '新建协作账本'
)

function ownerLabel(b) {
  const n = b.ownerNickname && String(b.ownerNickname).trim()
  if (n) return n
  return b.ownerUsername || '好友'
}

/** 协作成员展示名：昵称优先 */
function personDisplayName(c) {
  if (!c) return ''
  const nick = c.nickname != null && String(c.nickname).trim()
  if (nick) return nick
  const u = c.username != null && String(c.username).trim()
  return u || ''
}

/** 协作卡片副标题：列出除自己外的参与者（拥有者+协作成员） */
function coEditorsSubtitle(b) {
  const myId = getResolvedUserId()
  const raw = Array.isArray(b.participants) ? b.participants : []
  const others = raw.filter((p) => {
    const pid = p.userId != null ? Number(p.userId) : null
    if (myId != null && Number.isFinite(myId) && pid != null && pid === myId) return false
    return true
  })
  const fromParticipants = others.map((p) => personDisplayName(p)).filter(Boolean)
  if (fromParticipants.length) {
    return `与「${fromParticipants.join('、')}」一起编辑 · 流水与云端同步`
  }
  if (b.role === 'collaborator') {
    return `与「${ownerLabel(b)}」一起编辑 · 流水与云端同步`
  }
  const cs = Array.isArray(b.collaborators) ? b.collaborators : []
  const cnames = cs.map((c) => personDisplayName(c)).filter(Boolean)
  if (cnames.length) {
    return `与「${cnames.join('、')}」一起编辑 · 流水与云端同步`
  }
  return `协作账本 · 流水与云端同步`
}

const load = async () => {
  loadError.value = ''
  try {
    const cur = getCurrentBookId()
    if (cur != null && Number.isFinite(cur)) {
      setCurrentBookId(cur)
    } else {
      const prev = getBooksFromCache()
      if (prev.length === 1) {
        const onlyId = Number(prev[0].id)
        if (Number.isFinite(onlyId)) setCurrentBookId(onlyId)
      }
    }
    await pullBooksFromServer()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '加载失败'
  }
}

let booksPollTimer = null

function refreshBooksFromServer() {
  return pullBooksFromServer().catch(() => {})
}

function onBooksPageVisibility() {
  if (document.visibilityState !== 'visible') return
  refreshBooksFromServer()
}

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onBooksPageVisibility)
  booksPollTimer = window.setInterval(() => {
    if (route.path !== '/books') return
    if (document.visibilityState !== 'visible') return
    refreshBooksFromServer()
  }, 10000)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onBooksPageVisibility)
  if (booksPollTimer != null) {
    clearInterval(booksPollTimer)
    booksPollTimer = null
  }
})

const goBook = (id) => {
  setCurrentBookId(id)
  router.push({ path: '/book/home', query: { bookId: String(id) } })
}

const goCollaborate = (id) => {
  router.push({ path: '/book/collaborate', query: { bookId: String(id) } })
}

/** 协作列统一「退出协作」：成员=仅移除自己；拥有者=删除账本（相当于单方面结束协作） */
async function confirmExitCollab(b) {
  const name = (b.name && String(b.name).trim()) || '该账本'
  if (b.role === 'collaborator') {
    if (
      !window.confirm(
        `确定退出协作账本「${name}」？\n相当于从您这边删除该账本；对方账本与数据保留，您无法再编辑。`
      )
    ) {
      return
    }
    try {
      await booksApi.leaveBookCollaboration(b.id)
      await pullBooksFromServer()
      await pullLedgerFromServer()
      const cur = getCurrentBookId()
      if (cur != null && Number(cur) === Number(b.id)) {
        const next =
          books.value.find((x) => x.role === 'owner') ||
          books.value.find((x) => x.role === 'collaborator')
        setCurrentBookId(next != null ? next.id : null)
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '退出失败')
    }
    return
  }
  if (b.role !== 'owner') return
  if (cannotRemoveLastOwnedBook.value) {
    window.alert('仅剩一本本人账本且您未参与任何协作账本时无法删除，请先加入右侧协作账本或新建协作账本。')
    return
  }
  if (
    !window.confirm(
      `确定退出协作账本「${name}」？\n您是拥有者：退出将删除该账本及全部流水，并解除好友协作，对方将无法再访问。`
    )
  ) {
    return
  }
  try {
    await booksApi.removeBook(b.id)
    await pullBooksFromServer()
    await pullLedgerFromServer()
    const cur = getCurrentBookId()
    if (cur != null && Number(cur) === Number(b.id)) {
      const next = books.value.find((x) => x.role === 'owner')
      setCurrentBookId(next != null ? next.id : null)
    }
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '退出失败')
  }
}

async function confirmDeleteBook(b) {
  if (b.role !== 'owner') return
  if (cannotRemoveLastOwnedBook.value) {
    window.alert('仅剩一本本人账本且您未参与任何协作账本时无法删除，请先加入右侧协作账本或新建协作账本。')
    return
  }
  const name = (b.name && String(b.name).trim()) || '该账本'
  if (
    !window.confirm(
      `确定删除账本「${name}」？\n将一并删除该账本下全部流水，且不可恢复。`
    )
  ) {
    return
  }
  try {
    await booksApi.removeBook(b.id)
    await pullBooksFromServer()
    await pullLedgerFromServer()
    const cur = getCurrentBookId()
    if (cur != null && Number(cur) === Number(b.id)) {
      const next = books.value.find((x) => x.role === 'owner')
      setCurrentBookId(next != null ? next.id : null)
    }
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '删除失败')
  }
}

async function openCreateModal(mode) {
  createMode.value = mode === 'collab' ? 'collab' : 'solo'
  createName.value = ''
  createFriendIds.value = new Set()
  createOpen.value = true
  if (createMode.value === 'collab') {
    try {
      friends.value = await friendsApi.fetchFriends()
    } catch {
      friends.value = []
    }
  } else {
    friends.value = []
  }
  await nextTick()
  createNameInput.value?.focus({ preventScroll: true })
}

function closeCreateModal() {
  createOpen.value = false
}

function toggleFriend(id, checked) {
  const next = new Set(createFriendIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  createFriendIds.value = next
}

async function submitCreate() {
  const trimmed = createName.value.trim()
  if (!trimmed) return
  if (createMode.value === 'collab') {
    const ids = [...createFriendIds.value]
    if (!ids.length) return
  }
  createSubmitting.value = true
  try {
    if (createMode.value === 'solo') {
      const created = await booksApi.createBook({
        name: trimmed,
        collabEnabled: false,
        ownerColumn: 'solo'
      })
      await pullBooksFromServer()
      setCurrentBookId(created.id)
      closeCreateModal()
      return
    }
    const ids = [...createFriendIds.value]
    const created = await booksApi.createBook({
      name: trimmed,
      collabEnabled: true,
      ownerColumn: 'collab'
    })
    await booksApi.putBookCollaborators(created.id, ids)
    await pullBooksFromServer()
    setCurrentBookId(created.id)
    closeCreateModal()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '创建失败')
  } finally {
    createSubmitting.value = false
  }
}
</script>

<style scoped>
.books-page {
  min-height: 100vh;
  background: #fff;
}

.top-nav {
  height: 72px;
  border-bottom: 1px solid #f1ece5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 32px;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 38px;
}

.top-nav a {
  color: #4b4139;
  font-weight: 600;
  text-decoration: none;
}

.top-nav a.active {
  color: #d17f42;
}

.wrap {
  max-width: 1160px;
  margin: 0 auto;
  padding: 28px 20px 40px;
}

.err {
  color: #9b4e2f;
  font-size: 14px;
  margin: 8px 0 16px;
}

.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  align-items: start;
}

@media (max-width: 900px) {
  .two-columns {
    grid-template-columns: 1fr;
  }
}

.col-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: #2d241c;
}

.col-desc {
  margin: 8px 0 18px;
  font-size: 14px;
  color: #877464;
  line-height: 1.5;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.book-card {
  min-height: 160px;
  border: 1px solid #f0e8df;
  border-radius: 14px;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.book-card:hover {
  border-color: #e8d9c8;
  box-shadow: 0 4px 14px rgba(45, 36, 28, 0.06);
}

.thumb {
  width: 72px;
  height: 72px;
  border-radius: 14px;
  background: linear-gradient(135deg, #f7d57e 0%, #f1a15d 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.book-body {
  flex: 1;
  min-width: 0;
}

.book-card h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #2d241c;
}

.book-card .sub {
  margin: 8px 0 0;
  color: #877464;
  font-size: 15px;
  line-height: 1.4;
}

.card-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.collab-btn {
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.35;
  border-radius: 8px;
  border: 1px solid #efc7a4;
  background: #fff8f1;
  color: #8c674b;
  cursor: pointer;
  text-align: left;
  max-width: 100%;
  white-space: normal;
}

.collab-btn:hover {
  background: #fff0e5;
}

.delete-btn {
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid #e8c4c4;
  background: #fff8f6;
  color: #a1432d;
  cursor: pointer;
}

.delete-btn:hover:not(:disabled) {
  background: #ffe8e4;
}

.delete-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.leave-btn {
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid #c9d4e8;
  background: #f4f7fc;
  color: #4a5f8a;
  cursor: pointer;
}

.leave-btn:hover {
  background: #e8eef8;
}

.ghost {
  min-height: 140px;
  border-style: dashed;
  background: #fffaf3;
  flex-direction: row;
  align-items: center;
}

.ghost:hover {
  border-color: #e0c9a8;
}

.plus {
  width: 56px;
  height: 56px;
  border: 1px dashed #efc7a4;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e0a370;
  font-size: 32px;
  flex-shrink: 0;
}

.ghost-body {
  flex: 1;
  min-width: 0;
}

.ghost h3 {
  margin: 0;
  font-size: 20px;
  color: #5c4d42;
}

.ghost-hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: #9a8b7c;
  line-height: 1.4;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(45, 36, 28, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 420px;
  max-height: min(88vh, 640px);
  overflow: auto;
  background: #fffdf9;
  border-radius: 16px;
  padding: 22px 22px 18px;
  border: 1px solid #f0e8df;
  box-shadow: 0 16px 48px rgba(45, 36, 28, 0.18);
}

.modal-card h3 {
  margin: 0 0 16px;
  font-size: 20px;
  color: #2d241c;
}

.create-form {
  display: contents;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.field span {
  font-size: 13px;
  color: #6b5d52;
}

.field input {
  height: 40px;
  border: 1px solid #e4ddd3;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 15px;
}

.friend-pick {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow: auto;
  border: 1px solid #f0e8df;
  border-radius: 10px;
  background: #fff;
}

.friend-pick li {
  border-bottom: 1px solid #f5f0e8;
}

.friend-pick li:last-child {
  border-bottom: none;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 14px;
  color: #3d342c;
}

.check input {
  width: 18px;
  height: 18px;
  accent-color: #d17f42;
}

.empty-friends {
  margin: 0;
  padding: 12px;
  font-size: 14px;
  color: #877464;
  line-height: 1.5;
}

.empty-friends a {
  color: #c17a4d;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid #f0e8df;
}

.btn {
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid #e4ddd3;
  background: #fff;
  color: #5c4d42;
  font-size: 14px;
  cursor: pointer;
}

.btn.primary {
  background: #f6a452;
  border-color: #f6a452;
  color: #fff;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
