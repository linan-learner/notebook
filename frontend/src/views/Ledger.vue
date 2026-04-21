<template>
  <div class="book-page">
    <BookSidebar section="ledger" />
    <div class="main book-main">
      <header class="top-bar">
        <div class="title-block">
          <h1>流水</h1>
          <p v-if="ledgerBookHint" class="ledger-book-hint">{{ ledgerBookHint }}</p>
        </div>
        <div class="actions">
          <button class="btn" :disabled="selectedIds.size === 0" @click="batchDelete">批量删除</button>
          <RouterLink class="btn primary" :to="{ path: '/record', query: recordQuery }">新增</RouterLink>
        </div>
      </header>

      <section class="filters">
        <input v-model.trim="filters.keyword" placeholder="搜索商家/项目/备注" />
        <select v-model="filters.type">
          <option value="">全部类型</option>
          <option value="income">收入</option>
          <option value="expense">支出</option>
        </select>
        <input v-model.trim="filters.account" placeholder="账户" />
        <input v-model="filters.date" type="date" />
        <button class="btn" @click="resetFilters">重置</button>
      </section>

      <section class="list">
        <div class="head row">
          <span><input type="checkbox" :checked="allSelected" @change="toggleAll(($event.target)?.checked)" /></span>
          <span>分类</span>
          <span>金额</span>
          <span>账户</span>
          <span>成员</span>
          <span>时间</span>
          <span>商家</span>
          <span>项目</span>
          <span>备注</span>
          <span>操作</span>
        </div>
        <div v-for="item in filteredRecords" :key="item.id" class="row item">
          <span><input type="checkbox" :checked="selectedIds.has(item.id)" @change="toggle(item.id, ($event.target)?.checked)" /></span>
          <span>{{ item.category }}</span>
          <span :class="['amount', item.type]">{{ item.type === 'income' ? '+' : '-' }}¥{{ formatCurrency(item.amount) }}</span>
          <span>{{ item.account || '-' }}</span>
          <span>{{ item.member || '-' }}</span>
          <span>{{ toDateTime(item.occurredAt || item.createdAt) }}</span>
          <span>{{ item.merchant || '-' }}</span>
          <span>{{ item.project || '-' }}</span>
          <span>{{ item.note || '-' }}</span>
          <span class="ops">
            <button class="link" @click="goEdit(item.id)">编辑</button>
            <button class="link danger" @click="remove(item.id)">删除</button>
          </span>
        </div>
        <p v-if="!filteredRecords.length" class="empty">暂无流水</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BookSidebar from '@/components/BookSidebar.vue'
import { useBookStore } from '@/stores/book'
import { getCurrentBookId, pullBooksFromServer, setCurrentBookId } from '@/utils/bookStore'
import {
  deleteRecord,
  deleteRecords,
  formatCurrency,
  getRecords,
  offLedgerUpdated,
  onLedgerUpdated,
  pullLedgerFromServer
} from '@/utils/ledgerStore'

const router = useRouter()
const route = useRoute()
const { books } = storeToRefs(useBookStore())

/** 与「同步」无关：不同 bookId 就是不同账本，必须双方 URL 一致才能对上看 */
const ledgerBookHint = computed(() => {
  const q = route.query.bookId
  const id = q != null && q !== '' ? Number(q) : getCurrentBookId()
  if (id == null || !Number.isFinite(id)) return ''
  const b = books.value.find((x) => Number(x.id) === Number(id))
  const name = (b?.name && String(b.name).trim()) || '账本'
  return `当前：${name} · #${id}（多人协作请双方地址栏 ?bookId= 数字相同）`
})

const recordQuery = computed(() => {
  const q = route.query.bookId
  const id = q != null && q !== '' ? q : getCurrentBookId()
  return id != null && id !== '' ? { bookId: String(id) } : {}
})

watch(
  () => route.query.bookId,
  async (q) => {
    let routeBookId = null
    if (q != null && q !== '') {
      const n = Number(q)
      if (Number.isFinite(n)) {
        routeBookId = n
        setCurrentBookId(n)
      }
    }
    try {
      await pullLedgerFromServer()
    } catch (e) {
      console.error(e)
    }
    if (routeBookId != null) {
      setCurrentBookId(routeBookId)
    }
    refresh()
  },
  { immediate: true }
)
const allRecords = ref([])
const selectedIds = ref(new Set())
const filters = reactive({ keyword: '', type: '', account: '', date: '' })

