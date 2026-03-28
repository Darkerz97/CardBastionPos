<template>
  <div class="settings-layout">
    <header class="settings-header">
      <div>
        <h1>Configuracion del POS</h1>
        <p>Personaliza textos, color principal y comportamiento visual</p>
      </div>
    </header>

    <section class="settings-grid">
      <div class="settings-card">
        <h2>Identidad visual</h2>

        <label>Nombre de la tienda</label>
        <input v-model="form.storeName" class="input" placeholder="Card Bastion" />

        <label>Subtitulo del POS</label>
        <input v-model="form.posSubtitle" class="input" placeholder="Point of Sale" />

        <label>Titulo del banner</label>
        <input v-model="form.heroTitle" class="input" placeholder="Ventas agiles..." />

        <label>Etiqueta del banner</label>
        <input v-model="form.heroCaption" class="input" placeholder="Panel de cobro" />

        <label>Color principal</label>
        <div class="color-row">
          <input v-model="form.accentColor" class="input" placeholder="#f2b138" />
          <input v-model="form.accentColor" type="color" class="color-picker" />
        </div>
      </div>

      <div class="settings-card">
        <h2>Comportamiento UI</h2>

        <label class="check-row">
          <input v-model="form.showHeroBanner" type="checkbox" />
          <span>Mostrar banner principal en POS</span>
        </label>

        <label class="check-row">
          <input v-model="form.compactMode" type="checkbox" />
          <span>Modo compacto para tarjetas de producto</span>
        </label>

        <div class="preview-card" :style="previewVars">
          <p class="eyebrow">{{ form.heroCaption || 'Panel de cobro' }}</p>
          <h3>{{ form.storeName || 'Card Bastion' }}</h3>
          <span>{{ form.posSubtitle || 'Point of Sale' }}</span>
          <strong>{{ form.heroTitle || 'Ventas agiles con control visual y cobro flexible' }}</strong>
        </div>
      </div>

      <div class="settings-card sync-card">
        <h2>Sincronizacion con servidor</h2>

        <label class="check-row">
          <input v-model="syncForm.enabled" type="checkbox" />
          <span>Activar sincronizacion Laravel</span>
        </label>

        <div class="sync-grid">
          <div>
            <label>API_BASE_URL</label>
            <input
              v-model="syncForm.apiBaseUrl"
              class="input"
              placeholder="https://tu-dominio.com/api"
            />
          </div>

          <div>
            <label>Device Name</label>
            <input
              v-model="syncForm.deviceName"
              class="input"
              placeholder="POS-LEON-01"
            />
          </div>
        </div>

        <div class="sync-grid">
          <div>
            <label>Email backend</label>
            <input
              v-model="syncForm.authEmail"
              class="input"
              type="email"
              placeholder="admin@cardbastion.com"
            />
          </div>

          <div>
            <label>Password backend</label>
            <input
              v-model="syncForm.authPassword"
              class="input"
              type="password"
              placeholder="Solo se actualiza si escribes uno nuevo"
            />
          </div>
        </div>

        <label>Ruta login</label>
        <input
          v-model="syncForm.authPath"
          class="input"
          placeholder="auth/login"
        />

        <div class="sync-grid">
          <div>
            <label>Upload ventas</label>
            <input
              v-model="syncForm.uploadSalesPath"
              class="input"
              placeholder="sync/upload-sales"
            />
          </div>

          <div>
            <label>Upload cierres de caja</label>
            <input
              v-model="syncForm.uploadCashClosuresPath"
              class="input"
              placeholder="sync/upload-cash-closures"
            />
          </div>
        </div>

        <div class="sync-grid">
          <div>
            <label>Upload movimientos inventario</label>
            <input
              v-model="syncForm.uploadInventoryMovementsPath"
              class="input"
              placeholder="sync/upload-inventory-movements"
            />
          </div>

          <div>
            <label>Pull productos</label>
            <input
              v-model="syncForm.pullProductsPath"
              class="input"
              placeholder="sync/products"
            />
          </div>
        </div>

        <div class="sync-grid">
          <div>
            <label>Pull clientes</label>
            <input
              v-model="syncForm.pullCustomersPath"
              class="input"
              placeholder="sync/customers"
            />
          </div>

          <div>
            <label>Pull catalogo</label>
            <input
              v-model="syncForm.pullCatalogPath"
              class="input"
              placeholder="sync/catalog"
            />
          </div>
        </div>

        <label>ID de sucursal / tienda</label>
        <input
          v-model="syncForm.storeId"
          class="input"
          placeholder="cardbastion-centro"
        />

        <div class="sync-grid">
          <div>
            <label>Timeout en ms</label>
            <input
              v-model.number="syncForm.timeoutMs"
              class="input"
              type="number"
              min="1000"
              step="1000"
            />
          </div>

          <div>
            <label>Lote de envio</label>
            <input
              v-model.number="syncForm.batchSize"
              class="input"
              type="number"
              min="1"
              step="1"
            />
          </div>
        </div>

        <div class="sync-grid">
          <div>
            <label>Intervalo auto sync ms</label>
            <input
              v-model.number="syncForm.syncIntervalMs"
              class="input"
              type="number"
              min="5000"
              step="1000"
            />
          </div>

          <div>
            <label>Retry base ms</label>
            <input
              v-model.number="syncForm.retryBaseMs"
              class="input"
              type="number"
              min="1000"
              step="1000"
            />
          </div>
        </div>

        <div class="sync-grid">
          <label class="check-row">
            <input v-model="syncForm.autoSync" type="checkbox" />
            <span>Procesar cola automaticamente</span>
          </label>

          <label class="check-row">
            <input v-model="syncForm.pullEnabled" type="checkbox" />
            <span>Permitir pull desde backend</span>
          </label>
        </div>

        <div class="sync-status">
          <strong>Estado</strong>
          <span>Configurado: {{ syncStatus.configured ? 'Si' : 'No' }}</span>
          <span>Token remoto: {{ syncStatus.hasAccessToken ? 'Disponible' : 'No autenticado' }}</span>
          <span>Credenciales guardadas: {{ syncStatus.hasSavedPassword ? 'Si' : 'No' }}</span>
          <span>Email autenticado: {{ syncStatus.authenticatedEmail || 'Sin sesion remota' }}</span>
          <span>Ultima autenticacion: {{ syncStatus.lastAuthAt || 'Sin datos' }}</span>
          <span>Pendientes: {{ syncStatus.pendingCount }}</span>
          <span>Fallidos: {{ syncStatus.failedCount }}</span>
          <span>Enviando: {{ syncStatus.sendingCount }}</span>
          <span>Sincronizados: {{ syncStatus.syncedCount }}</span>
          <span>Ultimo envio: {{ syncStatus.lastSyncedAt || 'Sin datos' }}</span>
          <span v-if="syncStatus.lastError" class="sync-error">Ultimo error: {{ syncStatus.lastError }}</span>
        </div>

        <div class="sync-actions">
          <button class="secondary-btn" @click="authenticateSync" :disabled="syncBusy">
            {{ syncBusy ? 'Procesando...' : 'Autenticar backend' }}
          </button>
          <button class="secondary-btn" @click="flushSyncQueue" :disabled="syncBusy">
            {{ syncBusy ? 'Sincronizando...' : 'Sincronizar ahora' }}
          </button>
        </div>

        <div class="sync-log-list" v-if="syncLogs.length">
          <strong>Logs recientes</strong>
          <div v-for="log in syncLogs" :key="log.id" class="sync-log-item">
            <span>[{{ log.level }}] {{ log.scope }}</span>
            <p>{{ log.message }}</p>
            <small>{{ log.createdAt }}</small>
          </div>
        </div>
      </div>
    </section>

    <div v-if="message" class="message success">
      {{ message }}
    </div>

    <div v-if="errorMessage" class="message error">
      {{ errorMessage }}
    </div>

    <footer class="settings-actions">
      <button class="secondary-btn" @click="loadSettings">
        Recargar
      </button>
      <button class="primary-btn" @click="saveSettings">
        Guardar cambios
      </button>
    </footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const message = ref('')
