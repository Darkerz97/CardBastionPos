<template>
  <div class="receivables-layout">
    <header class="receivables-header">
      <div>
        <h1>Cuentas por cobrar</h1>
        <p>Agrupadas por cliente para cobrar en un solo pago</p>
      </div>
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
        <h2>Clientes con saldo pendiente</h2>
        <span>{{ groupedReceivables.length }} clientes</span>
      </div>

      <div v-if="groupedReceivables.length" class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Tel�fono</th>
              <th>Ventas abiertas</th>
              <th>Total pendiente</th>
              <th>Vencidas</th>
              <th>�ltima venta</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groupedReceivables" :key="group.customerId">
              <td>{{ group.customerName }}</td>
              <td>{{ group.customerPhone || 'Sin tel�fono' }}</td>
              <td>{{ group.openSales }}</td>
              <td>${{ formatMoney(group.totalDue) }}</td>
              <td>{{ group.overdueSales }}</td>
              <td>{{ formatDate(group.lastSaleAt) || 'N/D' }}</td>
              <td class="actions-cell">
                <button class="small-btn" @click="openCustomerDetail(group)">Ver ventas</button>
                <button class="small-btn" @click="openCustomerPaymentModal(group)">Cobro �nico</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">No hay cuentas por mostrar con los filtros actuales.</div>
    </section>

    <div v-if="showCustomerDetail && customerDetail" class="modal-overlay" @click.self="closeCustomerDetail">
      <div class="modal-card large">
        <div class="modal-header">
          <h3>Detalle por cliente</h3>
          <button class="close-btn" @click="closeCustomerDetail">Cerrar</button>
        </div>

        <p><strong>Cliente:</strong> {{ customerDetail.customerName }}</p>
        <p><strong>Saldo total:</strong> ${{ formatMoney(customerDetail.totalDue) }}</p>

        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Articulos</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Pendiente</th>
                <th>Estado</th>
                <th>Acci�n</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sale in customerDetail.sales" :key="sale.id">
                <td>{{ sale.folio }}</td>
                <td>{{ formatDate(sale.createdAt) }}</td>
                <td>{{ sale.itemsSummary || 'Sin articulos' }}</td>
                <td>${{ formatMoney(sale.total) }}</td>
                <td>${{ formatMoney(sale.amountPaid) }}</td>
                <td>${{ formatMoney(sale.amountDue) }}</td>
                <td>{{ formatStatus(sale.paymentStatus) }}</td>
                <td><button class="small-btn" @click="openSaleDetail(sale.id)">Detalle</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="showSaleDetail && saleDetail" class="modal-overlay" @click.self="closeSaleDetail">
      <div class="modal-card large">
        <div class="modal-header">
          <h3>Detalle {{ saleDetail.receivable.folio }}</h3>
          <button class="close-btn" @click="closeSaleDetail">Cerrar</button>
        </div>

        <div class="detail-grid">
          <div>
            <p><strong>Cliente:</strong> {{ saleDetail.receivable.customerName || 'Publico general' }}</p>
            <p><strong>Estado:</strong> {{ formatStatus(saleDetail.receivable.paymentStatus) }}</p>
            <p><strong>Total:</strong> ${{ formatMoney(saleDetail.receivable.total) }}</p>
            <p><strong>Pagado:</strong> ${{ formatMoney(saleDetail.receivable.amountPaid) }}</p>
            <p><strong>Pendiente:</strong> ${{ formatMoney(saleDetail.receivable.amountDue) }}</p>
            <p><strong>Articulos:</strong> {{ saleDetail.receivable.itemsSummary || 'Sin articulos' }}</p>
          </div>

          <div>
            <h4>Articulos de la venta</h4>
            <div v-if="saleDetail.items.length" class="payments-list">
              <div v-for="item in saleDetail.items" :key="item.id" class="payment-row">
                <div>
                  <strong>{{ item.productName }}</strong>
                  <p>{{ item.sku || 'Sin SKU' }}</p>
                </div>
                <div>
                  <small>Cantidad: {{ item.qty }}</small>
                  <small>${{ formatMoney(item.lineTotal) }}</small>
                </div>
              </div>
            </div>
            <div v-else class="empty-state small">Sin articulos registrados.</div>
          </div>

          <div>
            <h4>Pagos / Abonos</h4>
            <div v-if="saleDetail.payments.length" class="payments-list">
              <div v-for="p in saleDetail.payments" :key="p.id" class="payment-row">
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

    <div v-if="showCustomerPayment && selectedCustomerGroup" class="modal-overlay" @click.self="closeCustomerPaymentModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Cobro �nico por cliente</h3>
          <button class="close-btn" @click="closeCustomerPaymentModal">Cerrar</button>
        </div>

        <p><strong>Cliente:</strong> {{ selectedCustomerGroup.customerName }}</p>
        <p><strong>Saldo total pendiente:</strong> ${{ formatMoney(selectedCustomerGroup.totalDue) }}</p>

        <label>Monto</label>
        <input v-model.number="paymentForm.amount" class="input" type="number" min="0" step="0.01" />

        <label>M�todo</label>
        <select v-model="paymentForm.paymentMethod" class="input">
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
        </select>

        <label>Notas</label>
        <textarea v-model="paymentForm.notes" class="input" rows="3" placeholder="Observaciones del cobro" />

        <div v-if="errorMessage" class="error-box">{{ errorMessage }}</div>

        <button class="primary-btn" @click="saveCustomerPayment">Registrar cobro</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const receivables = ref([])