const refresh = () => {
  const q = route.query.bookId
  if (q != null && q !== '') {
    const n = Number(q)
    if (Number.isFinite(n)) {
      allRecords.value = getRecords(n)
      selectedIds.value = new Set()
      return
    }
  }
  allRecords.value = getRecords()
  selectedIds.value = new Set()
}

const filteredRecords = computed(() =>
  allRecords.value.filter((item) => {
    if (filters.type && item.type !== filters.type) return false
    if (filters.account && !String(item.account || '').includes(filters.account)) return false
    if (filters.date) {
      const d = new Date(item.occurredAt || item.createdAt)
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (value !== filters.date) return false
    }
    if (filters.keyword) {
      const text = `${item.merchant || ''} ${item.project || ''} ${item.note || ''}`.toLowerCase()
      if (!text.includes(filters.keyword.toLowerCase())) return false
    }
    return true
  })
)

const allSelected = computed(
  () => filteredRecords.value.length > 0 && filteredRecords.value.every((i) => selectedIds.value.has(i.id))
)

const toggle = (id, checked) => {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}
const toggleAll = (checked) => {
  selectedIds.value = checked ? new Set(filteredRecords.value.map((i) => i.id)) : new Set()
}
const batchDelete = async () => {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  if (!window.confirm(`确认删除 ${ids.length} 条流水？`)) return
  try {
    await deleteRecords(ids)
    selectedIds.value = new Set()
    refresh()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '删除失败')
  }
}
const remove = async (id) => {
  if (!window.confirm('确认删除该流水？')) return
  try {
    await deleteRecord(id)
    refresh()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '删除失败')
  }
}
const goEdit = (id) => router.push({ path: '/record', query: { id } })
const resetFilters = () => {
  filters.keyword = ''
  filters.type = ''
  filters.account = ''
  filters.date = ''
}
const toDateTime = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  onLedgerUpdated(refresh)
  pullBooksFromServer().catch(() => {})
})
onUnmounted(() => offLedgerUpdated(refresh))
</script>

<style scoped>
.top-bar { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px; }
.title-block { min-width: 0; }
h1 { margin:0; font-size:32px; }
.ledger-book-hint { margin:6px 0 0; font-size:13px; color:var(--nb-text-secondary); line-height:1.45; }
.actions { flex-shrink: 0; padding-top:4px; }
.actions { display:flex; gap:8px; }
.btn { height:34px; border:1px solid var(--nb-line-strong); border-radius:8px; background:#fff; padding:0 12px; color:var(--nb-text-secondary); text-decoration:none; display:inline-flex; align-items:center; }
.btn.primary { background:#f6a452; border-color:#f6a452; color:#fff; }
.btn:disabled { opacity:.5; }
.filters { display:grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap:8px; margin-bottom:12px; }
.filters input,.filters select { height:34px; border:1px solid var(--nb-line-strong); border-radius:8px; padding:0 10px; }
.list { background:#fff; border:1px solid var(--nb-line); border-radius:10px; overflow:hidden; }
.row { display:grid; grid-template-columns: 36px 1fr 1fr 1fr 1fr 1.6fr 1fr 1fr 1fr 1fr; gap:8px; align-items:center; padding:10px 12px; }
.head { color:var(--nb-text-secondary); font-weight:600; border-bottom:1px solid var(--nb-line); }
.item { border-bottom:1px dashed var(--nb-line); font-size:13px; }
.item:last-of-type { border-bottom:none; }
.amount.income { color:#2f7f4f; font-weight:700; }
.amount.expense { color:#9b4e2f; font-weight:700; }
.ops { display:flex; gap:8px; }
.link { border:none; background:transparent; color:#8c674b; cursor:pointer; padding:0; }
.link.danger { color:#a1432d; }
.empty { padding:18px 12px; color:var(--nb-text-secondary); margin:0; }
@media (max-width: 1200px) {
  .row { grid-template-columns: 36px 1fr 1fr 1fr 1.5fr 1fr; }
  .row span:nth-child(5), .row span:nth-child(7), .row span:nth-child(8), .row span:nth-child(9) { display:none; }
}
</style>