const errorMessage = ref('')
const form = reactive({
  storeName: 'Card Bastion',
  posSubtitle: 'Point of Sale',
  heroTitle: 'Ventas agiles con control visual y cobro flexible',
  heroCaption: 'Panel de cobro',
  accentColor: '#f2b138',
  showHeroBanner: true,
  compactMode: false,
})
const syncForm = reactive({
  enabled: false,
  apiBaseUrl: '',
  authPath: 'auth/login',
  pushPath: 'sync/events/batch',
  pullPath: 'sync/pull',
  uploadSalesPath: 'sync/upload-sales',
  uploadCashClosuresPath: 'sync/upload-cash-closures',
  uploadInventoryMovementsPath: 'sync/upload-inventory-movements',
  pullProductsPath: 'sync/products',
  pullCustomersPath: 'sync/customers',
  pullCatalogPath: 'sync/catalog',
  authEmail: '',
  authPassword: '',
  deviceName: 'POS-LOCAL-01',
  storeId: '',
  timeoutMs: 10000,
  batchSize: 25,
  retryBaseMs: 15000,
  syncIntervalMs: 60000,
  autoSync: true,
  pullEnabled: false,
})
const syncStatus = reactive({
  configured: false,
  hasSavedPassword: false,
  hasAccessToken: false,
  authenticatedEmail: '',
  lastAuthAt: '',
  pendingCount: 0,
  failedCount: 0,
  sendingCount: 0,
  syncedCount: 0,
  lastSyncedAt: '',
  lastError: '',
})
const syncBusy = ref(false)
const syncLogs = ref([])
let removeSyncListener = null

