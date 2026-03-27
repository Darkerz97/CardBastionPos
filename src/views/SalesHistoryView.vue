<template>
  <div class="history-layout">
    <header class="history-header">
      <div>
        <h1>Historial de ventas</h1>
        <p>Consulta ventas por busqueda y rango de fechas, con opcion de editar o eliminar</p>
      </div>
    </header>

    <section class="filters-panel">
      <input
        v-model="filters.query"
        class="input"
        type="text"
        placeholder="Buscar por folio, cliente, telefono o metodo"
        @input="loadSales"
      />
      <input v-model="filters.dateFrom" class="input" type="date" @change="loadSales" />
      <input v-model="filters.dateTo" class="input" type="date" @change="loadSales" />
      <button class="secondary-btn" @click="applyQuickRange('today')">Hoy</button>
      <button class="secondary-btn" @click="applyQuickRange('yesterday')">Ayer</button>
      <button class="secondary-btn" @click="applyQuickRange('last7')">7 dias</button>
      <button class="secondary-btn" @click="applyQuickRange('all')">Todo</button>
    </section>

    <section class="history-grid">
      <div class="sales-list-panel">
        <div class="panel-header">
          <h2>Ventas</h2>
          <span>{{ sales.length }} registros</span>
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
              <span>{{ formatDate(sale.createdAt) }}</span>
            </div>
            <div class="sale-card-bottom">
              <span>{{ formatPaymentStatus(sale.paymentStatus) }}</span>
              <span>Pendiente: ${{ formatPrice(sale.amountDue) }}</span>
            </div>
            <div class="sale-card-bottom sale-items-preview">
              <span>{{ sale.itemsSummary || 'Sin articulos' }}</span>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          No hay ventas registradas.
        </div>
      </div>

      <div class="sale-detail-panel">
        <div class="panel-header">
          <h2>Detalle de venta</h2>
          <div class="detail-actions" v-if="selectedDetail?.sale">
            <button class="secondary-btn" @click="openEditModal">Editar</button>
            <button class="danger-btn" @click="handleDeleteSale">Eliminar</button>
          </div>
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
            <div class="detail-item" v-for="item in selectedDetail.items" :key="item.id">
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
            <p>Cliente: {{ selectedDetail.sale.customerName || 'Publico general' }}</p>
          </div>
        </div>

        <div v-else class="empty-state">
          Selecciona una venta para ver el detalle.
        </div>
      </div>
    </section>

    <div v-if="message" class="toast success">{{ message }}</div>
    <div v-if="errorMessage" class="toast error">{{ errorMessage }}</div>

    <div v-if="editModalOpen" class="modal-backdrop" @click.self="editModalOpen = false">
      <div class="modal-card">
        <h3>Editar venta {{ editForm.folio }}</h3>

        <div class="form-grid">
          <div>
            <label>Cliente</label>
            <select v-model="editForm.customerId" class="input">
              <option :value="null">Publico general</option>
              <option v-for="customer in customers" :key="customer.id" :value="customer.id">
                {{ customer.name }}
              </option>
            </select>
          </div>

          <div>
            <label>Metodo</label>
            <select v-model="editForm.paymentMethod" class="input">
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>

          <div>
            <label>Descuento</label>
            <input v-model.number="editForm.discount" type="number" min="0" step="0.01" class="input" />
          </div>

          <div>
            <label>Credito usado</label>
            <input v-model.number="editForm.creditUsed" type="number" min="0" step="0.01" class="input" />
          </div>

          <div>
            <label>Monto pagado</label>
            <input v-model.number="editForm.amountPaid" type="number" min="0" step="0.01" class="input" />
          </div>

          <div>
            <label>Fecha limite</label>
            <input v-model="editForm.dueDate" type="date" class="input" />
          </div>

          <div class="full">
            <label>Notas</label>
            <textarea v-model="editForm.paymentNotes" class="input" rows="2"></textarea>
          </div>
        </div>

        <div class="edit-items">
          <div class="edit-items-header">
            <h4>Productos</h4>
            <button class="secondary-btn" @click="addItemRow">Agregar producto</button>
          </div>

          <div v-for="(item, index) in editForm.items" :key="index" class="edit-item-row">
            <select v-model="item.productId" class="input" @change="handleProductChange(item)">
              <option :value="0">Selecciona producto</option>
              <option v-for="product in products" :key="product.id" :value="product.id">
                {{ product.name }} ({{ product.sku || 'Sin SKU' }})
              </option>
            </select>
            <input v-model.number="item.qty" type="number" min="1" step="1" class="input small" placeholder="Cant." />
            <input v-model.number="item.price" type="number" min="0" step="0.01" class="input small" placeholder="Precio" />
            <button class="danger-btn" @click="removeItemRow(index)">Quitar</button>
          </div>
        </div>

        <div class="totals-box">
          <div class="detail-row">
            <span>Subtotal</span>
            <strong>${{ formatPrice(editSubtotal) }}</strong>
          </div>
          <div class="detail-row">
            <span>Total neto</span>
            <strong>${{ formatPrice(editTotal) }}</strong>
          </div>
          <div class="detail-row">
            <span>Saldo pendiente</span>
            <strong>${{ formatPrice(editAmountDue) }}</strong>
          </div>
        </div>

        <div class="detail-actions">
          <button class="secondary-btn" @click="editModalOpen = false">Cancelar</button>
          <button class="primary-btn" @click="handleSaveEdit">Guardar cambios</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const sales = ref([])
