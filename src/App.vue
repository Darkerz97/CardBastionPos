<template>
  <router-view v-if="sessionState.user" />

  <div v-if="!sessionState.user" class="login-shell">
    <div class="login-card">
      <div class="login-brand">
        <h1>Card Bastion</h1>
        <p>Acceso por usuario y permisos por ventana</p>
      </div>

      <div class="login-form">
        <label>Usuario</label>
        <select v-model="username" class="input">
          <option value="">Selecciona un usuario</option>
          <option v-for="user in loginUsers" :key="user.id" :value="user.username">
            {{ user.displayName }} ({{ user.username }})
          </option>
        </select>

        <label>NIP</label>
        <input
          v-model="pin"
          type="password"
          class="input"
          placeholder="Ingresa tu NIP"
          @keydown.enter.prevent="handleLogin"
        />

        <div v-if="errorMessage" class="message error">
          {{ errorMessage }}
        </div>

        <button class="primary-btn" :disabled="loading" @click="handleLogin">
          {{ loading ? 'Entrando...' : 'Iniciar sesion' }}
        </button>

        <p class="login-help">
          Usuario inicial: <strong>admin</strong> con NIP <strong>1234</strong>.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { sessionState, refreshSession, getFirstAllowedRoute } from './session'

const router = useRouter()
const loginUsers = ref([])
const username = ref('')
const pin = ref('')
const errorMessage = ref('')
const loading = ref(false)

async function loadLoginUsers() {
  try {
    loginUsers.value = await window.posAPI.listLoginUsers()
  } catch (error) {
    loginUsers.value = []
    errorMessage.value = error?.message || 'No se pudieron cargar los usuarios.'
  }
}

async function handleLogin() {
  try {
    loading.value = true
    errorMessage.value = ''
    await window.posAPI.login({
      username: username.value,
      pin: pin.value,
    })
    await refreshSession()
    pin.value = ''
    await router.replace(getFirstAllowedRoute())
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo iniciar sesion.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refreshSession()
  if (!sessionState.user) {
    await loadLoginUsers()
  } else {
    await router.replace(getFirstAllowedRoute())
  }
})
</script>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(242, 177, 56, 0.18), transparent 34%),
    linear-gradient(135deg, #111827 0%, #18181b 55%, #0f172a 100%);
}

.login-card {
  width: min(420px, 100%);
  background: rgba(24, 24, 27, 0.94);
  border: 1px solid #3f3f46;
  border-radius: 22px;
  padding: 28px;
  color: #f4f4f5;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.login-brand h1 {
  margin: 0;
  color: #f2b138;
}

.login-brand p {
  margin: 8px 0 0;
  color: #d4d4d8;
}

.login-form {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #3f3f46;
  background: #27272a;
  color: #fff;
}

.primary-btn {
  border: none;
  border-radius: 12px;
  padding: 14px 16px;
  background: #f29a2e;
  color: #111;
  font-weight: 800;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}

.message.error {
  padding: 12px;
  border-radius: 10px;
  background: #7f1d1d;
}

.login-help {
  margin: 4px 0 0;
  font-size: 13px;
  color: #d4d4d8;
}
</style>