const previewVars = computed(() => ({
  '--accent-color': form.accentColor || '#f2b138',
}))

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

async function loadSettings() {
  try {
    clearMessages()
    const [data, syncData] = await Promise.all([
      window.posAPI.getPosCustomization(),
      window.posAPI.getServerSync(),
    ])
    Object.assign(form, data || {})
    Object.assign(syncForm, syncData?.settings || {})
    syncForm.authPassword = ''
    Object.assign(syncStatus, syncData?.status || {})
    await loadSyncLogs()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo cargar la configuracion.'
  }
}

async function loadSyncLogs() {
  const result = await window.posAPI.getServerSyncLogs(12)
  syncLogs.value = result?.logs || []
}

async function saveSettings() {
  try {
    clearMessages()
    syncBusy.value = true
    const syncPayload = { ...syncForm }
    if (!syncPayload.authPassword) {
      delete syncPayload.authPassword
    }
    const [posResult, syncResult] = await Promise.all([
      window.posAPI.updatePosCustomization({ ...form }),
      window.posAPI.updateServerSync(syncPayload),
    ])
    if (posResult?.success) {
      Object.assign(form, posResult.customization || {})
    }
    if (syncResult?.success) {
      Object.assign(syncForm, syncResult.settings || {})
      syncForm.authPassword = ''
      Object.assign(syncStatus, syncResult.status || {})
      await loadSyncLogs()
    }
    if (posResult?.success && syncResult?.success) {
      message.value = 'Configuracion guardada correctamente.'
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo guardar la configuracion.'
  } finally {
    syncBusy.value = false
  }
}

async function flushSyncQueue() {
  try {
    clearMessages()
    syncBusy.value = true
    const result = await window.posAPI.flushServerSync()
    Object.assign(syncStatus, result?.status || {})
    await loadSyncLogs()
    message.value = result?.cycleResult?.pushResult?.failed
      ? 'Se intento sincronizar, pero quedaron eventos fallidos.'
      : 'Cola de sincronizacion procesada.'
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo sincronizar la cola.'
  } finally {
    syncBusy.value = false
  }
}

async function authenticateSync() {
  try {
    clearMessages()
    syncBusy.value = true
    const result = await window.posAPI.authenticateServerSync({
      enabled: syncForm.enabled,
      apiBaseUrl: syncForm.apiBaseUrl,
      authPath: syncForm.authPath,
      pushPath: syncForm.pushPath,
      pullPath: syncForm.pullPath,
      uploadSalesPath: syncForm.uploadSalesPath,
      uploadCashClosuresPath: syncForm.uploadCashClosuresPath,
      uploadInventoryMovementsPath: syncForm.uploadInventoryMovementsPath,
      pullProductsPath: syncForm.pullProductsPath,
      pullCustomersPath: syncForm.pullCustomersPath,
      pullCatalogPath: syncForm.pullCatalogPath,
      authEmail: syncForm.authEmail,
      authPassword: syncForm.authPassword,
      deviceName: syncForm.deviceName,
      storeId: syncForm.storeId,
      timeoutMs: syncForm.timeoutMs,
      batchSize: syncForm.batchSize,
      retryBaseMs: syncForm.retryBaseMs,
      syncIntervalMs: syncForm.syncIntervalMs,
      autoSync: syncForm.autoSync,
      pullEnabled: syncForm.pullEnabled,
    })
    Object.assign(syncForm, result?.settings || {})
    syncForm.authPassword = ''
    Object.assign(syncStatus, result?.status || {})
    await loadSyncLogs()
    message.value = 'Sesion remota autenticada correctamente.'
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo autenticar con el backend.'
  } finally {
    syncBusy.value = false
  }
}

onMounted(async () => {
  removeSyncListener = window.posAPI.onServerSyncStatusChanged?.((payload) => {
    Object.assign(syncStatus, payload || {})
  })
  await loadSettings()
})

onBeforeUnmount(() => {
  if (typeof removeSyncListener === 'function') {
    removeSyncListener()
  }
})
</script>

<style scoped>
.settings-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.settings-header,
.settings-actions,
.color-row {
  display: flex;
  gap: 12px;
}

.settings-header,
.settings-actions {
  justify-content: space-between;
  align-items: center;
}

.settings-header {
  margin-bottom: 20px;
}

.settings-header h1,
.settings-card h2 {
  margin: 0;
  color: #f2b138;
}

.settings-header p {
  margin: 6px 0 0;
  color: #bcbcbc;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.settings-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
}

.sync-card {
  grid-column: 1 / -1;
}

.sync-grid,
.sync-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.settings-card label {
  display: block;
  margin-top: 14px;
  margin-bottom: 8px;
}

.input,
.color-picker {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
}

.color-picker {
  max-width: 72px;
  padding: 6px;
}

.check-row {
  display: flex !important;
  align-items: center;
  gap: 10px;
}

.preview-card {
  margin-top: 20px;
  padding: 20px;
  border-radius: 18px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent-color) 28%, transparent), transparent 28%),
    linear-gradient(135deg, #151515, #111827);
  border: 1px solid #323232;
}

