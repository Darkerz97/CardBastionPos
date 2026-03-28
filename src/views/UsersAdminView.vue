<template>
  <div class="users-layout">
    <header class="users-header">
      <div>
        <h1>Usuarios y permisos</h1>
        <p>Controla acceso por ventana y consulta la bitacora firmada</p>
      </div>
    </header>

    <section class="users-grid">
      <div class="card">
        <h2>{{ form.id ? 'Editar usuario' : 'Nuevo usuario' }}</h2>

        <div class="form-grid">
          <div>
            <label>Usuario</label>
            <input v-model="form.username" class="input" />
          </div>
          <div>
            <label>Nombre visible</label>
            <input v-model="form.displayName" class="input" />
          </div>
          <div>
            <label>NIP {{ form.id ? '(dejar vacio para no cambiar)' : '' }}</label>
            <input v-model="form.pin" type="password" class="input" />
          </div>
          <div>
            <label>Estado</label>
            <select v-model="form.active" class="input">
              <option :value="true">Activo</option>
              <option :value="false">Inactivo</option>
            </select>
          </div>
        </div>

        <label class="checkbox">
          <input v-model="form.isAdmin" type="checkbox" />
          Administrador
        </label>

        <div class="permissions-box">
          <h3>Permisos por ventana</h3>
          <div class="permissions-grid">
            <label v-for="windowDef in windowDefinitions" :key="windowDef.key" class="permission-item">
              <input
                v-model="form.permissions[windowDef.key]"
                type="checkbox"
                :disabled="form.isAdmin"
              />
              <span>{{ windowDef.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="message" class="message success">{{ message }}</div>
        <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>

        <div class="actions">
          <button class="primary-btn" @click="handleSaveUser">Guardar</button>
          <button v-if="form.id" class="secondary-btn" @click="resetForm">Cancelar</button>
        </div>
      </div>

      <div class="card">
        <h2>Usuarios</h2>
        <div class="users-list">
          <div v-for="user in users" :key="user.id" class="user-row">
            <div>
              <strong>{{ user.displayName }}</strong>
              <p>{{ user.username }}</p>
              <small>{{ user.isAdmin ? 'Administrador' : 'Permisos personalizados' }} | {{ user.active ? 'Activo' : 'Inactivo' }}</small>
            </div>
            <button class="secondary-btn" @click="editUser(user)">Editar</button>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="audit-header">
        <h2>Bitacora de movimientos</h2>
        <button class="secondary-btn" @click="loadAuditLogs">Actualizar</button>
      </div>

      <div v-if="auditLogs.length" class="audit-list">
        <div v-for="log in auditLogs" :key="log.id" class="audit-row">
          <div>
            <strong>{{ log.description }}</strong>
            <p>{{ formatDate(log.createdAt) }}</p>
            <small>Firma: {{ log.displayName || log.username || 'Sistema' }}</small>
          </div>
          <div class="audit-meta">
            <span>{{ log.entityType }} #{{ log.entityId || 'N/A' }}</span>
            <span>{{ log.action }}</span>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        No hay registros en la bitacora.
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { formatDateTimeInPosTimeZone } from '../utils/datetime'

const users = ref([])
const auditLogs = ref([])
const windowDefinitions = ref([])
const message = ref('')
const errorMessage = ref('')

const emptyPermissions = () => ({})

const form = reactive({
  id: null,
  username: '',
  displayName: '',
  pin: '',
  isAdmin: false,
  active: true,
  permissions: emptyPermissions(),
})

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

function formatDate(value) {
  return formatDateTimeInPosTimeZone(value)
}

function buildPermissionMap(source = {}) {
  return Object.fromEntries(windowDefinitions.value.map((item) => [item.key, Boolean(source[item.key])]))
}

function resetForm() {
  form.id = null
  form.username = ''
  form.displayName = ''
  form.pin = ''
  form.isAdmin = false
  form.active = true
  form.permissions = buildPermissionMap()
}

function editUser(user) {
  clearMessages()
  form.id = user.id
  form.username = user.username
  form.displayName = user.displayName
  form.pin = ''
  form.isAdmin = Boolean(user.isAdmin)
  form.active = Boolean(user.active)
  form.permissions = buildPermissionMap(user.permissions)
}

async function loadUsers() {
  users.value = await window.posAPI.getUsers()
}

async function loadAuditLogs() {
  auditLogs.value = await window.posAPI.getAuditLogs()
}

async function loadWindowDefinitions() {
  windowDefinitions.value = await window.posAPI.getWindowDefinitions()
  resetForm()
}

async function handleSaveUser() {
  try {
    clearMessages()
    const payload = {
      id: form.id,
      username: form.username,
      displayName: form.displayName,
      pin: form.pin,
      isAdmin: form.isAdmin,
      active: form.active,
      permissions: buildPermissionMap(form.permissions),
    }

    if (form.id) {
      await window.posAPI.updateUser(payload)
      message.value = 'Usuario actualizado.'
    } else {
      await window.posAPI.createUser(payload)
      message.value = 'Usuario creado.'
    }

    await Promise.all([loadUsers(), loadAuditLogs()])
    resetForm()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo guardar el usuario.'
  }
}

onMounted(async () => {
  try {
    await loadWindowDefinitions()
    await Promise.all([loadUsers(), loadAuditLogs()])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo cargar el panel.'
  }
})
</script>

<style scoped>
.users-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.users-header,
.audit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.users-header {
  margin-bottom: 20px;
}

.users-header h1,
.card h2 {
  margin: 0;
  color: #f2b138;
}

.users-header p {
  margin: 6px 0 0;
  color: #bcbcbc;
}

.users-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 18px;
  margin-bottom: 18px;
}

.card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 18px;
}

.form-grid,
.permissions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.input {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
}

.checkbox {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 16px;
}

.permissions-box {
  margin-top: 16px;
  background: #2b2b2b;
  border-radius: 14px;
  padding: 14px;
}

.permission-item {
  display: flex;
  gap: 10px;
  align-items: center;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.users-list,
.audit-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-row,
.audit-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2c2c2c;
  border-radius: 12px;
  padding: 12px;
}

.user-row p,
.user-row small,
.audit-row p,
.audit-row small {
  display: block;
  margin: 4px 0 0;
  color: #c7c7c7;
}

.audit-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: right;
  color: #d4d4d8;
}

.primary-btn,
.secondary-btn,
.back-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  background: #22c55e;
  color: white;
}

.secondary-btn {
  background: #2563eb;
  color: white;
}

.back-btn {
  background: #f29a2e;
  color: #111;
}

.message {
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
}

.message.success {
  background: #166534;
}

.message.error {
  background: #7f1d1d;
}

.empty-state {
  padding: 22px 0;
  color: #bcbcbc;
}

@media (max-width: 980px) {
  .users-grid,
  .form-grid,
  .permissions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