const products = ref([])
const customers = ref([])
const selectedSaleId = ref(null)
const selectedDetail = ref(null)
const message = ref('')
const errorMessage = ref('')
const editModalOpen = ref(false)
const filters = reactive({
  query: '',
  dateFrom: '',
  dateTo: '',
})

const editForm = reactive({
  id: null,
  folio: '',
  customerId: null,
  paymentMethod: 'cash',
  discount: 0,
  creditUsed: 0,
  amountPaid: 0,
  dueDate: '',
  paymentNotes: '',
  items: [],
})

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

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
  return value ? new Date(value).toLocaleString() : ''
}

function formatDateInput(value) {
  return value.toISOString().slice(0, 10)
}

function applyQuickRange(range, shouldReload = true) {
  const today = new Date()
  const end = new Date(today)
  const start = new Date(today)

  if (range === 'today') {
    const date = formatDateInput(today)
    filters.dateFrom = date
    filters.dateTo = date
  } else if (range === 'yesterday') {
    start.setDate(start.getDate() - 1)
    const date = formatDateInput(start)
    filters.dateFrom = date
    filters.dateTo = date
  } else if (range === 'last7') {
    start.setDate(start.getDate() - 6)
    filters.dateFrom = formatDateInput(start)
    filters.dateTo = formatDateInput(end)
  } else {
    filters.dateFrom = ''
    filters.dateTo = ''
  }

  if (shouldReload) {
    loadSales()
  }
}

function buildItemPayload(item) {
  const product = products.value.find((entry) => Number(entry.id) === Number(item.productId))
  return {
    id: Number(item.productId || 0),
    sku: String(product?.sku || item.sku || ''),
    name: String(product?.name || item.name || ''),
    qty: Number(item.qty || 0),
    price: Number(item.price || 0),
    lineTotal: Number(item.qty || 0) * Number(item.price || 0),
  }
}

const editSubtotal = computed(() => {
  return editForm.items.reduce((total, item) => total + (Number(item.qty || 0) * Number(item.price || 0)), 0)
})

const editTotal = computed(() => {
  return Math.max(Number(editSubtotal.value || 0) - Number(editForm.discount || 0) - Number(editForm.creditUsed || 0), 0)
})

const editAmountDue = computed(() => {
  return Math.max(Number(editTotal.value || 0) - Number(editForm.amountPaid || 0), 0)
})

function addItemRow() {
  editForm.items.push({ productId: 0, qty: 1, price: 0, sku: '', name: '' })
}

function removeItemRow(index) {
  editForm.items.splice(index, 1)
}

function handleProductChange(item) {
  const product = products.value.find((entry) => Number(entry.id) === Number(item.productId))
  if (!product) return
  item.price = Number(product.price || 0)
  item.sku = String(product.sku || '')
  item.name = String(product.name || '')
}

async function loadSales() {
  sales.value = await window.posAPI.getSalesHistory({
    query: filters.query,
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
  })

  if (sales.value.length && !selectedSaleId.value) {
    await selectSale(sales.value[0].id)
  } else if (!sales.value.some((sale) => sale.id === selectedSaleId.value)) {
    selectedSaleId.value = null
    selectedDetail.value = null
  }
}

async function loadDependencies() {
  const [customersData, productsData] = await Promise.all([
    window.posAPI.getCustomers(),
    window.posAPI.getProducts(),
  ])
  customers.value = customersData || []
  products.value = productsData || []
}

async function selectSale(saleId) {
  selectedSaleId.value = saleId
  selectedDetail.value = await window.posAPI.getSaleDetail(saleId)
}

