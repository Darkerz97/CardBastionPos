<template>
  <div class="preorders-layout">
    <header class="preorders-header">
      <div>
        <h1>Preventas</h1>
        <p>Gestiona apartados, abonos, liquidacion y surtido</p>
      </div>
      <div class="header-actions">
        <button class="secondary-btn" @click="openCreateModal">Nueva preventa</button>
      </div>
    </header>

    <section class="summary-grid" v-if="summary">
      <div class="summary-card"><span>Total</span><strong>{{ summary.summary.totalPreorders }}</strong></div>
      <div class="summary-card"><span>Activas</span><strong>{{ summary.summary.activePreorders }}</strong></div>
      <div class="summary-card"><span>Parciales</span><strong>{{ summary.summary.partialPreorders }}</strong></div>
      <div class="summary-card"><span>Pagadas</span><strong>{{ summary.summary.paidPreorders }}</strong></div>
      <div class="summary-card"><span>Pendiente</span><strong>${{ money(summary.summary.totalDue) }}</strong></div>
      <div class="summary-card"><span>Abonos hoy</span><strong>${{ money(summary.paymentsToday.totalAmount) }}</strong></div>
    </section>

    <section class="filters-card">
      <input v-model="filters.query" class="input" placeholder="Buscar por numero o cliente" @input="loadPreorders" />
      <select v-model="filters.status" class="input" @change="loadPreorders">
        <option value="">Todos</option>
        <option value="active">Activas</option>
        <option value="partial">Parciales</option>
        <option value="paid">Pagadas</option>
        <option value="fulfilled">Surtidas</option>
        <option value="cancelled">Canceladas</option>
      </select>
      <select v-model="filters.customerId" class="input" @change="loadPreorders">
        <option value="">Todos los clientes</option>
        <option v-for="c in customers" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
      </select>
      <input v-model="filters.productQuery" class="input" placeholder="Filtrar por producto" @input="loadPreorders" />
      <button class="secondary-btn" @click="loadPreorders">Actualizar</button>
    </section>

    <section class="table-card">
      <div class="table-head"><h2>Listado</h2><span>{{ preorders.length }} registros</span></div>
      <div v-if="preorders.length" class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Numero</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Pagado</th>
              <th>Pendiente</th>
              <th>Salida</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in preorders" :key="p.id">
              <td>{{ p.preorderNumber }}</td>
              <td>{{ p.customerName }}</td>
              <td>{{ p.status }}</td>
              <td>${{ money(p.totalAmount) }}</td>
              <td>${{ money(p.amountPaid) }}</td>
              <td>${{ money(p.amountDue) }}</td>
              <td>{{ fmtDate(p.releaseDate) || 'N/D' }}</td>
              <td>{{ fmtDate(p.createdAt) }}</td>
              <td>
                <button class="mini-btn" @click="openDetail(p.id)">Detalle</button>
                <button class="mini-btn" @click="openPaymentModal(p.id)" :disabled="p.amountDue <= 0 || p.status === 'cancelled' || p.status === 'fulfilled'">Abono</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">No hay preventas con esos filtros.</div>
    </section>

    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal-card large">
        <div class="modal-head"><h3>Nueva preventa</h3><button class="mini-btn" @click="showCreate = false">Cerrar</button></div>
        <div class="grid-2">
          <div>
            <label>Cliente</label>
            <select v-model="createForm.customerId" class="input">
              <option value="">Seleccionar cliente</option>
              <option v-for="c in customers" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label>Salida estimada</label>
            <input v-model="createForm.releaseDate" class="input" type="date" />
          </div>
          <div>
            <label>Abono inicial</label>
            <input v-model.number="createForm.initialPaymentAmount" class="input" type="number" min="0" step="0.01" />
          </div>
          <div>
            <label>Metodo abono inicial</label>
            <select v-model="createForm.initialPaymentMethod" class="input">
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>
          <div class="full">
            <label>Notas</label>
            <textarea v-model="createForm.notes" class="input" rows="2" />
          </div>
        </div>

        <h4 style="margin-top: 14px;">Items</h4>
        <div class="item-editor" v-for="(item, idx) in createForm.items" :key="idx">
          <select v-model="item.productId" class="input" @change="onChangeItemProduct(idx)">
            <option value="">Producto</option>
            <option v-for="p in products" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
          </select>
          <input v-model="item.productName" class="input" placeholder="Nombre" />
          <input v-model.number="item.quantity" class="input" type="number" min="0.01" step="1" placeholder="Cant" />
          <input v-model.number="item.unitPrice" class="input" type="number" min="0" step="0.01" placeholder="Precio" />
          <button class="mini-btn danger" @click="removeItem(idx)">Quitar</button>
        </div>
        <div class="row-actions">
          <button class="mini-btn" @click="addItem">Agregar item</button>
          <span>Total: ${{ money(createTotal) }} | Pendiente: ${{ money(createDue) }}</span>
        </div>

        <div v-if="errorMessage" class="error-box">{{ errorMessage }}</div>
        <button class="primary-btn" @click="savePreorder">Guardar preventa</button>
      </div>
    </div>

    <div v-if="showDetail && detail" class="modal-overlay" @click.self="closeDetail">
      <div class="modal-card large">
        <div class="modal-head"><h3>{{ detail.preorder.preorderNumber }}</h3><button class="mini-btn" @click="closeDetail">Cerrar</button></div>
        <p>Cliente: <strong>{{ detail.preorder.customerName }}</strong></p>
        <p>Estado: <strong>{{ detail.preorder.status }}</strong> | Total: ${{ money(detail.preorder.totalAmount) }} | Pagado: ${{ money(detail.preorder.amountPaid) }} | Pendiente: ${{ money(detail.preorder.amountDue) }}</p>

        <div class="row-actions">
          <button class="mini-btn" @click="openPaymentModal(detail.preorder.id)">Registrar abono</button>
          <button class="mini-btn" @click="markFulfilled(detail.preorder.id)">Marcar surtida</button>
          <button class="mini-btn" @click="sendEmail(detail.preorder.id, 'created')">Reenviar creado</button>
          <button class="mini-btn" @click="sendEmail(detail.preorder.id, 'paid')">Reenviar liquidada</button>
          <button class="mini-btn danger" @click="cancelPreorder(detail.preorder.id)">Cancelar</button>
        </div>

        <h4>Items</h4>
        <ul>
          <li v-for="it in detail.items" :key="it.id">{{ it.productName }} x{{ it.quantity }} - ${{ money(it.lineTotal) }}</li>
        </ul>

        <h4>Pagos</h4>
        <ul>
          <li v-for="pay in detail.payments" :key="pay.id">{{ fmtDate(pay.createdAt) }} - ${{ money(pay.amount) }} ({{ pay.paymentMethod }})</li>
        </ul>
      </div>
    </div>

    <div v-if="showPayment" class="modal-overlay" @click.self="showPayment = false">
      <div class="modal-card">
        <div class="modal-head"><h3>Registrar abono</h3><button class="mini-btn" @click="showPayment = false">Cerrar</button></div>
        <input v-model.number="paymentForm.amount" class="input" type="number" min="0.01" step="0.01" placeholder="Monto" />
        <select v-model="paymentForm.paymentMethod" class="input">
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
        </select>
        <textarea v-model="paymentForm.notes" class="input" rows="2" placeholder="Notas" />
        <button class="primary-btn" @click="savePayment">Guardar abono</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const customers = ref([])
