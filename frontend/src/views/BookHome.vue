<template>
  <div class="book-page">
    <BookSidebar section="home" />
    <div class="main book-main">
      <header class="top-bar">
        <h1 class="book-title">{{ bookDisplayName }}</h1>
      </header>
      <section class="summary-grid">
        <article class="summary-card income"><p>本月收入</p><h3>¥ {{ formatCurrency(summary.monthIncome) }}</h3></article>
        <article class="summary-card expense"><p>本月支出</p><h3>¥ {{ formatCurrency(summary.monthExpense) }}</h3></article>
        <article class="summary-card balance"><p>本月结余</p><h3>¥ {{ formatCurrency(summary.balance) }}</h3></article>
      </section>
      <section class="card">
        <div class="card-head"><h2>本月每日收支</h2><p class="muted">收入 {{ incomeCount }} 笔 / 支出 {{ expenseCount }} 笔</p></div>
        <div class="chart-wrap" ref="chartWrapRef">
          <svg class="chart" :class="{ dragging: isDragging }" viewBox="0 0 100 54" preserveAspectRatio="xMidYMid meet" @click="handleChartClick" @pointerdown="handlePointerDown" @pointermove="handlePointerMove">
            <g class="grid"><line v-for="tick in yTicks" :key="`y-${tick.value}`" :x1="chart.left" :x2="chart.left + chart.plotWidth" :y1="toY(tick.value)" :y2="toY(tick.value)" /></g>
            <g class="axes"><line :x1="chart.left" :x2="chart.left" :y1="chart.top" :y2="chart.top + chart.plotHeight" /><line :x1="chart.left" :x2="chart.left + chart.plotWidth" :y1="chart.top + chart.plotHeight" :y2="chart.top + chart.plotHeight" /></g>
            <g class="axis-labels">
              <text v-for="tick in yTicks" :key="`y-text-${tick.value}`" :x="chart.left - 1.5" :y="toY(tick.value) + 1" text-anchor="end">{{ tick.label }}</text>
              <text
                v-for="idx in xTickIndexes"
                :key="`x-text-${idx}`"
                :x="toX(idx)"
                :y="chart.top + chart.plotHeight + 3.2"
                :text-anchor="idx === monthDaily.income.length - 1 ? 'end' : 'middle'"
              >
                {{ xLabel(idx) }}
              </text>
            </g>
            <polyline class="line income-line" :points="linePoints(monthDaily.income)" />
            <polyline class="line expense-line" :points="linePoints(monthDaily.expense)" />
            <line v-if="activeDayIndex !== null" class="cross-line" :x1="crosshairX" :x2="crosshairX" :y1="chart.top" :y2="chart.top + chart.plotHeight" />
          </svg>
          <div v-if="activeDayIndex !== null" class="tooltip" :style="tooltipStyle">
            <p>{{ xLabel(activeDayIndex) }}</p>
            <p><i class="dot income-dot" /> 收入 {{ formatCurrency(monthDaily.income[activeDayIndex]) }}</p>
            <p><i class="dot expense-dot" /> 支出 {{ formatCurrency(monthDaily.expense[activeDayIndex]) }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BookSidebar from '@/components/BookSidebar.vue'
import {
  formatCurrency,
  getRecords,
  getSummary,
  offLedgerUpdated,
  onLedgerUpdated,
  pullLedgerFromServer
} from '@/utils/ledgerStore'
import { getBooksFromCache, getCurrentBookId, pullBooksFromServer, setCurrentBookId } from '@/utils/bookStore'
const route = useRoute()
const books = ref([])
const bookDisplayName = computed(() => {
  const q = route.query.bookId
  const id = q != null && q !== '' ? Number(q) : getCurrentBookId()
  if (id == null || !Number.isFinite(id)) return '我的账本'
  const row = books.value.find((b) => Number(b.id) === Number(id))
  return row?.name || '我的账本'
})

async function refreshBookMeta() {
  try {
    await pullBooksFromServer()
  } catch {
    /* 仍用本地缓存名称 */
  }
  books.value = getBooksFromCache()
}
const allRecords = ref([])
const summary = computed(() => getSummary(allRecords.value))
const chartWrapRef = ref(null)
const activeDayIndex = ref(null)
const crosshairX = ref(0)
const isDragging = ref(false)
const chart = { left: 8, top: 2.5, plotWidth: 88, plotHeight: 41 }
const refreshRecords = () => {
  const q = route.query.bookId
  if (q != null && q !== '') {
    const n = Number(q)
    if (Number.isFinite(n)) {
      allRecords.value = getRecords(n)
      return
    }
  }
  allRecords.value = getRecords()
}
const monthRecords = computed(() => {
  const n = new Date()
  return allRecords.value.filter((i) => {
    const d = new Date(i.occurredAt || i.createdAt)
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
  })
})
const incomeCount = computed(() => monthRecords.value.filter((i) => i.type === 'income').length)
const expenseCount = computed(() => monthRecords.value.filter((i) => i.type === 'expense').length)
const monthDaily = computed(() => {
  const n = new Date()
  const days = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()
  const income = Array.from({ length: days }, () => 0)
  const expense = Array.from({ length: days }, () => 0)
  monthRecords.value.forEach((i) => {
    const idx = new Date(i.occurredAt || i.createdAt).getDate() - 1
    if (i.type === 'income') income[idx] += Number(i.amount)
    else expense[idx] += Number(i.amount)
  })
  return { income, expense }
})
const dayMax = computed(() => Math.max(...monthDaily.value.income, ...monthDaily.value.expense, 10))
const yTicks = computed(() => [0, 1, 2, 3, 4].map((k) => ({ value: (dayMax.value * k) / 4, label: Number(((dayMax.value * k) / 4).toFixed(0)) })))
const xTickIndexes = computed(() => {
  const t = monthDaily.value.income.length
  const s = Math.max(1, Math.floor((t - 1) / 7))
  const a = []
  for (let i = 0; i < t; i += s) a.push(i)
  const last = t - 1
  if (a[a.length - 1] !== last) {
    const prev = a[a.length - 1]
    if (typeof prev === 'number' && last - prev <= Math.max(1, Math.floor(s / 2))) {
      a[a.length - 1] = last
    } else {
      a.push(last)
    }
  }
  return a
})
const toX = (i) => (monthDaily.value.income.length <= 1 ? chart.left : chart.left + (i / (monthDaily.value.income.length - 1)) * chart.plotWidth)
const toY = (v) => chart.top + chart.plotHeight - (Number(v) / (dayMax.value || 1)) * chart.plotHeight
const xLabel = (i) => `${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(i + 1).padStart(2, '0')}`
const linePoints = (arr) => arr.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
const tooltipStyle = computed(() => {
  if (activeDayIndex.value === null) return {}
  const p = ((crosshairX.value - chart.left) / chart.plotWidth) * 100
  return { left: `${Math.max(14, Math.min(86, p))}%` }
})
const updateByX = (x) => {
  const svg = chartWrapRef.value?.querySelector('.chart')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  // Map clientX to viewBox X while preserving aspect-ratio letterboxing.
  const viewW = 100
  const viewH = 54
  const viewRatio = viewW / viewH
  const rectRatio = rect.width / rect.height
  let renderW = rect.width
  let offsetX = 0
  if (rectRatio > viewRatio) {
    renderW = rect.height * viewRatio
    offsetX = (rect.width - renderW) / 2
  }
  const xInViewBox = ((x - (rect.left + offsetX)) / renderW) * viewW
  const clampedX = Math.max(chart.left, Math.min(chart.left + chart.plotWidth, xInViewBox))
  const total = monthDaily.value.income.length
  if (total <= 1) {
    activeDayIndex.value = 0
    crosshairX.value = chart.left
    return
  }

  // Keep crosshair exactly under cursor, but tooltip values use nearest date point.
  crosshairX.value = clampedX
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < total; i += 1) {
    const distance = Math.abs(toX(i) - clampedX)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = i
    }
  }
  activeDayIndex.value = nearestIndex
}
const handleChartClick = (e) => updateByX(e.clientX)
const handlePointerDown = (e) => {
  e.preventDefault()
  isDragging.value = true
  updateByX(e.clientX)
}
const handlePointerMove = (e) => {
  if (!isDragging.value) return
  e.preventDefault()
  updateByX(e.clientX)
}
const handlePointerUp = () => (isDragging.value = false)
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
    await refreshBookMeta()
    // 拉账本列表会执行 pickCurrentBookIfNeeded，须以地址栏 bookId 为准
    if (routeBookId != null) {
      setCurrentBookId(routeBookId)
    }
    try {
      await pullLedgerFromServer()
    } catch (e) {
      console.error(e)
    }
    refreshRecords()
  },
  { immediate: true }
)

