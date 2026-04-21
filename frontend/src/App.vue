<template>
  <RouterView />
</template>

<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { getToken } from '@/utils/authStorage'
import { syncNotebookFromServer } from '@/utils/ledgerStore'
import { startCollabSync } from '@/utils/collabSocket'

onMounted(() => {
  if (!getToken()) return
  syncNotebookFromServer().catch(() => {})
  startCollabSync()
})
</script>

<style scoped>
</style>
