<template>
  <div class="history-layout">
    <header class="history-header">
      <div>
        <h1>Historial de ventas</h1>
        <p>Ventas registradas hoy</p>
      </div>

      <button class="back-btn" @click="$router.push('/')">
        Volver al POS
      </button>
    </header>

    <section class="history-grid">
      <div class="sales-list-panel">
        <div class="panel-header">
          <h2>Ventas del dia</h2>
          <span>{{ sales.length }} ventas</span>
        </div>

        <div v-if="sales.length" class="sales-list">
          <div
            v-for="sale in sales"
            :key="sale.id"
            class="sale-card"
            :class="{ active: selectedSaleId === sale.id }"
            @click="selectSale(sale.id)"
          >
            <div class="sale-card-top">
              <strong>{{ sale.folio }}</strong>
              <span>${{ formatPrice(sale.total) }}</span>
            </div>

            <div class="sale-card-bottom">
              <span>Cliente: {{ sale.customerName || 'Publico general' }}</span>
            </div>
            <div class="sale-card-bottom">
              <span>{{ formatPaymentMethod(sale.paymentMethod) }}</span>
              <span>Credito: ${{ formatPrice(sale.creditUsed) }}</span>
            </div>
            <div class="sale-card-bottom">
              <span>{{ formatPaymentStatus(sale.paymentStatus) }}</span>
              <span>Pendiente: ${{ formatPrice(sale.amountDue) }}</span>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          No hay ventas registradas hoy.
        </div>
      </div>

      <div class="sale-detail-panel">
        <div class="panel-header">
          <h2>Detalle de venta</h2>
        </div>

        <div v-if="selectedDetail?.sale" class="detail-content">
          <div class="detail-block">
            <div class="detail-row">
              <span>Folio</span>
              <strong>{{ selectedDetail.sale.folio }}</strong>
            </div>
            <div class="detail-row">
              <span>Fecha</span>
              <strong>{{ formatDate(selectedDetail.sale.createdAt) }}</strong>
            </div>
            <div class="detail-row">
              <span>Metodo</span>
              <strong>{{ formatPaymentMethod(selectedDetail.sale.paymentMethod) }}</strong>
            </div>
            <div class="detail-row">
              <span>Estado</span>
              <strong>{{ formatPaymentStatus(selectedDetail.sale.paymentStatus) }}</strong>
            </div>
          </div>

          <div class="detail-items">
            <div
              class="detail-item"
              v-for="item in selectedDetail.items"
              :key="item.id"
            >
              <div>
                <strong>{{ item.productName }}</strong>
                <p>{{ item.sku }}</p>
                <small>Cantidad: {{ item.qty }}</small>
              </div>

              <strong>${{ formatPrice(item.lineTotal) }}</strong>
            </div>
          </div>

          <div class="detail-total">
            <div class="detail-row">
              <span>Total antes de credito</span>
              <strong>${{ formatPrice(selectedDetail.sale.totalBeforeCredit) }}</strong>
            </div>
            <div v-if="selectedDetail.sale.creditUsed > 0" class="detail-row">
              <span>Credito usado</span>
              <strong>-${{ formatPrice(selectedDetail.sale.creditUsed) }}</strong>
            </div>
            <div class="detail-row">
              <span>Subtotal</span>
              <strong>${{ formatPrice(selectedDetail.sale.subtotal) }}</strong>
            </div>
            <div class="detail-row">
              <span>Descuento</span>
              <strong>${{ formatPrice(selectedDetail.sale.discount) }}</strong>
            </div>
            <div class="detail-row">
              <span>Total venta</span>
              <strong>${{ formatPrice(selectedDetail.sale.total) }}</strong>
            </div>
            <div class="detail-row">
              <span>Monto pagado</span>
              <strong>${{ formatPrice(selectedDetail.sale.amountPaid) }}</strong>
            </div>
            <div class="detail-row total">
              <span>Saldo pendiente</span>
              <strong>${{ formatPrice(selectedDetail.sale.amountDue) }}</strong>
            </div>
            <p v-if="selectedDetail.sale.customerName">Cliente: {{ selectedDetail.sale.customerName }}</p>
            <p v-else>Cliente: Publico general</p>
          </div>
        </div>

        <div v-else class="empty-state">
          Selecciona una venta para ver el detalle.
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const sales = ref([])
const selectedSaleId = ref(null)
const selectedDetail = ref(null)

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function formatPaymentMethod(method) {
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

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

async function loadSales() {
  sales.value = await window.posAPI.getTodaySales()

  if (sales.value.length && !selectedSaleId.value) {
    await selectSale(sales.value[0].id)
  }
}

async function selectSale(saleId) {
  selectedSaleId.value = saleId
  selectedDetail.value = await window.posAPI.getSaleDetail(saleId)
}

onMounted(async () => {
  await loadSales()
})
</script>

<style scoped>
.history-layout {
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
  grid-template-columns: 420px 1fr;
  gap: 20px;
}

.sales-list-panel,
.sale-detail-panel {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 18px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h2 {
  margin: 0;
  color: #f2b138;
}

.sales-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
}

.sale-card {
  background: #2c2c2c;
  border: 1px solid #3b3b3b;
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
}

.sale-card.active,
.sale-card:hover {
  border-color: #f2b138;
}

.sale-card-top,
.sale-card-bottom,
.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.sale-card-bottom {
  margin-top: 8px;
  color: #bcbcbc;
  font-size: 13px;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-block,
.detail-total {
  background: #2c2c2c;
  border-radius: 14px;
  padding: 14px;
}

.detail-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2c2c2c;
  border-radius: 12px;
  padding: 12px;
}

.detail-item p,
.detail-item small {
  display: block;
  margin: 4px 0 0 0;
  color: #bcbcbc;
}

.detail-row.total {
  margin-top: 12px;
  font-size: 20px;
  color: #f2b138;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #bcbcbc;
  text-align: center;
}
</style>
