<template>
  <div class="customer-history-layout">
    <header class="history-header">
      <div>
        <h1>Historial por cliente</h1>
        <p>Consulta compras, credito y movimientos del cliente</p>
      </div>
      <button class="back-btn" @click="$router.push('/customers')">
        Volver a clientes
      </button>
    </header>

    <section class="history-grid">
      <div class="card">
        <div class="list-header">
          <h2>Clientes</h2>
          <span>{{ customers.length }} registros</span>
        </div>

        <input
          v-model="search"
          class="input"
          placeholder="Buscar cliente..."
          @input="handleSearch"
        />

        <div v-if="customers.length" class="customer-list">
          <div
            v-for="customer in customers"
            :key="customer.id"
            class="customer-row"
            :class="{ active: selectedCustomerId === customer.id }"
            @click="selectCustomer(customer.id)"
          >
            <div>
              <strong>{{ customer.name }}</strong>
              <p>{{ customer.phone || 'Sin telefono' }}</p>
              <small>{{ customer.email || 'Sin email' }}</small>
            </div>

            <div class="customer-meta">
              <span>{{ customer.points || 0 }} pts</span>
              <small>Credito: ${{ formatMoney(customer.store_credit) }}</small>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          No hay clientes.
        </div>
      </div>

      <div class="card">
        <div v-if="historyData?.customer">
          <div class="detail-header">
            <h2>{{ historyData.customer.name }}</h2>
            <span>{{ historyData.customer.points }} pts</span>
          </div>

          <div class="customer-data">
            <p><strong>Telefono:</strong> {{ historyData.customer.phone || 'Sin telefono' }}</p>
            <p><strong>Email:</strong> {{ historyData.customer.email || 'Sin email' }}</p>
            <p><strong>Credito actual:</strong> ${{ formatMoney(historyData.customer.storeCredit) }}</p>
            <p><strong>Notas:</strong> {{ historyData.customer.notes || 'Sin notas' }}</p>
          </div>

          <div class="summary-grid">
            <div class="summary-card">
              <span>Saldo actual</span>
              <strong>${{ formatMoney(historyData.customer.storeCredit) }}</strong>
            </div>

            <div class="summary-card">
              <span>Compras</span>
              <strong>{{ historyData.summary.totalSales }}</strong>
            </div>

            <div class="summary-card">
              <span>Total cobrado</span>
              <strong>${{ formatMoney(historyData.summary.totalSpent) }}</strong>
            </div>

            <div class="summary-card">
              <span>Usos de credito</span>
              <strong>${{ formatMoney(historyData.summary.totalCreditMovementUsed) }}</strong>
            </div>

            <div class="summary-card">
              <span>Venta bruta</span>
              <strong>${{ formatMoney(historyData.summary.grossSpent) }}</strong>
            </div>

            <div class="summary-card">
              <span>Ticket promedio</span>
              <strong>${{ formatMoney(historyData.summary.averageTicket) }}</strong>
            </div>

            <div class="summary-card">
              <span>Ventas con credito</span>
              <strong>{{ historyData.summary.salesWithCredit }}</strong>
            </div>

            <div class="summary-card">
              <span>Abonos de credito</span>
              <strong>${{ formatMoney(historyData.summary.totalCreditEarned) }}</strong>
            </div>

            <div class="summary-card">
              <span>Ventas parciales</span>
              <strong>{{ historyData.summary.partialSales || 0 }}</strong>
            </div>

            <div class="summary-card">
              <span>Ventas pendientes</span>
              <strong>{{ historyData.summary.pendingSales || 0 }}</strong>
            </div>

            <div class="summary-card">
              <span>Saldo por cobrar</span>
              <strong>${{ formatMoney(historyData.summary.totalPendingBalance || 0) }}</strong>
            </div>

            <div class="summary-card">
              <span>Ultima visita</span>
              <strong>{{ formatDate(historyData.summary.lastPurchaseAt) || 'Sin compras' }}</strong>
            </div>

            <div class="summary-card">
              <span>Saldo preventas</span>
              <strong>${{ formatMoney(historyData.summary.preorderPendingBalance || 0) }}</strong>
            </div>

            <div class="summary-card">
              <span>Preventas activas/parciales</span>
              <strong>{{ (historyData.summary.preorderActive || 0) + (historyData.summary.preorderPartial || 0) }}</strong>
            </div>

            <div class="summary-card">
              <span>Preventas pagadas/surtidas</span>
              <strong>{{ (historyData.summary.preorderPaid || 0) + (historyData.summary.preorderFulfilled || 0) }}</strong>
            </div>
          </div>

          <div class="sales-section">
            <div class="section-header">
              <h3>Compras</h3>
              <span>{{ historyData.sales.length }} ventas</span>
            </div>

            <div v-if="historyData.sales.length" class="sales-list">
              <div
                v-for="sale in historyData.sales"
                :key="sale.id"
                class="sale-row"
              >
                <div>
                  <strong>{{ sale.folio }}</strong>
                  <p>{{ formatDate(sale.createdAt) }}</p>
                  <small>{{ formatPayment(sale.paymentMethod) }}</small>
                </div>

                <div class="sale-meta">
                  <span>Total bruto: ${{ formatMoney(sale.totalBeforeCredit) }}</span>
                  <span v-if="sale.creditUsed > 0">Credito usado: ${{ formatMoney(sale.creditUsed) }}</span>
                  <span>Pagado: ${{ formatMoney(sale.amountPaid || 0) }}</span>
                  <span>Pendiente: ${{ formatMoney(sale.amountDue || 0) }}</span>
                  <span>Estado: {{ formatPaymentStatus(sale.paymentStatus) }}</span>
                  <span>Subtotal: ${{ formatMoney(sale.subtotal) }}</span>
                  <span>Descuento: ${{ formatMoney(sale.discount) }}</span>
                  <strong>Total cobrado: ${{ formatMoney(sale.total) }}</strong>
                </div>
              </div>
            </div>

            <div v-else class="empty-state small-empty">
              Este cliente aun no tiene compras registradas.
            </div>
          </div>

          <div class="sales-section">
            <div class="section-header">
              <h3>Movimientos de credito</h3>
              <span>{{ historyData.creditMovements.length }} movimientos</span>
            </div>

            <div v-if="historyData.creditMovements.length" class="sales-list">
              <div
                v-for="movement in historyData.creditMovements"
                :key="movement.id"
                class="sale-row"
              >
                <div>
                  <strong>{{ movement.type === 'earn' ? 'Abono' : 'Uso' }}</strong>
                  <p>{{ formatDate(movement.createdAt) }}</p>
                  <small>{{ movement.reason || 'Sin motivo' }}</small>
                </div>

                <div class="sale-meta">
                  <span>Monto: ${{ formatMoney(movement.amount) }}</span>
                  <span>Saldo despues: ${{ formatMoney(movement.balanceAfter) }}</span>
                  <small v-if="movement.referenceType">Ref: {{ movement.referenceType }} {{ movement.referenceId || '' }}</small>
                </div>
              </div>
            </div>

            <div v-else class="empty-state small-empty">
              Este cliente aun no tiene movimientos de credito.
            </div>
          </div>

          <div class="sales-section">
            <div class="section-header">
              <h3>Abonos de cuentas por cobrar</h3>
              <span>{{ historyData.receivablePayments?.length || 0 }} abonos</span>
            </div>

            <div v-if="historyData.receivablePayments?.length" class="sales-list">
              <div
                v-for="payment in historyData.receivablePayments"
                :key="payment.id"
                class="sale-row"
              >
                <div>
                  <strong>{{ payment.folio }}</strong>
                  <p>{{ formatDate(payment.createdAt) }}</p>
                  <small>{{ formatPayment(payment.paymentMethod) }}</small>
                </div>

                <div class="sale-meta">
                  <span>Monto: ${{ formatMoney(payment.amount) }}</span>
                  <span>{{ payment.isInitial ? 'Pago inicial de venta' : 'Abono posterior' }}</span>
                  <small>{{ payment.notes || 'Sin nota' }}</small>
                </div>
              </div>
            </div>

            <div v-else class="empty-state small-empty">
              Este cliente aun no tiene abonos registrados.
            </div>
          </div>

          <div class="sales-section">
            <div class="section-header">
              <h3>Preventas</h3>
              <span>{{ historyData.preorders?.length || 0 }} preventas</span>
            </div>

            <div v-if="historyData.preorders?.length" class="sales-list">
              <div
                v-for="preorder in historyData.preorders"
                :key="preorder.id"
                class="sale-row"
              >
                <div>
                  <strong>{{ preorder.preorderNumber }}</strong>
                  <p>{{ formatDate(preorder.createdAt) }}</p>
                  <small>{{ preorder.status }}</small>
                </div>

                <div class="sale-meta">
                  <span>Total: ${{ formatMoney(preorder.totalAmount) }}</span>
                  <span>Pagado: ${{ formatMoney(preorder.amountPaid) }}</span>
                  <span>Pendiente: ${{ formatMoney(preorder.amountDue) }}</span>
                  <small>Salida: {{ formatDate(preorder.releaseDate) || 'N/D' }}</small>
                </div>
              </div>
            </div>

            <div v-else class="empty-state small-empty">
              Este cliente aun no tiene preventas.
            </div>
          </div>

          <div class="sales-section">
            <div class="section-header">
              <h3>Abonos de preventa</h3>
              <span>{{ historyData.preorderPayments?.length || 0 }} abonos</span>
            </div>

            <div v-if="historyData.preorderPayments?.length" class="sales-list">
              <div
                v-for="payment in historyData.preorderPayments"
                :key="payment.id"
                class="sale-row"
              >
                <div>
                  <strong>{{ payment.preorderNumber }}</strong>
                  <p>{{ formatDate(payment.createdAt) }}</p>
                  <small>{{ formatPayment(payment.paymentMethod) }}</small>
                </div>

                <div class="sale-meta">
                  <span>Monto: ${{ formatMoney(payment.amount) }}</span>
                  <small>{{ payment.notes || 'Sin nota' }}</small>
                </div>
              </div>
            </div>

            <div v-else class="empty-state small-empty">
              Este cliente aun no tiene abonos de preventa.
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          Selecciona un cliente para ver su historial.
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const customers = ref([])
const search = ref('')
const selectedCustomerId = ref(null)
const historyData = ref(null)

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function formatPayment(method) {
  if (method === 'cash') return 'Efectivo'
  if (method === 'card') return 'Tarjeta'
  if (method === 'transfer') return 'Transferencia'
  return method || 'N/D'
}

