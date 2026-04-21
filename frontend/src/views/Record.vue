<template>
  <div class="record-page">
    <header class="top-bar">
      <button type="button" class="back-btn" @click="goBook">返回账本</button>
      <h1>记一笔</h1>
      <span class="spacer" aria-hidden="true" />
    </header>
    <main class="content">
      <form class="form-card" @submit.prevent="handleSubmit">
        <label class="field">
          <span>类型</span>
          <select v-model="form.type">
            <option v-for="item in RECORD_TYPES" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>分类</span>
          <select v-model="form.category">
            <option v-for="item in currentCategories" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>金额</span>
          <input v-model.number="form.amount" type="number" min="0.01" step="0.01" placeholder="请输入金额" />
        </label>

        <label class="field">
          <span>备注</span>
          <input v-model.trim="form.note" type="text" maxlength="40" placeholder="可选，最多40字" />
        </label>

        <label class="field">
          <span>账户</span>
          <select v-model="form.account">
            <option v-for="account in accountsList" :key="account" :value="account">
              {{ account }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>成员</span>
          <input v-model.trim="form.member" type="text" maxlength="20" placeholder="例如：我 / 家人" />
        </label>

        <label class="field">
          <span>时间</span>
          <input v-model="form.occurredAt" type="datetime-local" />
        </label>

        <label class="field">
          <span>商家</span>
          <input v-model.trim="form.merchant" type="text" maxlength="30" placeholder="例如：星巴克" />
        </label>

        <label class="field">
          <span>项目</span>
          <input v-model.trim="form.project" type="text" maxlength="30" placeholder="例如：日常开销" />
        </label>

        <button type="submit" class="submit-btn">{{ isEditing ? '更新记录' : '保存记录' }}</button>
      </form>
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  addRecord,
  CATEGORIES,
  getAccountOptions,
  getCategoryOptions,
  getRecordById,
  RECORD_TYPES,
  updateRecord
} from '@/utils/ledgerStore'
import { getCurrentBookId } from '@/utils/bookStore'

const route = useRoute()
const router = useRouter()
const editingId = typeof route.query.id === 'string' ? route.query.id : ''
const editingRecord = editingId ? getRecordById(editingId) : null
const isEditing = computed(() => Boolean(editingRecord))
const form = reactive({
  type: editingRecord?.type || 'expense',
  category: editingRecord?.category || CATEGORIES.expense[0],
  amount: editingRecord?.amount || '',
  note: editingRecord?.note || '',
  account: editingRecord?.account || getAccountOptions()[0],
  member: editingRecord?.member || '我',
  occurredAt: toDatetimeLocal(new Date(editingRecord?.occurredAt || editingRecord?.createdAt || Date.now())),
  merchant: editingRecord?.merchant || '',
  project: editingRecord?.project || ''
})

/** 优先地址栏 ?bookId=，避免协作时 Pinia 与路由不一致导致记到别人默认账本 */
const bookIdForSave = computed(() => {
  const q = route.query.bookId
  if (q != null && q !== '') {
    const n = Number(q)
    if (Number.isFinite(n)) return n
  }
  const cur = getCurrentBookId()
  return cur != null && cur !== '' ? Number(cur) : null
})

const accountsList = computed(() => getAccountOptions())
const currentCategories = computed(() => {
  const base = getCategoryOptions(form.type)
  if (form.category && !base.includes(form.category)) {
    return [form.category, ...base]
  }
  return base.length ? base : CATEGORIES[form.type]
})

watch(
  () => form.type,
  (value) => {
    const opts = getCategoryOptions(value)
    form.category = opts[0] || CATEGORIES[value][0]
  }
)

const goBook = () => {
  const bid = bookIdForSave.value
  router.push({ path: '/book/ledger', query: bid != null ? { bookId: String(bid) } : {} })
}

const handleSubmit = async () => {
  const amount = Number(form.amount)
  if (!amount || amount <= 0) {
    window.alert('请输入正确金额')
    return
  }

  const payload = {
    type: form.type,
    category: form.category,
    amount,
    note: form.note,
    account: form.account,
    member: form.member || '我',
    occurredAt: toIsoTime(form.occurredAt),
    merchant: form.merchant,
    project: form.project
  }

  try {
    if (isEditing.value) {
      await updateRecord(editingId, payload)
      window.alert('更新成功')
    } else {
      const bid = bookIdForSave.value
      await addRecord(bid != null ? { ...payload, bookId: bid } : payload)
      window.alert('保存成功')
    }
    const bid = bookIdForSave.value
    router.push({ path: '/book/ledger', query: bid != null ? { bookId: String(bid) } : {} })
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '保存失败')
  }
}

function toIsoTime(value) {
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function toDatetimeLocal(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}
</script>

<style scoped>
.record-page {
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
  background: transparent;
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
  flex-shrink: 0;
}

.back-btn {
  border: none;
  background: transparent;
  color: var(--nb-text-secondary);
  font-size: 14px;
  padding: 0;
  cursor: pointer;
}

.back-btn:hover {
  color: var(--nb-text);
}

.content {
  max-width: 720px;
  padding: 20px;
  margin: 0 auto;
}

.form-card {
  border-radius: var(--nb-radius-md);
  background: var(--nb-surface);
  border: 1px solid var(--nb-line);
  box-shadow: var(--nb-shadow-sm);
  padding: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  color: var(--nb-text-secondary);
  font-size: 13px;
}

select,
input {
  height: 42px;
  border-radius: var(--nb-radius-sm);
  border: 1px solid var(--nb-line-strong);
  background: var(--nb-bg-elevated);
  padding: 0 12px;
  color: var(--nb-text);
}

.submit-btn {
  grid-column: 1 / -1;
  height: 44px;
  border: none;
  border-radius: var(--nb-radius-sm);
  background: linear-gradient(135deg, #c4956a 0%, #a67b52 48%, #8b5a3c 100%);
  color: #fffaf5;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:hover {
  filter: brightness(1.03);
}

@media (max-width: 720px) {
  .form-card {
    grid-template-columns: 1fr;
  }
}

.hint {
  margin: 0;
  color: var(--nb-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}
</style>
