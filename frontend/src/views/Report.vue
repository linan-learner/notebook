<template>
  <div class="book-page">
    <BookSidebar section="report" />
    <div class="main book-main">
      <header class="top">
        <h1>记账分析看板</h1>
        <div class="range-tabs">
          <button v-for="item in ranges" :key="item.value" :class="{ active: range === item.value }" @click="range = item.value">
            {{ item.label }}
          </button>
        </div>
      </header>

      <section class="cards">
        <article class="card metric">
          <p>总收入</p>
          <h3 class="income">¥ {{ formatCurrency(metrics.income) }}</h3>
          <small>共 {{ metrics.incomeCount }} 笔</small>
        </article>
        <article class="card metric">
          <p>总支出</p>
          <h3 class="expense">¥ {{ formatCurrency(metrics.expense) }}</h3>
          <small>共 {{ metrics.expenseCount }} 笔</small>
        </article>
        <article class="card metric">
          <p>本期结余</p>
          <h3>¥ {{ formatCurrency(metrics.balance) }}</h3>
          <small>收入 - 支出</small>
        </article>
        <article class="card metric">
          <p>记账概览</p>
          <h3>{{ metrics.totalCount }} 笔</h3>
          <small>收入 {{ metrics.incomeCount }} / 支出 {{ metrics.expenseCount }}</small>
        </article>
      </section>

      <section class="grid-2">
        <article class="card">
          <div class="head">
            <h2>收支趋势</h2>
            <span>按天</span>
          </div>
          <svg class="trend" viewBox="0 0 100 48" preserveAspectRatio="none">
            <line v-for="tick in 5" :key="`t-${tick}`" x1="8" x2="96" :y1="8 + (tick - 1) * 9" :y2="8 + (tick - 1) * 9" class="grid-line" />
            <polyline :points="trendPoints(trend.income)" class="income-line" />
            <polyline :points="trendPoints(trend.expense)" class="expense-line" />
          </svg>
          <p class="legend"><i class="dot income-dot" />收入 <i class="dot expense-dot" />支出</p>
        </article>

        <article class="card">
          <div class="head">
            <h2>{{ pieMode === 'expense' ? '支出分类占比' : '收入分类占比' }}</h2>
            <span>Top 5</span>
          </div>
          <div class="pie-tabs">
            <button :class="{ active: pieMode === 'expense' }" @click="pieMode = 'expense'">支出</button>
            <button :class="{ active: pieMode === 'income' }" @click="pieMode = 'income'">收入</button>
          </div>
          <div class="pie-wrap">
            <div class="pie" :style="{ background: pieMode === 'expense' ? expensePieGradient : incomePieGradient }"></div>
            <ul class="pie-list">
              <li v-for="item in (pieMode === 'expense' ? expenseByCategory : incomeByCategory)" :key="`${pieMode}-${item.name}`">
                <span><i class="dot" :style="{ background: item.color }" />{{ item.name }}</span>
                <b>{{ item.percent }}%</b>
              </li>
            </ul>
          </div>
        </article>
      </section>

      <section class="card">
          <div class="head">
            <h2>成员收支</h2>
            <span>按成员对比</span>
          </div>
          <ul class="member-chart">
            <li v-for="item in memberCompare" :key="item.name" class="member-row">
              <div class="member-head">
                <strong>{{ item.name }}</strong>
                <span>结余 ¥ {{ formatCurrency(item.income - item.expense) }}</span>
              </div>
              <div class="bar-item">
                <label>收入</label>
                <div class="bar-bg">
                  <div class="bar-fill income-fill" :style="{ width: `${item.incomePercent}%` }"></div>
                </div>
                <b>¥ {{ formatCurrency(item.income) }}</b>
              </div>
              <div class="bar-item">
                <label>支出</label>
                <div class="bar-bg">
                  <div class="bar-fill expense-fill" :style="{ width: `${item.expensePercent}%` }"></div>
                </div>
                <b>¥ {{ formatCurrency(item.expense) }}</b>
              </div>
            </li>
          </ul>
        
      </section>

      <section class="card">
        <div class="head">
          <h2>最近记账记录</h2>
          <span>最近 8 笔</span>
        </div>
        <table class="table">
          <thead><tr><th>时间</th><th>分类</th><th>类型</th><th>金额</th></tr></thead>
          <tbody>
            <tr v-for="item in latestRows" :key="item.id">
              <td>{{ toDate(item.occurredAt || item.createdAt) }}</td>
              <td>{{ item.category }}</td>
              <td>{{ item.type === 'income' ? '收入' : '支出' }}</td>
              <td :class="item.type === 'income' ? 'income' : 'expense'">
                {{ item.type === 'income' ? '+' : '-' }}¥ {{ formatCurrency(item.amount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BookSidebar from '@/components/BookSidebar.vue'
import { setCurrentBookId } from '@/utils/bookStore'
import { formatCurrency, getRecords, offLedgerUpdated, onLedgerUpdated, pullLedgerFromServer } from '@/utils/ledgerStore'

const route = useRoute()
const ledgerTick = ref(0)

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
    ledgerTick.value++
  },
  { immediate: true }
)

const bumpLedger = () => {
  ledgerTick.value++
}

onMounted(() => {
  onLedgerUpdated(bumpLedger)
})
onUnmounted(() => {
  offLedgerUpdated(bumpLedger)
})

const ranges = [
  { label: '近7天', value: '7d' },
  { label: '近30天', value: '30d' },
  { label: '本月', value: 'month' }
]
const range = ref('30d')
const pieMode = ref('expense')

const records = computed(() => {
  ledgerTick.value
  const q = route.query.bookId
  if (q != null && q !== '') {
    const n = Number(q)
    if (Number.isFinite(n)) return getRecords(n)
  }
  return getRecords()
})

const rangeRecords = computed(() => {
  const now = new Date()
  if (range.value === 'month') {
    return records.value.filter((item) => {
      const d = new Date(item.occurredAt || item.createdAt)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
  }
  const days = range.value === '7d' ? 7 : 30
  const start = new Date(now)
  start.setDate(now.getDate() - (days - 1))
  return records.value.filter((item) => new Date(item.occurredAt || item.createdAt) >= start)
})

const metrics = computed(() => {
  const incomeRows = rangeRecords.value.filter((r) => r.type === 'income')
  const expenseRows = rangeRecords.value.filter((r) => r.type === 'expense')
  const income = incomeRows.reduce((s, r) => s + Number(r.amount), 0)
  const expense = expenseRows.reduce((s, r) => s + Number(r.amount), 0)
  const totalCount = rangeRecords.value.length
  const balance = income - expense
  return { income, expense, balance, totalCount, incomeCount: incomeRows.length, expenseCount: expenseRows.length }
})

const trend = computed(() => {
  const days = range.value === '7d' ? 7 : range.value === '30d' ? 30 : new Date().getDate()
  const income = Array.from({ length: days }, () => 0)
  const expense = Array.from({ length: days }, () => 0)
  const now = new Date()
  rangeRecords.value.forEach((item) => {
    const d = new Date(item.occurredAt || item.createdAt)
    let idx = 0
    if (range.value === 'month') idx = d.getDate() - 1
    else {
      const start = new Date(now)
      start.setDate(now.getDate() - (days - 1))
      idx = Math.floor((d - start) / 86400000)
    }
    if (idx < 0 || idx >= days) return
    if (item.type === 'income') income[idx] += Number(item.amount)
    else expense[idx] += Number(item.amount)
  })
  return { income, expense }
})

const trendPoints = (arr) => {
  const max = Math.max(...trend.value.income, ...trend.value.expense, 1)
  return arr.map((v, i) => {
    const x = arr.length <= 1 ? 8 : 8 + (i / (arr.length - 1)) * 88
    const y = 44 - (v / max) * 34
    return `${x},${y}`
  }).join(' ')
}

const palette = ['#f17c4a', '#3db2b2', '#c38f65', '#8d6b53', '#d6ae7b']
const expenseByCategory = computed(() => {
  const rows = rangeRecords.value.filter((r) => r.type === 'expense')
  const total = rows.reduce((s, r) => s + Number(r.amount), 0) || 1
  const map = new Map()
  rows.forEach((r) => map.set(r.category, (map.get(r.category) || 0) + Number(r.amount)))
  return [...map.entries()]
    .map(([name, amount], idx) => ({
      name,
      amount,
      percent: ((amount / total) * 100).toFixed(1),
      color: palette[idx % palette.length]
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
})

const incomeByCategory = computed(() => {
  const rows = rangeRecords.value.filter((r) => r.type === 'income')
  const total = rows.reduce((s, r) => s + Number(r.amount), 0) || 1
  const map = new Map()
  rows.forEach((r) => map.set(r.category, (map.get(r.category) || 0) + Number(r.amount)))
  return [...map.entries()]
    .map(([name, amount], idx) => ({
      name,
      amount,
      percent: ((amount / total) * 100).toFixed(1),
      color: palette[idx % palette.length]
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
})

const expensePieGradient = computed(() => {
  if (!expenseByCategory.value.length) return '#eee'
  let start = 0
  const segs = expenseByCategory.value.map((item) => {
    const end = start + Number(item.percent)
    const val = `${item.color} ${start}% ${end}%`
    start = end
    return val
  })
  return `conic-gradient(${segs.join(',')})`
})

const incomePieGradient = computed(() => {
  if (!incomeByCategory.value.length) return '#eee'
  let start = 0
  const segs = incomeByCategory.value.map((item) => {
    const end = start + Number(item.percent)
    const val = `${item.color} ${start}% ${end}%`
    start = end
    return val
  })
  return `conic-gradient(${segs.join(',')})`
})

const memberCompare = computed(() => {
  const map = new Map()
  rangeRecords.value.forEach((r) => {
    const key = r.member || '未分配'
    const prev = map.get(key) || { name: key, income: 0, expense: 0 }
    if (r.type === 'income') prev.income += Number(r.amount)
    else prev.expense += Number(r.amount)
    map.set(key, prev)
  })
  const rows = [...map.values()]
  const maxValue = Math.max(...rows.map((r) => Math.max(r.income, r.expense)), 1)
  return rows
    .sort((a, b) => b.income + b.expense - (a.income + a.expense))
    .map((r) => ({
      ...r,
      incomePercent: Number(((r.income / maxValue) * 100).toFixed(1)),
      expensePercent: Number(((r.expense / maxValue) * 100).toFixed(1))
    }))
})

const latestRows = computed(() => records.value.slice(0, 8))
const toDate = (v) => {
  const d = new Date(v)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.top{display:flex;justify-content:space-between;align-items:center;gap:12px}
h1{margin:0;font-size:30px}
.range-tabs{display:flex;gap:8px}.range-tabs button{height:34px;border:1px solid var(--nb-line-strong);background:#fff;border-radius:8px;padding:0 12px;color:var(--nb-text-secondary);cursor:pointer}.range-tabs button.active{background:#f6a452;color:#fff;border-color:#f6a452}
.cards{margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.card{background:#fff;border:1px solid var(--nb-line);border-radius:10px;padding:14px}
.metric p{margin:0;color:var(--nb-text-secondary)}.metric h3{margin:6px 0;font-size:34px}.metric small{color:var(--nb-text-tertiary)}
.income{color:#2f7f4f}.expense{color:#9b4e2f}
.grid-2{margin-top:12px;display:grid;grid-template-columns:1.3fr 1fr;gap:12px}
.head{display:flex;justify-content:space-between;align-items:center}.head h2{margin:0;font-size:18px}.head span{color:var(--nb-text-secondary);font-size:13px}
.pie-tabs{margin-top:10px;display:flex;gap:8px}
.pie-tabs button{height:30px;border:1px solid var(--nb-line-strong);background:#fff;border-radius:8px;padding:0 10px;color:var(--nb-text-secondary);cursor:pointer}
.pie-tabs button.active{background:#f6a452;color:#fff;border-color:#f6a452}
.trend{width:100%;height:250px;margin-top:10px}.grid-line{stroke:#efe8df;stroke-width:.25;stroke-dasharray:.7 .9}.income-line{fill:none;stroke:#2f7f4f;stroke-width:.7}.expense-line{fill:none;stroke:#9b4e2f;stroke-width:.7}
.legend{margin:8px 0 0;color:var(--nb-text-secondary);font-size:13px;display:flex;gap:14px;align-items:center}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px}.income-dot{background:#2f7f4f}.expense-dot{background:#9b4e2f}
.pie-wrap{display:flex;gap:14px;align-items:center;margin-top:12px}.pie{width:150px;height:150px;border-radius:50%;border:10px solid #fff;box-shadow:var(--nb-shadow-sm)}
.pie-list{list-style:none;padding:0;margin:0;flex:1}.pie-list li{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--nb-line)}.pie-list li:last-child{border-bottom:none}
.member-chart{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}.member-row{padding:8px 0;border-bottom:1px dashed var(--nb-line)}.member-row:last-child{border-bottom:none}.member-head{display:flex;justify-content:space-between;font-size:13px;color:var(--nb-text-secondary);margin-bottom:6px}.bar-item{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:8px;margin:4px 0}.bar-item label{font-size:12px;color:var(--nb-text-tertiary)}.bar-bg{height:10px;background:#f2ebe2;border-radius:999px}.bar-fill{height:100%;border-radius:999px}.income-fill{background:linear-gradient(90deg,#47b38b,#2f7f4f)}.expense-fill{background:linear-gradient(90deg,#f6a452,#e17b3a)}.bar-item b{font-size:12px;color:var(--nb-text-secondary);font-weight:600}
.table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}.table th,.table td{padding:8px;border-bottom:1px dashed var(--nb-line);text-align:left}.table th{color:var(--nb-text-secondary)}.table tr:last-child td{border-bottom:none}
@media (max-width:1200px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-2{grid-template-columns:1fr}}
@media (max-width:900px){.cards{grid-template-columns:1fr}.pie-wrap{flex-direction:column;align-items:flex-start}}
</style>
