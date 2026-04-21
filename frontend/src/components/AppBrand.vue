<template>
  <RouterLink :to="to" class="app-brand" :class="{ compact }" :title="`${APP_NAME} · 返回账本列表`">
    <img class="app-brand__icon" src="/favicon.svg" width="32" height="32" alt="" />
    <span class="app-brand__name">{{ APP_NAME }}</span>
  </RouterLink>
</template>

<script setup>
import { APP_NAME } from '@/constants/brand'

defineProps({
  /** 侧栏等窄位：略缩小图标与字号 */
  compact: { type: Boolean, default: false },
  to: { type: String, default: '/books' }
})
</script>

<style scoped>
.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #2d241c;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.app-brand:hover {
  color: #c86f38;
}

.app-brand__icon {
  display: block;
  border-radius: 8px;
  flex-shrink: 0;
}

.app-brand.compact {
  gap: 8px;
  font-size: 17px;
}

.app-brand.compact .app-brand__icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
}
</style>
