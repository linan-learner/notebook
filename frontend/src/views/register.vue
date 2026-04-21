<template>
  <div class="register-page">
    <div class="register-card">
      <div class="header">
        <button class="back-btn" type="button" @click="goHome">返回</button>
        <div class="brand-wrap">
          <AppBrand to="/books" />
        </div>
        <h1>创建账号</h1>
        <p>加入多多记账，开始你的轻松记账</p>
      </div>

      <form class="register-form" @submit.prevent="handleRegister">
        <label class="field">
          <span>用户名</span>
          <input v-model.trim="form.username" type="text" placeholder="请输入用户名" />
        </label>

        <label class="field">
          <span>昵称（可选）</span>
          <input v-model.trim="form.nickname" type="text" maxlength="64" placeholder="展示用，可不填" />
        </label>

        <label class="field">
          <span>手机号</span>
          <input v-model.trim="form.phone" type="tel" placeholder="请输入手机号" />
        </label>

        <label class="field">
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="请输入密码" />
        </label>

        <label class="field">
          <span>确认密码</span>
          <input v-model="form.confirmPassword" type="password" placeholder="请再次输入密码" />
        </label>

        <label class="agree">
          <input v-model="form.agree" type="checkbox" />
          <span>我已阅读并同意《用户协议》与《隐私政策》</span>
        </label>

        <button class="register-btn" type="submit" :disabled="submitting">
          {{ submitting ? '提交中…' : '注册' }}
        </button>
      </form>

      <p class="footer-tip">
        已有账号？
        <a href="#" @click.prevent="goLogin">去登录</a>
      </p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppBrand from '@/components/AppBrand.vue'
import { register } from '@/api/auth'

const form = reactive({
  username: '',
  nickname: '',
  phone: '',
  password: '',
  confirmPassword: '',
  agree: false
})
const router = useRouter()
const submitting = ref(false)

const handleRegister = async () => {
  if (!form.username || !form.phone || !form.password || !form.confirmPassword) {
    window.alert('请完整填写注册信息')
    return
  }

  if (form.password !== form.confirmPassword) {
    window.alert('两次输入的密码不一致')
    return
  }

  if (!form.agree) {
    window.alert('请先同意用户协议与隐私政策')
    return
  }

  submitting.value = true
  try {
    await register({
      username: form.username,
      phone: form.phone,
      password: form.password,
      nickname: form.nickname || undefined
    })
    window.alert('注册成功，请登录')
    router.push('/login')
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '注册失败')
  } finally {
    submitting.value = false
  }
}

const goHome = () => router.push('/')
const goLogin = () => router.push('/login')
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--nb-bg);
}

.register-card {
  width: 100%;
  max-width: 420px;
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

.register-form {
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

.agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--nb-text-secondary);
}

.register-btn {
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

.register-btn:hover:not(:disabled) {
  filter: brightness(1.04);
  box-shadow: 0 6px 20px rgba(139, 90, 60, 0.28);
}

.register-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.footer-tip {
  margin: 20px 0 0;
  text-align: center;
  font-size: 14px;
  color: var(--nb-text-secondary);
}

.footer-tip a {
  color: var(--nb-accent);
  text-decoration: none;
  font-weight: 500;
}

.footer-tip a:hover {
  color: var(--nb-accent-hover);
}
</style>