function openEditModal() {
  clearMessages()
  if (!selectedDetail.value?.sale) return

  editForm.id = selectedDetail.value.sale.id
  editForm.folio = selectedDetail.value.sale.folio
  editForm.customerId = selectedDetail.value.sale.customerId
  editForm.paymentMethod = selectedDetail.value.sale.paymentMethod
  editForm.discount = Number(selectedDetail.value.sale.discount || 0)
  editForm.creditUsed = Number(selectedDetail.value.sale.creditUsed || 0)
  editForm.amountPaid = Number(selectedDetail.value.sale.amountPaid || 0)
  editForm.dueDate = selectedDetail.value.sale.dueDate ? String(selectedDetail.value.sale.dueDate).slice(0, 10) : ''
  editForm.paymentNotes = selectedDetail.value.sale.paymentNotes || ''
  editForm.items = selectedDetail.value.items.map((item) => ({
    productId: Number(item.productId || 0),
    qty: Number(item.qty || 1),
    price: Number(item.unitPrice || 0),
    sku: String(item.sku || ''),
    name: String(item.productName || ''),
  }))
  editModalOpen.value = true
}

async function handleSaveEdit() {
  try {
    clearMessages()
    const items = editForm.items.map(buildItemPayload).filter((item) => item.id && item.qty > 0)

    if (!items.length) {
      throw new Error('Agrega al menos un producto a la venta.')
    }

    await window.posAPI.updateSale({
      id: editForm.id,
      items,
      subtotal: Number(editSubtotal.value || 0),
      discount: Number(editForm.discount || 0),
      total: Number(editTotal.value || 0),
      payment_method: editForm.paymentMethod,
      cash_received: editForm.paymentMethod === 'cash' ? Number(editForm.amountPaid || 0) : 0,
      customerId: editForm.customerId,
      credit_used: Number(editForm.creditUsed || 0),
      amount_paid: Number(editForm.amountPaid || 0),
      due_date: editForm.dueDate || null,
      payment_notes: editForm.paymentNotes,
    })

    editModalOpen.value = false
    message.value = 'Venta actualizada.'
    await Promise.all([loadSales(), loadDependencies()])
    await selectSale(editForm.id)
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo actualizar la venta.'
  }
}

async function handleDeleteSale() {
  if (!selectedDetail.value?.sale) return
  if (!window.confirm(`Eliminar venta ${selectedDetail.value.sale.folio}?`)) return

  try {
    clearMessages()
    await window.posAPI.deleteSale({ id: selectedDetail.value.sale.id })
    message.value = 'Venta eliminada.'
    selectedSaleId.value = null
    selectedDetail.value = null
    await Promise.all([loadSales(), loadDependencies()])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo eliminar la venta.'
  }
}

onMounted(async () => {
  try {
    applyQuickRange('today', false)
    await Promise.all([loadSales(), loadDependencies()])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo cargar el historial.'
  }
})
</script>

<style scoped>
.history-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.history-header,
.panel-header,
.detail-actions,
.edit-items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.history-header {
  margin-bottom: 20px;
}

.filters-panel {
  display: grid;
  grid-template-columns: minmax(240px, 1.6fr) repeat(2, minmax(150px, 0.8fr)) repeat(4, auto);
  gap: 12px;
  margin-bottom: 20px;
}

.history-header h1,
.panel-header h2 {
  margin: 0;
  color: #f2b138;
}

.history-header p {
  margin: 6px 0 0;
  color: #bcbcbc;
}

.history-grid {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 20px;
}

.sales-list-panel,
.sale-detail-panel,
.modal-card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 18px;
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
.detail-total,
.totals-box {
  background: #2c2c2c;
  border-radius: 14px;
  padding: 14px;
}

.detail-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-item,
.edit-item-row {
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
  margin: 4px 0 0;
  color: #bcbcbc;
}

.detail-row.total {
  margin-top: 12px;
  font-size: 20px;
  color: #f2b138;
}

.back-btn,
.primary-btn,
.secondary-btn,
.danger-btn {
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
  background: #22c55e;
  color: white;
}

.secondary-btn {
  background: #2563eb;
  color: white;
}

.danger-btn {
  background: #b91c1c;
  color: white;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #bcbcbc;
  text-align: center;
}

.toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  padding: 14px 16px;
  border-radius: 12px;
}

.toast.success {
  background: #166534;
}

.toast.error {
  background: #7f1d1d;
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
  width: min(980px, 100%);
  max-height: 92vh;
  overflow-y: auto;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.full {
  grid-column: 1 / -1;
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

.input.small {
  max-width: 130px;
}

.edit-items {
  margin-top: 18px;
  display: grid;
  gap: 10px;
}

@media (max-width: 1100px) {
  .filters-panel,
  .history-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .edit-item-row {
    flex-direction: column;
  }
}
</style>