.preview-card .eyebrow {
  margin: 0 0 6px;
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.preview-card h3 {
  margin: 0;
  color: var(--accent-color);
}

.preview-card span,
.preview-card strong {
  display: block;
  margin-top: 8px;
}

.back-btn,
.primary-btn,
.secondary-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
}

.back-btn {
  background: #f29a2e;
  color: #111;
}

.primary-btn {
  background: #2563eb;
  color: white;
}

.secondary-btn {
  background: #3f3f46;
  color: white;
}

.settings-actions {
  margin-top: 20px;
}

.message {
  margin-top: 20px;
  padding: 12px;
  border-radius: 10px;
}

.message.success {
  background: #166534;
}

.message.error {
  background: #7f1d1d;
}

.sync-status {
  margin: 16px 0;
  padding: 14px;
  border-radius: 12px;
  background: #1c2431;
  border: 1px solid #334155;
  display: grid;
  gap: 6px;
}

.sync-error {
  color: #fca5a5;
}

.sync-log-list {
  margin-top: 18px;
  display: grid;
  gap: 10px;
}

.sync-log-item {
  padding: 12px;
  border-radius: 12px;
  background: #141b25;
  border: 1px solid #293548;
}

.sync-log-item p,
.sync-log-item small {
  margin: 6px 0 0;
}

@media (max-width: 900px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .settings-header,
  .settings-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .sync-grid,
  .sync-actions {
    grid-template-columns: 1fr;
  }
}
</style>
