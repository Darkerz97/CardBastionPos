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
import { computed, onMounted, reactive, ref } from 'vue'

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
    const data = await window.posAPI.getPosCustomization()
    Object.assign(form, data || {})
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo cargar la configuracion.'
  }
}

async function saveSettings() {
  try {
    clearMessages()
    const result = await window.posAPI.updatePosCustomization({ ...form })
    if (result?.success) {
      Object.assign(form, result.customization || {})
      message.value = 'Configuracion guardada correctamente.'
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo guardar la configuracion.'
  }
}

onMounted(async () => {
  await loadSettings()
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

@media (max-width: 900px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .settings-header,
  .settings-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