async function refetchWhenPageVisible() {
  if (document.visibilityState !== 'visible') return
  const q = route.query.bookId
  let routeBookId = null
  if (q != null && q !== '') {
    const n = Number(q)
    if (Number.isFinite(n)) routeBookId = n
  }
  try {
    await refreshBookMeta()
    if (routeBookId != null) setCurrentBookId(routeBookId)
    await pullLedgerFromServer()
    if (routeBookId != null) setCurrentBookId(routeBookId)
  } catch (e) {
    console.error(e)
  }
  refreshRecords()
}

onMounted(() => {
  onLedgerUpdated(refreshRecords)
  activeDayIndex.value = Math.max(0, new Date().getDate() - 1)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointermove', handlePointerMove)
  document.addEventListener('visibilitychange', refetchWhenPageVisible)
})
onUnmounted(() => {
  offLedgerUpdated(refreshRecords)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointermove', handlePointerMove)
  document.removeEventListener('visibilitychange', refetchWhenPageVisible)
})
</script>

<style scoped>
.top-bar{padding:4px 4px 12px}.book-title{margin:0;font-size:40px;font-weight:600;color:var(--nb-text);word-break:break-word;line-height:1.2}.summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.summary-card{border-radius:var(--nb-radius-md);background:var(--nb-surface);padding:12px 14px;border:1px solid var(--nb-line)}.summary-card p{margin:0 0 6px;color:var(--nb-text-secondary);font-size:12px}.summary-card h3{margin:0;font-size:22px}.income h3{color:#2f7f4f}.expense h3{color:#9b4e2f}.balance h3{color:#5c3d28}.card{margin-top:10px;border-radius:var(--nb-radius-md);background:var(--nb-surface);border:1px solid var(--nb-line);padding:10px 12px}.card-head{display:flex;justify-content:space-between}.card-head h2{margin:0;font-size:18px}.muted{margin:0;color:var(--nb-text-secondary);font-size:13px}.chart-wrap{margin-top:8px;border-radius:10px;border:1px dashed var(--nb-line);background:#fffaf4;padding:6px 8px 4px;position:relative;user-select:none;-webkit-user-select:none}.chart{width:100%;height:auto;aspect-ratio:100/40;max-height:58vh;display:block;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none}.chart.dragging{cursor:grabbing}.line{fill:none;stroke-width:.55}.income-line{stroke:#e25a36}.expense-line{stroke:#36b7b0}.axes line{stroke:#e4ddd3;stroke-width:.25}.grid line{stroke:#ede7dd;stroke-width:.2;stroke-dasharray:.7 .9}.axis-labels text{fill:#9c8575;font-size:2.2px;user-select:none;-webkit-user-select:none;pointer-events:none}.cross-line{stroke:#c9bfb2;stroke-width:.25}.tooltip{position:absolute;top:8px;transform:translateX(-50%);background:rgba(45,36,31,.92);color:#fff;border-radius:8px;padding:8px 10px;min-width:132px;user-select:none;-webkit-user-select:none}.tooltip p{margin:0;font-size:12px;line-height:1.5}.legend{margin-top:8px;display:flex;gap:16px;color:var(--nb-text-secondary);font-size:13px}.legend span{display:inline-flex;align-items:center;gap:6px}.dot{width:10px;height:10px;border-radius:50%;display:inline-block}.income-dot{background:#2f7f4f}.expense-dot{background:#9b4e2f}@media (max-width:980px){.summary-grid{grid-template-columns:1fr}.chart{max-height:44vh}}
</style>
