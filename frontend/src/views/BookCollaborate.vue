<template>
  <div class="page">
    <header class="top-bar">
      <button type="button" class="back-btn" @click="goBack">返回</button>
      <h1>协作成员</h1>
      <span class="spacer" />
    </header>

    <main class="wrap">
      <p v-if="loadError" class="err">{{ loadError }}</p>
      <p v-if="!loadError && book" class="book-name">账本：{{ book.name }}</p>

      <template v-if="book && book.role === 'owner'">
        <p class="hint">仅可选择<strong>已添加的好友</strong>。保存后，对方可与您共同查看、编辑该账本流水，并接收实时同步。</p>
        <ul class="friend-list">
          <li v-for="f in friends" :key="f.id" class="friend-item">
            <label class="check">
              <input type="checkbox" :checked="selected.has(f.id)" @change="toggle(f.id, $event.target.checked)" />
              <span>{{ f.nickname || f.username }}</span>
            </label>
          </li>
        </ul>
        <p v-if="!friends.length" class="empty">暂无好友，请先到「好友」页面添加。</p>
        <div class="actions">
          <button type="button" class="btn primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </template>

      <template v-else-if="book && book.role === 'collaborator'">
        <p class="hint">您是该账本的协作成员，仅账本拥有者可管理协作名单。</p>
        <p class="muted">当前协作由拥有者设置。</p>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as booksApi from '@/api/books'
import * as friendsApi from '@/api/friends'
import { getBooksFromCache, pullBooksFromServer, setCurrentBookId } from '@/utils/bookStore'

const route = useRoute()
const router = useRouter()

const loadError = ref('')
const book = ref(null)
const friends = ref([])
const selected = ref(new Set())
const saving = ref(false)

const bookId = computed(() => {
  const q = route.query.bookId
  return q != null && q !== '' ? Number(q) : NaN
})

function goBack() {
  const id = bookId.value
  if (Number.isFinite(id)) {
    setCurrentBookId(id)
    router.push({ path: '/books' })
  } else {
    router.push('/books')
  }
}

onMounted(async () => {
  if (!Number.isFinite(bookId.value)) {
    loadError.value = '缺少账本'
    return
  }
  loadError.value = ''
  try {
    await pullBooksFromServer()
    const list = getBooksFromCache()
    const b = list.find((x) => Number(x.id) === bookId.value)
    if (!b) {
      loadError.value = '账本不存在'
      return
    }
    book.value = b
    if (b.role === 'owner') {
      friends.value = await friendsApi.fetchFriends()
      const collab = Array.isArray(b.collaborators) ? b.collaborators : []
      selected.value = new Set(collab.map((c) => c.userId))
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '加载失败'
  }
})

function toggle(id, checked) {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

async function save() {
  if (!book.value || book.value.role !== 'owner') return
  saving.value = true
  try {
    await booksApi.putBookCollaborators(bookId.value, [...selected.value])
    await pullBooksFromServer()
    router.push('/books')
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: linear-gradient(180deg, #faf4eb 0%, #f7ecdf 100%);
  color: var(--nb-text);
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--nb-line);
}

.top-bar h1 {
  margin: 0;
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
}

.spacer {
  width: 56px;
}

.back-btn {
  border: none;
  background: transparent;
  color: var(--nb-text-secondary);
  cursor: pointer;
  font-size: 15px;
}

.wrap {
  max-width: 560px;
  margin: 0 auto;
  padding: 20px;
}

.book-name {
  font-weight: 600;
  margin: 0 0 12px;
}

.hint {
  font-size: 14px;
  line-height: 1.55;
  color: var(--nb-text-secondary);
  margin: 0 0 16px;
}

.friend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: #fff;
  border: 1px solid var(--nb-line);
  border-radius: 12px;
  overflow: hidden;
}

.friend-item {
  border-bottom: 1px solid var(--nb-line);
}

.friend-item:last-child {
  border-bottom: none;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  font-size: 15px;
}

.check input {
  width: 18px;
  height: 18px;
  accent-color: #f6a452;
}

.empty {
  color: var(--nb-text-secondary);
  font-size: 14px;
}

.actions {
  margin-top: 20px;
}

.btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 8px;
  border: 1px solid var(--nb-line-strong);
  background: #fff;
  cursor: pointer;
}

.btn.primary {
  background: #f6a452;
  border-color: #f6a452;
  color: #fff;
}

.err {
  color: #a1432d;
}

.muted {
  color: var(--nb-text-secondary);
  font-size: 14px;
}
</style>
