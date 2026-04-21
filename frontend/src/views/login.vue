<template>
  <div class="login-page">
    <div class="login-card">
      <div class="header">
        <button class="back-btn" type="button" @click="goHome">返回</button>
        <div class="brand-wrap">
          <AppBrand to="/books" />
        </div>
        <h1>欢迎登录</h1>
        <p>多多记账 · 随手记，记录每一笔生活</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <label class="field">
          <span>账号</span>
          <input v-model.trim="form.username" type="text" placeholder="请输入手机号/用户名" />
        </label>

        <label class="field">
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="请输入密码" />
        </label>

        <div class="form-row">
          <label class="remember">
            <input v-model="form.remember" type="checkbox" />
            <span>记住我</span>
          </label>
          <a href="#" @click.prevent>忘记密码？</a>
        </div>

        <button class="login-btn" type="submit" :disabled="submitting">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>

      <p class="footer-tip">
        还没有账号？
        <a href="#" @click.prevent="goRegister">立即注册</a>
      </p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppBrand from '@/components/AppBrand.vue'
import { login } from '@/api/auth'
import { saveToken } from '@/utils/authStorage'
import { applyUserFromMe } from '@/utils/userPrefs'
import { syncNotebookFromServer } from '@/utils/ledgerStore'
import { startCollabSync } from '@/utils/collabSocket'

const form = reactive({
  username: '',
  password: '',
  remember: false
})

const router = useRouter()
const submitting = ref(false)

const handleLogin = async () => {
  if (!form.username || !form.password) {
    window.alert('请输入账号和密码')
    return
  }

  submitting.value = true
  try {
    const data = await login({
      account: form.username,
      password: form.password
    })
    saveToken(data.token, form.remember)
    applyUserFromMe(data)
    try {
      await syncNotebookFromServer({ skipProfile: true })
    } catch {
      /* 仍进入账本，页面会再尝试拉取 */
    }
    startCollabSync()
    router.push('/books')
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '登录失败')
  } finally {
    submitting.value = false
  }
}

const goHome = () => router.push('/')
const goRegister = () => router.push('/register')
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--nb-bg);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 36px 32px 32px;
  border-radius: var(--nb-radius-lg);
  background: var(--nb-surface);
  border: 1px solid var(--nb-line);
  box-shadow: var(--nb-shadow-md);
}

.header {
  margin-bottom: 28px;
}

.brand-wrap {
  display: flex;
  justify-content: center;
  margin: 14px 0 6px;
}

.back-btn {
  border: none;
  background: transparent;
  color: var(--nb-text-secondary);
  font-size: 13px;
  padding: 0;
  cursor: pointer;
}

.back-btn:hover {
  color: var(--nb-text);
}

.header h1 {
  margin: 12px 0 8px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--nb-text);
}

.header p {
  margin: 0;
  color: var(--nb-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 13px;
  font-weight: 500;
  color: var(--nb-text-secondary);
}

.field input {
  height: 44px;
  border: 1px solid var(--nb-line);
  border-radius: var(--nb-radius-sm);
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  background: var(--nb-bg-elevated);
  color: var(--nb-text);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field input:focus {
  border-color: var(--nb-line-strong);
  box-shadow: 0 0 0 3px var(--nb-accent-soft);
  background: var(--nb-surface);
}

.form-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.remember {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--nb-text-secondary);
}

.form-row a,
.footer-tip a {
  color: var(--nb-accent);
  text-decoration: none;
  font-weight: 500;
}

.form-row a:hover,
.footer-tip a:hover {
  color: var(--nb-accent-hover);
}

.login-btn {
  height: 46px;
  border: none;
  border-radius: var(--nb-radius-sm);
  background: linear-gradient(135deg, #c4956a 0%, #a67b52 48%, #8b5a3c 100%);
  color: #fffaf5;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  margin-top: 4px;
  transition: filter 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 16px rgba(139, 90, 60, 0.22);
}

.login-btn:hover:not(:disabled) {
  filter: brightness(1.04);
  box-shadow: 0 6px 20px rgba(139, 90, 60, 0.28);
}

.login-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.footer-tip {
  margin: 20px 0 0;
  text-align: center;
  font-size: 14px;
  color: var(--nb-text-secondary);
}
</style>
