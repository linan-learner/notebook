<template>
  <div class="friends-page">
    <header class="top-nav">
      <AppBrand />
      <nav class="nav-links" aria-label="主导航">
        <RouterLink class="nav-link" to="/books" active-class="active">我的账本</RouterLink>
        <RouterLink class="nav-link" to="/friends" active-class="active">好友</RouterLink>
      </nav>
    </header>

    <main class="wrap">
      <h1 class="page-title">好友</h1>
      <section class="card">
        <h2>添加好友</h2>
        <p class="hint">输入对方的用户名或手机号，对方同意后成为好友，即可在账本中选择与其协作。</p>
        <div class="row">
          <input v-model.trim="account" type="text" placeholder="用户名或手机号" />
          <button type="button" class="btn primary" :disabled="!account || sending" @click="sendRequest">
            {{ sending ? '发送中…' : '发送请求' }}
          </button>
        </div>
      </section>

      <section v-if="pending.incoming.length" class="card">
        <h2>待我处理</h2>
        <ul class="list">
          <li v-for="p in pending.incoming" :key="p.id" class="item">
            <span>{{ p.nickname || p.username }}</span>
            <button type="button" class="btn sm" @click="accept(p.id)">接受</button>
          </li>
        </ul>
      </section>

      <section v-if="pending.outgoing.length" class="card">
        <h2>待对方同意</h2>
        <ul class="list">
          <li v-for="p in pending.outgoing" :key="p.id" class="item">
            <span>{{ p.nickname || p.username }}</span>
            <span class="muted">等待中</span>
          </li>
        </ul>
      </section>

      <section class="card">
        <h2>我的好友</h2>
        <p v-if="loadError" class="err">{{ loadError }}</p>
        <ul v-if="friends.length" class="list">
          <li v-for="f in friends" :key="f.id" class="item">
            <span>{{ f.nickname || f.username }}</span>
            <button type="button" class="btn link danger" @click="unfriend(f)">删除</button>
          </li>
        </ul>
        <p v-else class="empty">暂无好友，请先添加</p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppBrand from '@/components/AppBrand.vue'
import * as friendsApi from '@/api/friends'

const account = ref('')
const sending = ref(false)
const loadError = ref('')
const friends = ref([])
const pending = reactive({ incoming: [], outgoing: [] })

const load = async () => {
  loadError.value = ''
  try {
    friends.value = await friendsApi.fetchFriends()
    const p = await friendsApi.fetchFriendPending()
    pending.incoming = p.incoming
    pending.outgoing = p.outgoing
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '加载失败'
  }
}

onMounted(load)

const sendRequest = async () => {
  if (!account.value) return
  sending.value = true
  try {
    const r = await friendsApi.requestFriend(account.value)
    account.value = ''
    if (r.accepted) {
      window.alert('已互为好友')
    } else {
      window.alert('请求已发送')
    }
    await load()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '发送失败')
  } finally {
    sending.value = false
  }
}

const accept = async (id) => {
  try {
    await friendsApi.acceptFriend(id)
    await load()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '操作失败')
  }
}

const unfriend = async (f) => {
  if (!window.confirm(`确定删除好友「${f.nickname || f.username}」？协作中的账本将移除对方。`)) return
  try {
    await friendsApi.removeFriend(f.id)
    await load()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '删除失败')
  }
}
</script>

<style scoped>
.friends-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #faf4eb 0%, #f7ecdf 100%);
  color: var(--nb-text);
}

.top-nav {
  height: 72px;
  border-bottom: 1px solid #f1ece5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 32px;
  background: #fff;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 38px;
}

.top-nav .nav-link {
  color: #4b4139;
  font-weight: 600;
  text-decoration: none;
}

.top-nav .nav-link.active {
  color: #d17f42;
}

.page-title {
  margin: 0 0 20px;
  font-size: 40px;
  font-weight: 600;
}

.wrap {
  max-width: 560px;
  margin: 0 auto;
  padding: 28px 20px;
}

.card {
  background: #fff;
  border: 1px solid var(--nb-line);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 16px;
}

.card h2 {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
}

.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--nb-text-secondary);
  line-height: 1.5;
}

.row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.row input {
  flex: 1;
  min-width: 160px;
  height: 38px;
  border: 1px solid var(--nb-line-strong);
  border-radius: 8px;
  padding: 0 12px;
}

.btn {
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--nb-line-strong);
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}

.btn.primary {
  background: #f6a452;
  border-color: #f6a452;
  color: #fff;
}

.btn.sm {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
}

.btn.link {
  border: none;
  background: transparent;
  color: #8c674b;
}

.btn.link.danger {
  color: #a1432d;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--nb-line);
  font-size: 14px;
}

.item:last-child {
  border-bottom: none;
}

.muted {
  color: var(--nb-text-secondary);
  font-size: 13px;
}

.err {
  color: #a1432d;
  font-size: 13px;
}

.empty {
  margin: 0;
  color: var(--nb-text-secondary);
  font-size: 14px;
}
</style>
