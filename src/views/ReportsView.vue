<template>
  <div class="reports-layout">
    <header class="reports-header">
      <div>
        <h1>Reportes</h1>
        <p>Ventas e inventario en un solo panel</p>
      </div>

      <button class="back-btn" @click="$router.push('/')">
        Volver al POS
      </button>
    </header>

    <section class="filters-card">
      <div class="filters-grid">
        <div>
          <label>Desde</label>
          <input v-model="dateFrom" type="date" class="input" />
        </div>

        <div>
          <label>Hasta</label>
          <input v-model="dateTo" type="date" class="input" />
        </div>

        <div>
          <label>Sin movimiento (dias)</label>
          <input v-model.number="inactiveDays" type="number" min="1" class="input" />
        </div>

        <div class="filter-actions">
          <button class="primary-btn" @click="loadReport">
            Consultar
          </button>
          <button class="secondary-btn" @click="handleExportCsv">
            Exportar CSV ventas
          </button>
        </div>
      </div>
    </section>

    <section class="summary-grid" v-if="report">
      <div class="summary-card">
        <span>Ventas</span>
        <strong>{{ report.summary.totalSales }}</strong>
      </div>

      <div class="summary-card">
        <span>Total vendido (cobrado)</span>
        <strong>${{ formatMoney(report.summary.totalAmount) }}</strong>
      </div>

      <div class="summary-card">
        <span>Total cubierto con credito</span>
        <strong>${{ formatMoney(report.summary.creditUsedAmount) }}</strong>
      </div>

      <div class="summary-card">
        <span>Venta bruta</span>
        <strong>${{ formatMoney(report.summary.grossAmount) }}</strong>
      </div>

      <div class="summary-card">
        <span>Total vendido en efectivo</span>
        <strong>${{ formatMoney(report.summary.cashAmount) }}</strong>
      </div>

      <div class="summary-card">
        <span>Total vendido en tarjeta</span>
        <strong>${{ formatMoney(report.summary.cardAmount) }}</strong>
      </div>

      <div class="summary-card">
        <span>Ventas con credito</span>
        <strong>{{ report.summary.salesWithCredit }}</strong>
      </div>

      <div class="summary-card">
        <span>Ventas sin credito</span>
        <strong>{{ report.summary.salesWithoutCredit }}</strong>
      </div>

      <div class="summary-card">
        <span>Ticket promedio</span>
        <strong>${{ formatMoney(report.summary.averageTicket) }}</strong>
      </div>
    </section>

    <section class="summary-grid inventory" v-if="inventoryReport?.summary">
      <div class="summary-card inventory-card">
        <span>Productos activos</span>
        <strong>{{ inventoryReport.summary.totalActiveProducts }}</strong>
      </div>

      <div class="summary-card inventory-card">
        <span>Unidades en stock</span>
        <strong>{{ inventoryReport.summary.totalUnitsInStock }}</strong>
      </div>

      <div class="summary-card inventory-card">
        <span>Valor estimado inventario</span>
        <strong>${{ formatMoney(inventoryReport.summary.estimatedInventoryValue) }}</strong>
      </div>

      <div class="summary-card inventory-card">
        <span>Productos bajo minimo</span>
        <strong>{{ inventoryReport.summary.lowStockProductsCount }}</strong>
      </div>
    </section>

    <section class="content-grid" v-if="report">
      <div class="card">
        <div class="card-header">
          <h2>Ventas por dia</h2>
          <span>{{ report.byDay.length }} dias</span>
        </div>

        <div v-if="report.byDay.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Ventas</th>
                <th>Cobrado</th>
                <th>Credito</th>
                <th>Bruto</th>
                <th>Efectivo</th>
                <th>Tarjeta</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="day in report.byDay" :key="day.saleDate">
                <td>{{ day.saleDate }}</td>
                <td>{{ day.totalSales }}</td>
                <td>${{ formatMoney(day.totalAmount) }}</td>
                <td>${{ formatMoney(day.creditUsedAmount) }}</td>
                <td>${{ formatMoney(day.grossAmount) }}</td>
                <td>${{ formatMoney(day.cashAmount) }}</td>
                <td>${{ formatMoney(day.cardAmount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          No hay ventas en el rango seleccionado.
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Ventas por metodo</h2>
          <span>{{ report.byPayment.length }} tipos</span>
        </div>

        <div v-if="report.byPayment.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Metodo</th>
                <th>Ventas</th>
                <th>Cobrado</th>
                <th>Credito</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report.byPayment" :key="row.paymentMethod">
                <td>{{ formatPayment(row.paymentMethod) }}</td>
                <td>{{ row.totalSales }}</td>
                <td>${{ formatMoney(row.totalAmount) }}</td>
                <td>${{ formatMoney(row.creditUsedAmount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          No hay datos.
        </div>
      </div>
    </section>

    <section class="content-grid" v-if="report">
      <div class="card">
        <div class="card-header">
          <h2>Top productos</h2>
          <span>{{ report.topProducts.length }} productos</span>
        </div>

        <div v-if="report.topProducts.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Unidades</th>
                <th>Ventas</th>
                <th>Ganancia real</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="product in report.topProducts" :key="`${product.productId}-${product.sku}`">
                <td>{{ product.productName }}</td>
                <td>{{ product.sku }}</td>
                <td>{{ product.totalQty }}</td>
                <td>${{ formatMoney(product.totalSalesAmount) }}</td>
                <td>${{ formatMoney(product.realProfit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          No hay productos vendidos en el rango.
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Top clientes</h2>
          <span>{{ report.topCustomers.length }} clientes</span>
        </div>

        <div v-if="report.topCustomers.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Compras</th>
                <th>Total cobrado</th>
                <th>Credito usado</th>
                <th>Ultima compra</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="customer in report.topCustomers" :key="customer.customerId">
                <td>
                  <div>{{ customer.customerName }}</div>
                  <small>{{ customer.customerPhone || 'Sin telefono' }}</small>
                </td>
                <td>{{ customer.totalSales }}</td>
                <td>${{ formatMoney(customer.totalSpent) }}</td>
                <td>${{ formatMoney(customer.totalCreditUsed) }}</td>
                <td>{{ formatDate(customer.lastPurchaseAt) || 'N/D' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          No hay clientes con compras en el rango.
        </div>
      </div>
    </section>

    <section class="content-grid" v-if="inventoryReport">
      <div class="card">
        <div class="card-header">
          <h2>Productos bajo stock minimo</h2>
          <span>{{ inventoryReport.lowStockProducts.length }}</span>
        </div>

        <div v-if="inventoryReport.lowStockProducts.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Stock</th>
                <th>Minimo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in inventoryReport.lowStockProducts" :key="row.id">
                <td>{{ row.name }}</td>
                <td>{{ row.sku || 'Sin SKU' }}</td>
                <td>{{ row.stock }}</td>
                <td>{{ row.minStock }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          No hay productos bajo minimo.
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Sin movimiento reciente</h2>
          <span>{{ inventoryReport.staleProducts.length }}</span>
        </div>

        <div v-if="inventoryReport.staleProducts.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock</th>
                <th>Ultimo movimiento</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in inventoryReport.staleProducts" :key="row.id">
                <td>
                  <div>{{ row.name }}</div>
                  <small>{{ row.sku || 'Sin SKU' }}</small>
                </td>
                <td>{{ row.stock }}</td>
                <td>{{ formatDate(row.lastMovementAt) || 'Sin movimientos' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          Todos los productos tuvieron movimiento recientemente.
        </div>
      </div>
    </section>

    <section class="card" v-if="inventoryReport">
      <div class="card-header">
        <h2>Productos mas vendidos (inventario)</h2>
        <span>{{ inventoryReport.topSoldProducts.length }}</span>
      </div>

      <div v-if="inventoryReport.topSoldProducts.length" class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Unidades vendidas</th>
              <th>Total ventas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in inventoryReport.topSoldProducts" :key="row.id">
              <td>{{ row.name }}</td>
              <td>{{ row.sku || 'Sin SKU' }}</td>
              <td>{{ row.totalQty }}</td>
              <td>${{ formatMoney(row.totalSales) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        No hay datos de ventas para inventario.
      </div>
    </section>

    <section class="card" v-if="report">
      <div class="card-header">
        <h2>Transacciones</h2>
        <span>{{ report.transactions.length }} tickets</span>
      </div>

      <div v-if="report.transactions.length" class="transactions-list">
        <div class="transaction-row" v-for="sale in report.transactions" :key="sale.id">
          <div>
            <strong>{{ sale.folio }}</strong>
            <p>{{ formatDate(sale.createdAt) }}</p>
            <small>{{ formatPayment(sale.paymentMethod) }}</small>
            <small v-if="sale.customerName">Cliente: {{ sale.customerName }}</small>
            <small v-else>Cliente: Publico general</small>
          </div>

          <div class="transaction-meta">
            <span>Subtotal: ${{ formatMoney(sale.subtotal) }}</span>
            <span>Descuento: ${{ formatMoney(sale.discount) }}</span>
            <span v-if="sale.creditUsed > 0">Credito usado: ${{ formatMoney(sale.creditUsed) }}</span>
            <span>Total bruto: ${{ formatMoney(sale.totalBeforeCredit) }}</span>
            <strong>Total cobrado: ${{ formatMoney(sale.total) }}</strong>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        No hay transacciones en el rango seleccionado.
      </div>
    </section>

    <div class="note-card" v-if="report">
      La ganancia mostrada es estimada con el costo actual. Para utilidad historica exacta, conviene guardar costo por linea en cada venta.
    </div>

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

const report = ref(null)
const inventoryReport = ref(null)
const message = ref('')
const errorMessage = ref('')

const today = new Date().toISOString().slice(0, 10)
const dateFrom = ref(today)
const dateTo = ref(today)
const inactiveDays = ref(30)

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

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
  return method || 'N/D'
}

async function loadReport() {
  try {
    clearMessages()

    const [salesData, inventoryData] = await Promise.all([
      window.posAPI.getSalesDashboard({
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
      }),
      window.posAPI.getInventorySummary({
        inactiveDays: Number(inactiveDays.value || 30),
      }),
    ])

    report.value = salesData
    inventoryReport.value = inventoryData
  } catch (error) {
    console.error(error)
    errorMessage.value = error?.message || 'No se pudo cargar el reporte.'
  }
}

async function handleExportCsv() {
  try {
    clearMessages()

    const result = await window.posAPI.exportSalesCsv({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    })

    if (result?.canceled) return

    if (result?.success) {
      message.value = `Reporte exportado en: ${result.filePath}`
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error?.message || 'No se pudo exportar el reporte.'
  }
}

onMounted(async () => {
  await loadReport()
})
</script>

<style scoped>
.reports-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.reports-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.reports-header h1 {
  margin: 0;
  color: #f2b138;
}

.reports-header p {
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

.filters-card,
.card,
.note-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
}

.note-card {
  margin-top: 20px;
  color: #d1d5db;
}

.filters-card {
  margin-bottom: 20px;
}

.filters-grid {
  display: grid;
  grid-template-columns: 220px 220px 220px 1fr;
  gap: 16px;
  align-items: end;
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

.filter-actions {
  display: flex;
  gap: 12px;
}

.primary-btn,
.secondary-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  background: #2563eb;
  color: white;
}

.secondary-btn {
  background: #15803d;
  color: white;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.summary-grid.inventory {
  grid-template-columns: repeat(4, 1fr);
}

.summary-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 16px;
}

.summary-card span {
  display: block;
  color: #bcbcbc;
  margin-bottom: 8px;
}

.summary-card strong {
  font-size: 22px;
  color: #f2b138;
}

.inventory-card strong {
  color: #22c55e;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-header h2 {
  margin: 0;
  color: #f2b138;
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
  padding: 12px 10px;
  border-bottom: 1px solid #3a3a3a;
  text-align: left;
  vertical-align: top;
}

.report-table th {
  color: #bcbcbc;
}

.transactions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 520px;
  overflow-y: auto;
}

.transaction-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2c2c2c;
  border-radius: 12px;
  padding: 12px;
}

.transaction-row p,
.transaction-row small {
  display: block;
  margin: 4px 0 0 0;
  color: #bcbcbc;
}

.transaction-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-state {
  color: #bcbcbc;
  padding: 20px 0;
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

@media (max-width: 1400px) {
  .summary-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .summary-grid.inventory {
    grid-template-columns: repeat(2, 1fr);
  }

  .filters-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  .reports-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .content-grid,
  .summary-grid,
  .summary-grid.inventory,
  .filters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