const customers = ref([])
const summary = ref(null)
const errorMessage = ref('')

const showCustomerDetail = ref(false)
const customerDetail = ref(null)

const showSaleDetail = ref(false)
const saleDetail = ref(null)

const showCustomerPayment = ref(false)
const selectedCustomerGroup = ref(null)

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

const groupedReceivables = computed(() => {
  const map = new Map()

  for (const row of receivables.value || []) {
    if (!row.customerId) continue

    const existing = map.get(row.customerId) || {
      customerId: row.customerId,
      customerName: row.customerName || 'Sin nombre',
      customerPhone: row.customerPhone || '',
      openSales: 0,
      overdueSales: 0,
      totalDue: 0,
      totalPaid: 0,
      lastSaleAt: '',
      sales: [],
    }

    existing.openSales += 1
    existing.totalDue += Number(row.amountDue || 0)
    existing.totalPaid += Number(row.amountPaid || 0)
    existing.sales.push(row)

    if (row.isOverdue) {
      existing.overdueSales += 1
    }

    if (!existing.lastSaleAt || new Date(row.createdAt).getTime() > new Date(existing.lastSaleAt).getTime()) {
      existing.lastSaleAt = row.createdAt
    }

    map.set(row.customerId, existing)
  }

  return Array.from(map.values()).sort((a, b) => Number(b.totalDue || 0) - Number(a.totalDue || 0))
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

  receivables.value = (receivables.value || []).filter((row) => Number(row.amountDue || 0) > 0)
}

function openCustomerDetail(group) {
  customerDetail.value = {
    customerId: group.customerId,
    customerName: group.customerName,
    totalDue: group.totalDue,
    sales: [...group.sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }
  showCustomerDetail.value = true
}

function closeCustomerDetail() {
  showCustomerDetail.value = false
  customerDetail.value = null
}

async function openSaleDetail(saleId) {
  saleDetail.value = await window.posAPI.getReceivableById(saleId)
  showSaleDetail.value = true
}

function closeSaleDetail() {
  showSaleDetail.value = false
  saleDetail.value = null
}

function openCustomerPaymentModal(group) {
  errorMessage.value = ''
  selectedCustomerGroup.value = group
  paymentForm.amount = Number(group.totalDue || 0)
  paymentForm.paymentMethod = 'cash'
  paymentForm.notes = 'Cobro �nico por cliente'
  showCustomerPayment.value = true
}

function closeCustomerPaymentModal() {
  showCustomerPayment.value = false
  selectedCustomerGroup.value = null
}

async function saveCustomerPayment() {
  try {
    errorMessage.value = ''

    if (!selectedCustomerGroup.value) return

    await window.posAPI.addCustomerReceivablePayment({
      customerId: Number(selectedCustomerGroup.value.customerId),
      amount: Number(paymentForm.amount || 0),
      paymentMethod: String(paymentForm.paymentMethod || 'cash'),
      notes: String(paymentForm.notes || ''),
    })

    closeCustomerPaymentModal()

    await Promise.all([
      loadReceivables(),
      loadSummary(),
    ])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo registrar el cobro.'
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
