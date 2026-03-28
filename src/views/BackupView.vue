<template>
  <div class="backup-layout">
    <header class="backup-header">
      <div>
        <h1>Respaldo</h1>
        <p>Protege y restaura la base de datos local del POS</p>
      </div>
    </header>

    <section class="backup-grid">
      <div class="card">
        <h2>Base de datos actual</h2>

        <div v-if="dbInfo" class="info-block">
          <div class="info-row">
            <span>Existe</span>
            <strong>{{ dbInfo.exists ? 'Si' : 'No' }}</strong>
          </div>

          <div class="info-row">
            <span>Ruta</span>
            <strong class="small-text">{{ dbInfo.dbPath }}</strong>
          </div>

          <div v-if="dbInfo.exists" class="info-row">
            <span>Tamano</span>
            <strong>{{ formatBytes(dbInfo.size) }}</strong>
          </div>

          <div v-if="dbInfo.exists" class="info-row">
            <span>Ultima modificacion</span>
            <strong>{{ formatDate(dbInfo.modifiedAt) }}</strong>
          </div>

          <div class="info-row">
            <span>Imagenes de productos</span>
            <strong>{{ dbInfo.imagesCount || 0 }}</strong>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Crear respaldo completo</h2>
        <p>Guarda base de datos, ventas, clientes, usuarios e imagenes de productos.</p>

        <button class="primary-btn" @click="handleCreateBackup">
          Crear respaldo
        </button>
      </div>

      <div class="card danger-card">
        <h2>Restaurar respaldo</h2>
        <p>
          Restaura un respaldo completo o un SQLite antiguo. Esto reemplazara la base actual del POS.
        </p>

        <button class="danger-btn" @click="handleRestoreBackup">
          Restaurar respaldo
        </button>
      </div>
    </section>

    <div v-if="message" class="message success">
      {{ message }}
    </div>

    <div v-if="errorMessage" class="message error">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { formatDateTimeInPosTimeZone } from '../utils/datetime'

const dbInfo = ref(null)
const message = ref('')
const errorMessage = ref('')

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

function formatDate(value) {
  return formatDateTimeInPosTimeZone(value)
}

function formatBytes(bytes) {
  const size = Number(bytes || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

async function loadDbInfo() {
  try {
    dbInfo.value = await window.posAPI.getDbInfo()
  } catch (error) {
    console.error(error)
    errorMessage.value = error?.message || 'No se pudo leer la informacion de la base.'
  }
}

async function handleCreateBackup() {
  try {
    clearMessages()

    const result = await window.posAPI.createBackup()

    if (result?.canceled) return

    if (result?.success) {
      const imagesText = result?.includes?.images
        ? ` Incluye ${result.imagesFileCount || 0} imagen(es) de producto.`
        : ''

      message.value = `Respaldo completo guardado en: ${result.filePath}.${imagesText}`
      await loadDbInfo()
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error?.message || 'No se pudo crear el respaldo.'
  }
}

async function handleRestoreBackup() {
  const confirmed = window.confirm(
    'Seguro que deseas restaurar un respaldo? Esto reemplazara la base actual.'
  )

  if (!confirmed) return

  try {
    clearMessages()

    const result = await window.posAPI.restoreBackup()

    if (result?.canceled) return

    if (result?.success) {
      const imagesText = result?.restoredImages
        ? ' Tambien se restauraron las imagenes de productos.'
        : ''

      message.value = `Respaldo restaurado desde: ${result.restoredFrom}.${imagesText}`
      await loadDbInfo()
      alert('Respaldo restaurado. Reinicia la app para asegurar que todo quede recargado.')
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error?.message || 'No se pudo restaurar el respaldo.'
  }
}

onMounted(async () => {
  await loadDbInfo()
})
</script>

<style scoped>
.backup-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.backup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.backup-header h1 {
  margin: 0;
  color: #f2b138;
}

.backup-header p {
  margin: 6px 0 0 0;
  color: #bcbcbc;
}

.back-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  background: #f29a2e;
  color: #111;
  font-weight: 700;
  cursor: pointer;
}

.backup-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

.card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
}

.card h2 {
  margin-top: 0;
  color: #f2b138;
}

.danger-card {
  border-color: #7f1d1d;
}

.info-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}

.small-text {
  max-width: 70%;
  text-align: right;
  word-break: break-all;
}

.primary-btn,
.danger-btn {
  margin-top: 12px;
  border: none;
  border-radius: 12px;
  padding: 14px 16px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  background: #2563eb;
  color: white;
}

.danger-btn {
  background: #b91c1c;
  color: white;
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
</style>