const products = ref([])
const preorders = ref([])
const summary = ref(null)
const detail = ref(null)
const errorMessage = ref('')

const showCreate = ref(false)
const showDetail = ref(false)
const showPayment = ref(false)
const paymentPreorderId = ref(null)

const filters = reactive({ query: '', status: '', customerId: '', productQuery: '' })
const paymentForm = reactive({ amount: 0, paymentMethod: 'cash', notes: '' })
const createForm = reactive({
  customerId: '',
  releaseDate: '',
  initialPaymentAmount: 0,
  initialPaymentMethod: 'cash',
  notes: '',
  items: [{ productId: '', productName: '', quantity: 1, unitPrice: 0 }],
})

const createTotal = computed(() => createForm.items.reduce((acc, it) => acc + (Number(it.quantity || 0) * Number(it.unitPrice || 0)), 0))
const createDue = computed(() => Math.max(createTotal.value - Number(createForm.initialPaymentAmount || 0), 0))

const money = (v) => Number(v || 0).toFixed(2)
const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '')

function addItem() { createForm.items.push({ productId: '', productName: '', quantity: 1, unitPrice: 0 }) }
function removeItem(index) { createForm.items.splice(index, 1) }
function onChangeItemProduct(index) {
  const item = createForm.items[index]
  const product = products.value.find((p) => String(p.id) === String(item.productId))
  if (!product) return
  item.productName = product.name || ''
  item.unitPrice = Number(product.price || 0)
}

async function loadPreorders() {
  preorders.value = await window.posAPI.getPreorders({
    query: filters.query || undefined,
    status: filters.status || undefined,
    customerId: filters.customerId ? Number(filters.customerId) : undefined,
    productQuery: filters.productQuery || undefined,
  })
}

async function loadSummary() {
  summary.value = await window.posAPI.getPreorderSummary()
}

async function loadCatalogs() {
  const [customerData, productData] = await Promise.all([window.posAPI.getCustomers(), window.posAPI.getProducts()])
  customers.value = customerData || []
  products.value = productData || []
}

function openCreateModal() {
  errorMessage.value = ''
  createForm.customerId = ''
  createForm.releaseDate = ''
  createForm.initialPaymentAmount = 0
  createForm.initialPaymentMethod = 'cash'
  createForm.notes = ''
  createForm.items = [{ productId: '', productName: '', quantity: 1, unitPrice: 0 }]
  showCreate.value = true
}

