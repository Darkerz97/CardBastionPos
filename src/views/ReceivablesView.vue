<template>
  <div class="receivables-layout">
    <header class="receivables-header">
      <div>
        <h1>Cuentas por cobrar</h1>
        <p>Ventas pendientes, parciales y registro de abonos</p>
      </div>

      <button class="back-btn" @click="$router.push('/')">
        Volver al POS
      </button>
    </header>

    <section v-if="summary" class="summary-grid">
      <div class="summary-card">
        <span>Cuentas abiertas</span>
        <strong>{{ summary.summary.openReceivables }}</strong>
      </div>
      <div class="summary-card">
        <span>Saldo total por cobrar</span>
        <strong>${{ formatMoney(summary.summary.totalDue) }}</strong>
      </div>
      <div class="summary-card">
        <span>Ventas parciales</span>
        <strong>{{ summary.summary.partialSales }}</strong>
      </div>
      <div class="summary-card">
        <span>Ventas pendientes</span>
        <strong>{{ summary.summary.pendingSales }}</strong>
      </div>
      <div class="summary-card">
        <span>Vencidas</span>
        <strong>{{ summary.summary.overdueCount }}</strong>
      </div>
      <div class="summary-card">
        <span>Abonos hoy</span>
        <strong>${{ formatMoney(summary.paymentsToday.totalAmount) }}</strong>
      </div>
    </section>

    <section class="filters-card">
      <div>
        <label>Estado</label>
        <select v-model="filters.status" class="input" @change="loadReceivables">
          <option value="">Todas</option>
          <option value="pending">Pendientes</option>
          <option value="partial">Parciales</option>
          <option value="paid">Pagadas</option>
        </select>
      </div>

      <div>
        <label>Cliente</label>
        <select v-model="filters.customerId" class="input" @change="loadReceivables">
          <option value="">Todos</option>
          <option v-for="c in customers" :key="c.id" :value="String(c.id)">
            {{ c.name }}
          </option>
        </select>
      </div>

      <div>
        <label>Desde</label>
        <input v-model="filters.dateFrom" class="input" type="date" @change="loadReceivables" />
      </div>

      <div>
        <label>Hasta</label>
        <input v-model="filters.dateTo" class="input" type="date" @change="loadReceivables" />
      </div>

      <div>
        <label>Vencidas</label>
        <select v-model="filters.overdueOnly" class="input" @change="loadReceivables">
          <option :value="false">No</option>
          <option :value="true">Si</option>
        </select>
      </div>

      <button class="primary-btn" @click="loadReceivables">Actualizar</button>
    </section>

    <section class="table-card">
      <div class="table-header">
        <h2>Listado</h2>
        <span>{{ receivables.length }} registros</span>
      </div>

      <div v-if="receivables.length" class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Pagado</th>
              <th>Pendiente</th>
              <th>Estado</th>
              <th>Vencimiento</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in receivables" :key="row.id">
              <td>{{ row.folio }}</td>
              <td>{{ row.customerName || 'Publico general' }}</td>
              <td>{{ formatDate(row.createdAt) }}</td>
              <td>${{ formatMoney(row.total) }}</td>
              <td>${{ formatMoney(row.amountPaid) }}</td>
              <td>${{ formatMoney(row.amountDue) }}</td>
              <td>{{ formatStatus(row.paymentStatus) }}</td>
              <td>{{ formatDate(row.dueDate) || 'N/D' }}</td>
              <td class="actions-cell">
                <button class="small-btn" @click="openDetail(row.id)">Ver detalle</button>
                <button class="small-btn" :disabled="row.amountDue <= 0" @click="openPaymentModal(row)">Registrar abono</button>
                <button class="small-btn" :disabled="row.amountDue <= 0" @click="liquidate(row)">Liquidar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">No hay cuentas por mostrar con los filtros actuales.</div>
    </section>

    <div v-if="showDetail && detail" class="modal-overlay" @click.self="closeDetail">
      <div class="modal-card large">
        <div class="modal-header">
          <h3>Detalle {{ detail.receivable.folio }}</h3>
          <button class="close-btn" @click="closeDetail">Cerrar</button>
        </div>

        <div class="detail-grid">
          <div>
            <p><strong>Cliente:</strong> {{ detail.receivable.customerName || 'Publico general' }}</p>
            <p><strong>Estado:</strong> {{ formatStatus(detail.receivable.paymentStatus) }}</p>
            <p><strong>Total:</strong> ${{ formatMoney(detail.receivable.total) }}</p>
            <p><strong>Pagado:</strong> ${{ formatMoney(detail.receivable.amountPaid) }}</p>
            <p><strong>Pendiente:</strong> ${{ formatMoney(detail.receivable.amountDue) }}</p>
            <p><strong>Vencimiento:</strong> {{ formatDate(detail.receivable.dueDate) || 'N/D' }}</p>
          </div>

          <div>
            <h4>Pagos / Abonos</h4>
            <div v-if="detail.payments.length" class="payments-list">
              <div v-for="p in detail.payments" :key="p.id" class="payment-row">
                <div>
                  <strong>${{ formatMoney(p.amount) }}</strong>
                  <p>{{ formatPayment(p.paymentMethod) }}</p>
                </div>
                <div>
                  <small>{{ p.isInitial ? 'Pago inicial' : 'Abono' }}</small>
                  <small>{{ formatDate(p.createdAt) }}</small>
                </div>
              </div>
            </div>
            <div v-else class="empty-state small">Sin pagos registrados.</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPayment && selectedReceivable" class="modal-overlay" @click.self="closePaymentModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Registrar abono</h3>
          <button class="close-btn" @click="closePaymentModal">Cerrar</button>
        </div>

        <p><strong>Folio:</strong> {{ selectedReceivable.folio }}</p>
        <p><strong>Cliente:</strong> {{ selectedReceivable.customerName || 'Publico general' }}</p>
        <p><strong>Pendiente:</strong> ${{ formatMoney(selectedReceivable.amountDue) }}</p>

        <label>Monto</label>
        <input v-model.number="paymentForm.amount" class="input" type="number" min="0" step="0.01" />

        <label>Metodo</label>
        <select v-model="paymentForm.paymentMethod" class="input">
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
        </select>

        <label>Notas</label>
        <textarea v-model="paymentForm.notes" class="input" rows="3" placeholder="Observaciones del abono" />

        <div v-if="errorMessage" class="error-box">{{ errorMessage }}</div>

        <button class="primary-btn" @click="savePayment">Guardar abono</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

