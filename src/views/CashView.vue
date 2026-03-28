<template>
  <div class="cash-layout">
    <header class="cash-header">
      <div>
        <h1>Caja</h1>
        <p>Apertura, cierre y administracion de cierres</p>
      </div>
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
          <span>Ventas en efectivo</span>
          <strong>${{ formatPrice(summary?.cashSalesAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Abonos en efectivo</span>
          <strong>${{ formatPrice(summary?.receivableCashAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Preventas en efectivo</span>
          <strong>${{ formatPrice(summary?.preorderCashAmount) }}</strong>
        </div>
        <div class="summary-row">
          <span>Retiros de efectivo</span>
          <strong>${{ formatPrice(summary?.withdrawalTotalAmount) }}</strong>
        </div>
        <div class="summary-row total">
          <span>Efectivo esperado</span>
          <strong>${{ formatPrice(summary?.expectedAmount) }}</strong>
        </div>
      </div>

      <div class="cash-card">
        <h2>Retiro de efectivo</h2>

        <label>Monto</label>
        <input
          v-model.number="withdrawal.amount"
          type="number"
          min="0"
          step="0.01"
          class="cash-input"
          placeholder="0.00"
        />

        <label>Motivo</label>
        <input
          v-model="withdrawal.reason"
          type="text"
          class="cash-input"
          placeholder="Ej. pago de proveedor"
        />

        <label>Firma</label>
        <input
          v-model="withdrawal.signature"
          type="text"
          class="cash-input"
          placeholder="Nombre y firma de quien autoriza"
        />

        <label>Notas</label>
        <textarea
          v-model="withdrawal.notes"
          class="cash-textarea"
          placeholder="Notas opcionales"
        />

        <button class="secondary-btn" @click="handleAddWithdrawal">
          Registrar retiro
        </button>
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
        <span>Efectivo esperado</span>
        <strong>${{ formatPrice(closeResult.expectedAmount) }}</strong>
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

    <section class="cash-card">
      <div class="panel-head">
        <h2>Retiros registrados</h2>
        <span>{{ cashMovements.length }} movimientos</span>
      </div>

      <div v-if="cashMovements.length" class="sessions-list">
        <div v-for="movement in cashMovements" :key="movement.id" class="session-row">
          <div>
            <strong>{{ formatMovementType(movement.type) }}</strong>
            <p>{{ movement.reason }}</p>
            <small>Firma: {{ movement.signature }}</small>
            <small v-if="movement.createdBy">Registrado por: {{ movement.createdBy }}</small>
          </div>
          <div class="session-meta">
            <span>${{ formatPrice(movement.amount) }}</span>
            <small>{{ formatDate(movement.createdAt) }}</small>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        No hay retiros registrados en la caja abierta.
      </div>
    </section>

    <section class="cash-card">
      <div class="panel-head">
        <h2>Cierres registrados</h2>
        <span>{{ sessions.length }} sesiones</span>
      </div>

      <div v-if="sessions.length" class="sessions-list">
        <div v-for="session in sessions" :key="session.id" class="session-row">
          <div>
            <strong>Caja #{{ session.id }}</strong>
            <p>Apertura: {{ formatDate(session.openedAt) }}</p>
            <small v-if="session.closedAt">Cierre: {{ formatDate(session.closedAt) }}</small>
            <small v-else>Sesion abierta</small>
          </div>
          <div class="session-meta">
            <span>${{ formatPrice(session.openingAmount) }} inicial</span>
            <span>${{ formatPrice(session.expectedAmount) }} esperado</span>
            <span>${{ formatPrice(session.closingAmount) }} contado</span>
            <span :class="{ diff: session.difference !== 0 }">${{ formatPrice(session.difference) }} diferencia</span>
            <div class="row-actions" v-if="session.status === 'closed'">
              <button class="secondary-btn" @click="openEditSession(session)">Editar</button>
              <button class="danger-btn" @click="handleDeleteSession(session)">Eliminar</button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        No hay cierres registrados.
      </div>
    </section>

    <div v-if="editSession.open" class="modal-backdrop" @click.self="editSession.open = false">
      <div class="modal-card">
        <h3>Editar cierre de caja #{{ editSession.id }}</h3>
        <label>Efectivo contado</label>
        <input v-model.number="editSession.closingAmount" type="number" min="0" step="0.01" class="cash-input" />
        <label>Notas</label>
        <textarea v-model="editSession.notes" class="cash-textarea" />
        <div class="row-actions">
          <button class="secondary-btn" @click="editSession.open = false">Cancelar</button>
          <button class="primary-btn" @click="handleUpdateSession">Guardar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { formatDateTimeInPosTimeZone } from '../utils/datetime'

const openSession = ref(null)
const summary = ref(null)
const sessions = ref([])
const cashMovements = ref([])
const openingAmount = ref(0)
const closingAmount = ref(0)
const notes = ref('')
const errorMessage = ref('')
const closeResult = ref(null)
const withdrawal = reactive({
  amount: 0,
  reason: '',
  signature: '',
  notes: '',
})
const editSession = reactive({
  open: false,
  id: null,
  closingAmount: 0,
  notes: '',
})

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function formatDate(value) {
  return formatDateTimeInPosTimeZone(value)
}

function formatMovementType(type) {
  if (type === 'withdrawal') return 'Retiro'
  return type || 'Movimiento'
}

const predictedDifference = computed(() => {
  if (!summary.value) return null
  return Number(closingAmount.value || 0) - Number(summary.value.expectedAmount || 0)
})

async function loadCashState() {
  errorMessage.value = ''
  const [session, currentSummary, sessionList] = await Promise.all([
    window.posAPI.getOpenCashSession(),
    window.posAPI.getCurrentCashSummary(),
    window.posAPI.getCashSessions(),
  ])
  openSession.value = session
  summary.value = currentSummary
  sessions.value = sessionList || []
  cashMovements.value = session ? (await window.posAPI.getCashMovements()) || [] : []
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

async function handleAddWithdrawal() {
  try {
    errorMessage.value = ''
    const result = await window.posAPI.addCashWithdrawal({
      amount: Number(withdrawal.amount || 0),
      reason: String(withdrawal.reason || ''),
      signature: String(withdrawal.signature || ''),
      notes: String(withdrawal.notes || ''),
    })

    if (result?.success) {
      withdrawal.amount = 0
      withdrawal.reason = ''
      withdrawal.signature = ''
      withdrawal.notes = ''
      await loadCashState()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo registrar el retiro.'
  }
}

function openEditSession(session) {
  editSession.open = true
  editSession.id = session.id
  editSession.closingAmount = Number(session.closingAmount || 0)
  editSession.notes = String(session.notes || '')
}

async function handleUpdateSession() {
  try {
    errorMessage.value = ''
    await window.posAPI.updateCashSession({
      id: editSession.id,
      closingAmount: Number(editSession.closingAmount || 0),
      notes: editSession.notes,
    })
    editSession.open = false
    await loadCashState()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo actualizar el cierre.'
  }
}

async function handleDeleteSession(session) {
  if (!window.confirm(`Eliminar cierre de caja #${session.id}?`)) return

  try {
    errorMessage.value = ''
    await window.posAPI.deleteCashSession({ id: session.id })
    await loadCashState()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo eliminar el cierre.'
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

.cash-header,
.panel-head,
.row-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.cash-header {
  margin-bottom: 20px;
}

.cash-header h1,
.cash-card h2 {
  margin: 0;
  color: #f2b138;
}

.cash-header p {
  margin: 6px 0 0;
  color: #bcbcbc;
}

.back-btn,
.primary-btn,
.secondary-btn,
.danger-btn {
  border: none;
  border-radius: 14px;
  padding: 14px 16px;
  font-weight: 700;
  cursor: pointer;
}

.back-btn {
  background: #f29a2e;
  color: #111;
}

.primary-btn {
  background: #22c55e;
  color: white;
}

.secondary-btn {
  background: #2563eb;
  color: white;
}

.danger-btn {
  background: #dc2626;
  color: white;
}

.cash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.cash-card,
.modal-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
  margin-bottom: 20px;
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

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #2c2c2c;
}

.session-row p,
.session-row small {
  display: block;
  margin: 4px 0 0;
  color: #d4d4d8;
}

.session-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.diff {
  color: #f59e0b;
}

.empty-state {
  color: #bcbcbc;
  padding: 20px 0;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.modal-card {
  width: min(520px, 100%);
}

@media (max-width: 900px) {
  .cash-grid {
    grid-template-columns: 1fr;
  }

  .session-row,
  .row-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .session-meta {
    align-items: stretch;
  }
}
</style>