function formatPaymentStatus(status) {
  if (status === 'paid') return 'Pagado'
  if (status === 'partial') return 'Parcial'
  if (status === 'pending') return 'Pendiente'
  return status || 'N/D'
}

async function loadCustomers() {
  customers.value = await window.posAPI.getCustomers()

  if (customers.value.length && !selectedCustomerId.value) {
    await selectCustomer(customers.value[0].id)
  }
}

async function handleSearch() {
  if (!search.value.trim()) {
    await loadCustomers()
    return
  }

  customers.value = await window.posAPI.searchCustomers(search.value)
}

async function selectCustomer(customerId) {
  selectedCustomerId.value = customerId
  historyData.value = await window.posAPI.getCustomerHistory(customerId)
}

onMounted(async () => {
  await loadCustomers()
})
</script>

<style scoped>
.customer-history-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.history-header h1 {
  margin: 0;
  color: #f2b138;
}

.history-header p {
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

.history-grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
}

.card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
}

.list-header,
.section-header,
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input {
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
}

.customer-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.customer-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2c2c2c;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  border: 1px solid transparent;
}

.customer-row.active,
.customer-row:hover {
  border-color: #f2b138;
}

.customer-row p,
.customer-row small {
  display: block;
  margin: 4px 0 0 0;
  color: #bcbcbc;
}

.customer-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #f2b138;
  font-weight: 700;
}

.customer-data {
  margin-top: 14px;
  margin-bottom: 18px;
}

.customer-data p {
  margin: 6px 0;
  color: #d1d5db;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}

.summary-card {
  background: #2c2c2c;
  border-radius: 14px;
  padding: 14px;
}

.summary-card span {
  display: block;
  color: #bcbcbc;
  margin-bottom: 8px;
}

.summary-card strong {
  color: #f2b138;
  font-size: 20px;
}

.sales-section {
  margin-top: 10px;
}

.sales-list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}

.sale-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2c2c2c;
  border-radius: 12px;
  padding: 12px;
}

.sale-row p,
.sale-row small {
  display: block;
  margin: 4px 0 0 0;
  color: #bcbcbc;
}

.sale-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  color: #bcbcbc;
  text-align: center;
}

.small-empty {
  min-height: 120px;
}
</style>
