<template>
  <div class="cash-layout">
    <header class="cash-header">
      <div>
        <h1>Caja</h1>
        <p>Apertura y cierre de caja</p>
      </div>

      <button class="back-btn" @click="$router.push('/')">
        Volver al POS
      </button>
    </header>

    <section v-if="!openSession" class="cash-card">
      <h2>Abrir caja</h2>
      <p>Ingresa el monto inicial en efectivo.</p>

      <input
        v-model.number="openingAmount"
        type="number"
        min="0"
        step="0.01"
        class="cash-input"
        placeholder="0.00"
      />

      <div v-if="errorMessage" class="error-box">
        {{ errorMessage }}
      </div>

      <button class="primary-btn" @click="handleOpenSession">
        Abrir caja
      </button>
    </section>

    <section v-else class="cash-grid">
      <div class="cash-card">
        <h2>Caja abierta</h2>

        <div class="summary-row">
          <span>Abierta desde</span>
          <strong>{{ formatDate(summary?.openedAt) }}</strong>
        </div>
        <div class="summary-row">
          <span>Monto inicial</span>
          <strong>${{ formatPrice(summary?.openingAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Ventas</span>
          <strong>{{ summary?.totalSales || 0 }}</strong>
        </div>
        <div class="summary-row">
          <span>Total vendido</span>
          <strong>${{ formatPrice(summary?.totalSalesAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Crédito usado</span>
          <strong>${{ formatPrice(summary?.totalCreditUsed) }}</strong>
        </div>
        <div class="summary-row">
          <span>Venta bruta</span>
          <strong>${{ formatPrice(summary?.grossSalesAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Ventas en efectivo</span>
          <strong>${{ formatPrice(summary?.cashSalesAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Ventas con tarjeta</span>
          <strong>${{ formatPrice(summary?.cardSalesAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Abonos cobrados</span>
          <strong>{{ summary?.receivablePaymentsCount || 0 }}</strong>
        </div>
        <div class="summary-row">
          <span>Abonos en efectivo</span>
          <strong>${{ formatPrice(summary?.receivableCashAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Abonos con tarjeta</span>
          <strong>${{ formatPrice(summary?.receivableCardAmount) }}</strong>
        </div>
        <div class="summary-row total">
          <span>Efectivo esperado</span>
          <strong>${{ formatPrice(summary?.expectedAmount) }}</strong>
        </div>
      </div>

      <div class="cash-card">
        <h2>Cerrar caja</h2>

        <label>Efectivo contado</label>
        <input
          v-model.number="closingAmount"
          type="number"
          min="0"
          step="0.01"
          class="cash-input"
          placeholder="0.00"
        />

        <label>Notas</label>
        <textarea
          v-model="notes"
          class="cash-textarea"
          placeholder="Observaciones del cierre"
        />

        <div v-if="predictedDifference !== null" class="summary-row total">
          <span>Diferencia estimada</span>
          <strong>${{ formatPrice(predictedDifference) }}</strong>
        </div>

        <div v-if="errorMessage" class="error-box">
          {{ errorMessage }}
        </div>

        <button class="danger-btn" @click="handleCloseSession">
          Cerrar caja
        </button>
      </div>
    </section>

    <section v-if="closeResult" class="cash-card result-card">
      <h2>Resumen de cierre</h2>

      <div class="summary-row">
        <span>Monto inicial</span>
        <strong>${{ formatPrice(closeResult.openingAmount) }}</strong>
      </div>
      <div class="summary-row">
        <span>Ventas totales</span>
        <strong>{{ closeResult.totalSales }}</strong>
      </div>
      <div class="summary-row">
        <span>Total vendido</span>
        <strong>${{ formatPrice(closeResult.totalSalesAmount) }}</strong>
      </div>
      <div class="summary-row">
        <span>Crédito usado</span>
        <strong>${{ formatPrice(closeResult.totalCreditUsed) }}</strong>
      </div>
      <div class="summary-row">
        <span>Venta bruta</span>
        <strong>${{ formatPrice(closeResult.grossSalesAmount) }}</strong>
      </div>
      <div class="summary-row">
        <span>Efectivo esperado</span>
        <strong>${{ formatPrice(closeResult.expectedAmount) }}</strong>
      </div>
      <div class="summary-row">
        <span>Abonos en efectivo</span>
        <strong>${{ formatPrice(closeResult.receivableCashAmount) }}</strong>
      </div>
      <div class="summary-row">
        <span>Abonos con tarjeta</span>
        <strong>${{ formatPrice(closeResult.receivableCardAmount) }}</strong>
      </div>
      <div class="summary-row">
        <span>Efectivo contado</span>
        <strong>${{ formatPrice(closeResult.closingAmount) }}</strong>
      </div>
      <div class="summary-row total">
        <span>Diferencia</span>
        <strong>${{ formatPrice(closeResult.difference) }}</strong>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

const openSession = ref(null)
const summary = ref(null)
const openingAmount = ref(0)
const closingAmount = ref(0)
const notes = ref('')
const errorMessage = ref('')
const closeResult = ref(null)

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

const predictedDifference = computed(() => {
  if (!summary.value) return null
  return Number(closingAmount.value || 0) - Number(summary.value.expectedAmount || 0)
})

async function loadCashState() {
  errorMessage.value = ''
  openSession.value = await window.posAPI.getOpenCashSession()
  summary.value = await window.posAPI.getCurrentCashSummary()
}

async function handleOpenSession() {
  try {
    errorMessage.value = ''
    closeResult.value = null

    await window.posAPI.openCashSession(Number(openingAmount.value || 0))
    await loadCashState()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo abrir la caja.'
  }
}

async function handleCloseSession() {
  try {
    errorMessage.value = ''

    const result = await window.posAPI.closeCashSession({
      closingAmount: Number(closingAmount.value || 0),
      notes: String(notes.value || ''),
    })

    if (result?.success) {
      closeResult.value = result.summary
      closingAmount.value = 0
      notes.value = ''
      await loadCashState()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo cerrar la caja.'
  }
}

onMounted(async () => {
  await loadCashState()
})
</script>

<style scoped>
.cash-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.cash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.cash-header h1 {
  margin: 0;
  color: #f2b138;
}

.cash-header p {
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

.cash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.cash-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
  margin-bottom: 20px;
}

.cash-card h2 {
  margin-top: 0;
  color: #f2b138;
}

.cash-input,
.cash-textarea {
  width: 100%;
  margin-top: 8px;
  margin-bottom: 16px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
  font-size: 16px;
}

.cash-textarea {
  min-height: 120px;
  resize: vertical;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.summary-row.total {
  margin-top: 16px;
  font-size: 20px;
  color: #f2b138;
}

.primary-btn,
.danger-btn {
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 16px;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  background: #22c55e;
  color: white;
}

.danger-btn {
  background: #dc2626;
  color: white;
}

.error-box {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 10px;
  background: #7f1d1d;
  color: white;
}

.result-card {
  border-color: #166534;
}
</style>