const receivables = ref([])
const customers = ref([])
const summary = ref(null)
const detail = ref(null)
const showDetail = ref(false)
const showPayment = ref(false)
const selectedReceivable = ref(null)
const errorMessage = ref('')

const filters = reactive({
  status: '',
  customerId: '',
  dateFrom: '',
  dateTo: '',
  overdueOnly: false,
})

const paymentForm = reactive({
  amount: 0,
  paymentMethod: 'cash',
  notes: '',
})

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function formatStatus(status) {
  if (status === 'paid') return 'Pagado'
  if (status === 'partial') return 'Parcial'
  if (status === 'pending') return 'Pendiente'
  return status || 'N/D'
}

function formatPayment(method) {
  if (method === 'cash') return 'Efectivo'
  if (method === 'card') return 'Tarjeta'
  if (method === 'transfer') return 'Transferencia'
  return method || 'N/D'
}

async function loadCustomers() {
  customers.value = await window.posAPI.getCustomers()
}

async function loadSummary() {
  summary.value = await window.posAPI.getReceivablesSummary()
}

async function loadReceivables() {
  errorMessage.value = ''

  receivables.value = await window.posAPI.getReceivables({
    status: filters.status || undefined,
    customerId: filters.customerId ? Number(filters.customerId) : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    overdueOnly: Boolean(filters.overdueOnly),
  })
}

async function openDetail(saleId) {
  detail.value = await window.posAPI.getReceivableById(saleId)
  showDetail.value = true
}

function closeDetail() {
  showDetail.value = false
  detail.value = null
}

function openPaymentModal(row) {
  errorMessage.value = ''
  selectedReceivable.value = row
  paymentForm.amount = Number(row.amountDue || 0)
  paymentForm.paymentMethod = 'cash'
  paymentForm.notes = ''
  showPayment.value = true
}

function closePaymentModal() {
  showPayment.value = false
  selectedReceivable.value = null
}

function liquidate(row) {
  openPaymentModal(row)
  paymentForm.amount = Number(row.amountDue || 0)
  paymentForm.notes = 'Liquidacion de saldo'
}

async function savePayment() {
  try {
    errorMessage.value = ''

    if (!selectedReceivable.value) return

    await window.posAPI.addReceivablePayment({
      saleId: Number(selectedReceivable.value.id),
      amount: Number(paymentForm.amount || 0),
      paymentMethod: String(paymentForm.paymentMethod || 'cash'),
      notes: String(paymentForm.notes || ''),
    })

    closePaymentModal()
    await Promise.all([
      loadReceivables(),
      loadSummary(),
    ])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo registrar el abono.'
  }
}

onMounted(async () => {
  await Promise.all([
    loadCustomers(),
    loadSummary(),
    loadReceivables(),
  ])
})
</script>

<style scoped>
.receivables-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.receivables-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.receivables-header h1 {
  margin: 0;
  color: #f2b138;
}

.receivables-header p {
  margin: 4px 0 0 0;
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.summary-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 14px;
  padding: 14px;
}

.summary-card span {
  display: block;
  color: #9ca3af;
}

.summary-card strong {
  color: #22c55e;
  font-size: 22px;
}

.filters-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 14px;
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  align-items: end;
  margin-bottom: 16px;
}

.input {
  width: 100%;
  margin-top: 6px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
}

.primary-btn {
  border: none;
  border-radius: 10px;
  padding: 10px;
  background: #2563eb;
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.table-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 14px;
  padding: 14px;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.table-wrap {
  overflow: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
}

.report-table th,
.report-table td {
  border-bottom: 1px solid #3a3a3a;
  padding: 10px;
  text-align: left;
}

.actions-cell {
  display: flex;
  gap: 6px;
}

.small-btn {
  border: none;
  border-radius: 8px;
  padding: 7px 10px;
  background: #334155;
  color: #f8fafc;
  cursor: pointer;
  font-size: 12px;
}

.small-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-state {
  color: #9ca3af;
  padding: 16px;
  text-align: center;
}

.empty-state.small {
  padding: 8px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 60;
}

.modal-card {
  width: min(640px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 14px;
  padding: 16px;
}

.modal-card.large {
  width: min(960px, 100%);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.close-btn {
  border: none;
  border-radius: 8px;
  background: #4b5563;
  color: white;
  padding: 7px 10px;
  cursor: pointer;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.payments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.payment-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  background: #273244;
  border-radius: 10px;
  padding: 10px;
}

.payment-row p,
.payment-row small {
  margin: 4px 0 0 0;
  display: block;
  color: #cbd5e1;
}

.error-box {
  margin: 10px 0;
  padding: 10px;
  background: #7f1d1d;
  border-radius: 8px;
}

@media (max-width: 1200px) {
  .summary-grid,
  .filters-card {
    grid-template-columns: repeat(3, 1fr);
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 780px) {
  .summary-grid,
  .filters-card {
    grid-template-columns: 1fr;
  }
}
</style>