async function savePreorder() {
  try {
    errorMessage.value = ''
    const payload = {
      customerId: Number(createForm.customerId),
      releaseDate: createForm.releaseDate || null,
      initialPaymentAmount: Number(createForm.initialPaymentAmount || 0),
      initialPaymentMethod: createForm.initialPaymentMethod,
      notes: createForm.notes,
      items: createForm.items.map((it) => ({
        productId: it.productId ? Number(it.productId) : null,
        productName: String(it.productName || ''),
        quantity: Number(it.quantity || 0),
        unitPrice: Number(it.unitPrice || 0),
        lineTotal: Number(it.quantity || 0) * Number(it.unitPrice || 0),
      })),
    }
    await window.posAPI.createPreorder(payload)
    showCreate.value = false
    await Promise.all([loadPreorders(), loadSummary()])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo guardar la preventa.'
  }
}

async function openDetail(preorderId) {
  detail.value = await window.posAPI.getPreorderById(preorderId)
  showDetail.value = true
}

function closeDetail() {
  showDetail.value = false
  detail.value = null
}

function openPaymentModal(preorderId) {
  paymentPreorderId.value = preorderId
  paymentForm.amount = 0
  paymentForm.paymentMethod = 'cash'
  paymentForm.notes = ''
  showPayment.value = true
}

async function savePayment() {
  try {
    await window.posAPI.addPreorderPayment({
      preorderId: Number(paymentPreorderId.value),
      amount: Number(paymentForm.amount || 0),
      paymentMethod: paymentForm.paymentMethod,
      notes: paymentForm.notes,
    })
    showPayment.value = false
    await Promise.all([loadPreorders(), loadSummary()])
    if (showDetail.value && detail.value?.preorder?.id) {
      await openDetail(detail.value.preorder.id)
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo registrar el abono.'
  }
}

async function markFulfilled(preorderId) {
  await window.posAPI.markPreorderFulfilled({
    preorderId: Number(preorderId),
    deductStock: true,
    createSale: false,
  })
  await Promise.all([loadPreorders(), loadSummary(), openDetail(preorderId)])
}

async function cancelPreorder(preorderId) {
  const notes = window.prompt('Motivo de cancelacion:') || ''
  await window.posAPI.cancelPreorder({ preorderId: Number(preorderId), notes })
  await Promise.all([loadPreorders(), loadSummary(), openDetail(preorderId)])
}

async function sendEmail(preorderId, type) {
  if (type === 'created') await window.posAPI.sendPreorderCreatedEmail({ preorderId })
  if (type === 'paid') await window.posAPI.sendPreorderPaidEmail({ preorderId })
  await openDetail(preorderId)
}

onMounted(async () => {
  await Promise.all([loadCatalogs(), loadPreorders(), loadSummary()])
})
</script>

<style scoped>
.preorders-layout { min-height: 100vh; background: #1e1e1e; color: #f5f5f5; padding: 20px; }
.preorders-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.preorders-header h1 { margin: 0; color: #f2b138; }
.header-actions { display: flex; gap: 10px; }
.summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 14px; }
.summary-card { background: #232323; border: 1px solid #323232; border-radius: 12px; padding: 12px; }
.summary-card span { display: block; color: #9ca3af; }
.summary-card strong { color: #f2b138; font-size: 22px; }
.filters-card { background: #232323; border: 1px solid #323232; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 1fr 180px 220px 1fr auto; gap: 10px; margin-bottom: 14px; }
.input { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid #3a3a3a; background: #2a2a2a; color: #fff; }
.table-card { background: #232323; border: 1px solid #323232; border-radius: 12px; padding: 12px; }
.table-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.table-wrap { overflow: auto; }
.report-table { width: 100%; border-collapse: collapse; }
.report-table th, .report-table td { padding: 10px; border-bottom: 1px solid #3a3a3a; text-align: left; vertical-align: top; }
.empty-state { color: #9ca3af; padding: 14px; text-align: center; }
.primary-btn, .secondary-btn, .back-btn, .mini-btn { border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 700; }
.primary-btn { width: 100%; background: #22c55e; color: #fff; margin-top: 10px; }
.secondary-btn { background: #2563eb; color: #fff; }
.back-btn { background: #f29a2e; color: #111; }
.mini-btn { background: #334155; color: #fff; font-size: 12px; }
.mini-btn.danger { background: #b91c1c; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 60; }
.modal-card { width: min(700px, 100%); max-height: 90vh; overflow: auto; background: #1f2937; border: 1px solid #374151; border-radius: 14px; padding: 16px; }
.modal-card.large { width: min(1050px, 100%); }
.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.full { grid-column: 1 / -1; }
.item-editor { display: grid; grid-template-columns: 220px 1fr 110px 120px 90px; gap: 8px; margin-top: 8px; }
.row-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.error-box { margin-top: 10px; background: #7f1d1d; padding: 10px; border-radius: 8px; }
@media (max-width: 1200px) {
  .summary-grid { grid-template-columns: repeat(3, 1fr); }
  .filters-card { grid-template-columns: 1fr 1fr; }
  .item-editor { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
}
</style>
