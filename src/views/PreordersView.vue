<template>
  <div class="preorders-layout">
    <header class="preorders-header">
      <div>
        <h1>Preventas</h1>
        <p>Catalogo base de preventas y asignacion a clientes</p>
      </div>
      <div class="header-actions">
        <button class="secondary-btn" @click="exportPurchaseList">Lista de compra</button>
        <button class="secondary-btn" @click="downloadTemplate">Plantilla Excel</button>
        <button class="secondary-btn" @click="importFromExcel">Importar catalogo</button>
        <button class="secondary-btn" @click="openCatalogModal()">Nueva base</button>
        <button class="primary-btn" @click="openAssignModal()">Asignar preventa</button>
      </div>
    </header>

    <section class="summary-grid" v-if="summary">
      <div class="summary-card"><span>Catalogo</span><strong>{{ preorderCatalog.length }}</strong></div>
      <div class="summary-card"><span>Asignadas</span><strong>{{ summary.summary.totalPreorders }}</strong></div>
      <div class="summary-card"><span>Activas</span><strong>{{ summary.summary.activePreorders }}</strong></div>
      <div class="summary-card"><span>Parciales</span><strong>{{ summary.summary.partialPreorders }}</strong></div>
      <div class="summary-card"><span>Pagadas</span><strong>{{ summary.summary.paidPreorders }}</strong></div>
      <div class="summary-card"><span>Surtidas</span><strong>{{ summary.summary.fulfilledPreorders }}</strong></div>
    </section>

    <div v-if="message" class="feedback success">{{ message }}</div>
    <div v-if="errorMessage" class="feedback error">{{ errorMessage }}</div>

    <section class="card">
      <div class="panel-head">
        <h2>Preventas base</h2>
        <span>{{ preorderCatalog.length }} cargadas</span>
      </div>

      <div class="filters">
        <input v-model="catalogFilters.query" class="input" placeholder="Buscar por codigo, nombre o categoria" @input="loadPreorderCatalog" />
        <input v-model="catalogFilters.category" class="input" list="category-options" placeholder="Categoria" @input="loadPreorderCatalog" />
        <datalist id="category-options">
          <option v-for="option in catalogOptions.categories" :key="option" :value="option" />
        </datalist>
        <input v-model="catalogFilters.dateFrom" class="input" type="date" @change="loadPreorderCatalog" />
        <input v-model="catalogFilters.dateTo" class="input" type="date" @change="loadPreorderCatalog" />
      </div>

      <div v-if="preorderCatalog.length" class="catalog-grid">
        <article v-for="item in preorderCatalog" :key="item.id" class="catalog-card">
          <img v-if="catalogImageUrls[item.id]" :src="catalogImageUrls[item.id]" :alt="item.name" class="catalog-image" />
          <div v-else class="catalog-image placeholder">Sin imagen</div>
          <div class="catalog-body">
            <div class="row">
              <strong>{{ item.name }}</strong>
              <span>${{ money(item.unitPrice) }}</span>
            </div>
            <p>{{ item.code }}<span v-if="item.category"> | {{ item.category }}</span></p>
            <p>{{ item.description || 'Sin descripcion' }}</p>
            <small>Salida: {{ fmtDate(item.releaseDate) || 'N/D' }} | Limite: {{ fmtDate(item.dueDate) || 'N/D' }}</small>
            <small>Producto: {{ item.productName || 'Libre' }}</small>
            <div class="row-actions">
              <button class="mini-btn" @click="openAssignModal(item)">Asignar</button>
              <button class="mini-btn" @click="openCatalogModal(item)">Editar</button>
              <button class="mini-btn danger" @click="deleteCatalogItem(item)">Desactivar</button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">No hay preventas base con esos filtros.</div>
    </section>

    <section class="card">
      <div class="panel-head">
        <h2>Preventas asignadas</h2>
        <span>{{ groupedAssignedPreorders.length }} clientes</span>
      </div>

      <div class="filters">
        <input v-model="assignedFilters.query" class="input" placeholder="Buscar por numero, cliente o base" @input="loadPreorders" />
        <select v-model="assignedFilters.status" class="input" @change="loadPreorders">
          <option value="">Todos</option>
          <option value="active">Activas</option>
          <option value="partial">Parciales</option>
          <option value="paid">Pagadas</option>
          <option value="fulfilled">Surtidas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <select v-model="assignedFilters.customerId" class="input" @change="loadPreorders">
          <option value="">Todos los clientes</option>
          <option v-for="c in customers" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
        </select>
        <input v-model="assignedFilters.dateFrom" class="input" type="date" @change="loadPreorders" />
        <input v-model="assignedFilters.dateTo" class="input" type="date" @change="loadPreorders" />
      </div>

      <div v-if="groupedAssignedPreorders.length" class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Preventas</th>
              <th>Bases</th>
              <th>Total</th>
              <th>Pagado</th>
              <th>Pendiente</th>
              <th>Proxima salida</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groupedAssignedPreorders" :key="group.customerId">
              <td>{{ group.customerName }}</td>
              <td>{{ group.preorders.length }}</td>
              <td>{{ group.catalogNames }}</td>
              <td>${{ money(group.totalAmount) }}</td>
              <td>${{ money(group.amountPaid) }}</td>
              <td>${{ money(group.amountDue) }}</td>
              <td>{{ fmtDate(group.nextReleaseDate) || 'N/D' }}</td>
              <td>
                <button class="mini-btn" @click="openDetail(group.preorders[0].id)">Detalle</button>
                <button class="mini-btn" @click="openPaymentModal(group.firstOpenPreorderId)" :disabled="!group.firstOpenPreorderId">Abono</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">No hay preventas asignadas.</div>
    </section>

    <div v-if="showCatalogModal" class="modal-overlay" @click.self="showCatalogModal = false">
      <div class="modal-card large">
        <div class="modal-head">
          <h3>{{ catalogForm.id ? 'Editar preventa base' : 'Nueva preventa base' }}</h3>
          <button class="mini-btn" @click="showCatalogModal = false">Cerrar</button>
        </div>

        <div class="form-grid">
          <div><label>Codigo</label><input v-model="catalogForm.code" class="input" /></div>
          <div><label>Categoria</label><input v-model="catalogForm.category" class="input" list="category-options" /></div>
          <div class="full"><label>Nombre</label><input v-model="catalogForm.name" class="input" /></div>
          <div><label>Producto</label>
            <select v-model="catalogForm.productId" class="input" @change="handleCatalogProductChange">
              <option :value="0">Sin vincular</option>
              <option v-for="product in products" :key="product.id" :value="product.id">{{ product.name }}</option>
            </select>
          </div>
          <div><label>SKU</label><input v-model="catalogForm.sku" class="input" /></div>
          <div><label>Precio</label><input v-model.number="catalogForm.unitPrice" class="input" type="number" min="0" step="0.01" /></div>
          <div><label>Cantidad</label><input v-model.number="catalogForm.quantityDefault" class="input" type="number" min="1" step="1" /></div>
          <div><label>Fecha salida</label><input v-model="catalogForm.releaseDate" class="input" type="date" /></div>
          <div><label>Fecha limite</label><input v-model="catalogForm.dueDate" class="input" type="date" /></div>
          <div class="full"><label>Descripcion</label><textarea v-model="catalogForm.description" class="input" rows="3" /></div>
          <div class="full">
            <label>Imagen</label>
            <div class="image-row">
              <input v-model="catalogForm.image" class="input" readonly />
              <button class="secondary-btn" @click="selectCatalogImage">Seleccionar</button>
            </div>
            <img v-if="catalogImagePreview" :src="catalogImagePreview" alt="Vista previa" class="preview-image" />
          </div>
        </div>

        <div class="row-actions">
          <button class="secondary-btn" @click="saveCatalogItem">Guardar base</button>
        </div>
      </div>
    </div>

    <div v-if="showAssignModal" class="modal-overlay" @click.self="showAssignModal = false">
      <div class="modal-card">
        <div class="modal-head">
          <h3>Asignar preventa</h3>
          <button class="mini-btn" @click="showAssignModal = false">Cerrar</button>
        </div>
        <label>Cliente</label>
        <select v-model="assignForm.customerId" class="input">
          <option value="">Seleccionar cliente</option>
          <option v-for="c in customers" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
        </select>
        <label>Preventa base</label>
        <select v-model="assignForm.catalogId" class="input" @change="applyAssignSelection">
          <option value="">Seleccionar preventa base</option>
          <option v-for="item in preorderCatalog" :key="item.id" :value="String(item.id)">{{ item.name }} | {{ item.category || 'Sin categoria' }} | ${{ money(item.unitPrice) }}</option>
        </select>
        <div v-if="selectedAssignCatalog" class="assign-preview">
          <img v-if="catalogImageUrls[selectedAssignCatalog.id]" :src="catalogImageUrls[selectedAssignCatalog.id]" :alt="selectedAssignCatalog.name" class="assign-image" />
          <div>
            <strong>{{ selectedAssignCatalog.name }}</strong>
            <p>{{ selectedAssignCatalog.category || 'Sin categoria' }}</p>
            <small>Salida: {{ fmtDate(selectedAssignCatalog.releaseDate) || 'N/D' }}</small>
          </div>
        </div>
        <label>Abono inicial</label>
        <input v-model.number="assignForm.initialPaymentAmount" class="input" type="number" min="0" step="0.01" />
        <label>Metodo</label>
        <select v-model="assignForm.initialPaymentMethod" class="input">
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
        </select>
        <label>Notas</label>
        <textarea v-model="assignForm.notes" class="input" rows="2" />
        <button class="primary-btn" @click="assignCatalogItem">Crear preventa</button>
      </div>
    </div>

    <div v-if="showDetail && detail" class="modal-overlay" @click.self="closeDetail">
      <div class="modal-card large">
        <div class="modal-head"><h3>{{ detail.preorder.preorderNumber }}</h3><button class="mini-btn" @click="closeDetail">Cerrar</button></div>
        <div class="detail-head">
          <img v-if="detailImageUrl" :src="detailImageUrl" :alt="detail.preorder.catalogName || detail.preorder.preorderNumber" class="detail-image" />
          <div>
            <p>Cliente: <strong>{{ detail.preorder.customerName }}</strong></p>
            <p>Base: <strong>{{ detail.preorder.catalogName || 'Manual' }}</strong><span v-if="detail.preorder.category"> | {{ detail.preorder.category }}</span></p>
            <p>Estado: <strong>{{ detail.preorder.status }}</strong> | Total: ${{ money(detail.preorder.totalAmount) }} | Pagado: ${{ money(detail.preorder.amountPaid) }} | Pendiente: ${{ money(detail.preorder.amountDue) }}</p>
          </div>
        </div>
        <div class="row-actions">
          <button class="mini-btn" @click="openPaymentModal(detail.preorder.id)">Registrar abono</button>
          <button class="mini-btn" @click="markFulfilled(detail.preorder.id)">Marcar surtida</button>
          <button class="mini-btn danger" @click="cancelPreorder(detail.preorder.id)">Cancelar</button>
        </div>
        <h4>Items</h4>
        <ul><li v-for="it in detail.items" :key="it.id">{{ it.productName }} x{{ it.quantity }} - ${{ money(it.lineTotal) }}</li></ul>
        <h4>Pagos</h4>
        <ul><li v-for="pay in detail.payments" :key="pay.id">{{ fmtDate(pay.createdAt) }} - ${{ money(pay.amount) }} ({{ pay.paymentMethod }})</li></ul>
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
const preorderCatalog = ref([])
const preorders = ref([])
const summary = ref(null)
const detail = ref(null)
const detailImageUrl = ref('')
const catalogImagePreview = ref('')
const errorMessage = ref('')
const message = ref('')
const lastImportResult = ref(null)
const catalogOptions = reactive({ categories: [] })
const catalogImageUrls = reactive({})

const showCatalogModal = ref(false)
const showAssignModal = ref(false)
const showDetail = ref(false)
const showPayment = ref(false)
const paymentPreorderId = ref(null)

const catalogFilters = reactive({ query: '', category: '', dateFrom: '', dateTo: '' })
const assignedFilters = reactive({ query: '', status: '', customerId: '', dateFrom: '', dateTo: '' })
const paymentForm = reactive({ amount: 0, paymentMethod: 'cash', notes: '' })
const catalogForm = reactive({ id: null, code: '', name: '', category: '', description: '', productId: 0, sku: '', image: '', releaseDate: '', dueDate: '', unitPrice: 0, quantityDefault: 1 })
const assignForm = reactive({ customerId: '', catalogId: '', initialPaymentAmount: 0, initialPaymentMethod: 'cash', notes: '' })

const money = (v) => Number(v || 0).toFixed(2)
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '')
const selectedAssignCatalog = computed(() => preorderCatalog.value.find((item) => String(item.id) === String(assignForm.catalogId)) || null)
const groupedAssignedPreorders = computed(() => {
  const map = new Map()

  for (const preorder of preorders.value || []) {
    const customerKey = preorder.customerId || `no-customer-${preorder.id}`
    const existing = map.get(customerKey) || {
      customerId: preorder.customerId,
      customerName: preorder.customerName || 'Sin cliente',
      preorders: [],
      totalAmount: 0,
      amountPaid: 0,
      amountDue: 0,
      catalogNames: '',
      nextReleaseDate: '',
      firstOpenPreorderId: null,
    }

    existing.preorders.push(preorder)
    existing.totalAmount += Number(preorder.totalAmount || 0)
    existing.amountPaid += Number(preorder.amountPaid || 0)
    existing.amountDue += Number(preorder.amountDue || 0)

    if (!existing.firstOpenPreorderId && !['cancelled', 'fulfilled'].includes(String(preorder.status || '')) && Number(preorder.amountDue || 0) > 0) {
      existing.firstOpenPreorderId = preorder.id
    }

    if (preorder.releaseDate) {
      const releaseTime = new Date(preorder.releaseDate).getTime()
      const currentTime = existing.nextReleaseDate ? new Date(existing.nextReleaseDate).getTime() : Number.POSITIVE_INFINITY
      if (releaseTime < currentTime) {
        existing.nextReleaseDate = preorder.releaseDate
      }
    }

    map.set(customerKey, existing)
  }

  return Array.from(map.values()).map((group) => ({
    ...group,
    catalogNames: Array.from(new Set(group.preorders.map((row) => row.catalogName || row.preorderNumber))).join(', '),
  })).sort((a, b) => Number(b.amountDue || 0) - Number(a.amountDue || 0))
})

function clearFeedback() {
  errorMessage.value = ''
  message.value = ''
}

async function loadCatalogOptions() {
  try {
    const response = await window.posAPI.getProductCatalogOptions()
    catalogOptions.categories = response?.categories || []
  } catch {
    catalogOptions.categories = []
  }
}

async function loadCatalogs() {
  const [customerData, productData] = await Promise.all([window.posAPI.getCustomers(), window.posAPI.getProducts()])
  customers.value = customerData || []
  products.value = productData || []
}

async function loadPreorderCatalog() {
  preorderCatalog.value = await window.posAPI.getPreorderCatalog({
    query: catalogFilters.query || undefined,
    category: catalogFilters.category || undefined,
    dateFrom: catalogFilters.dateFrom || undefined,
    dateTo: catalogFilters.dateTo || undefined,
  }) || []

  await Promise.all(preorderCatalog.value.map(async (item) => {
    if (!item.image || catalogImageUrls[item.id]) return
    catalogImageUrls[item.id] = await window.posAPI.getProductImageUrl(item.image)
  }))
}

async function loadPreorders() {
  preorders.value = await window.posAPI.getPreorders({
    query: assignedFilters.query || undefined,
    status: assignedFilters.status || undefined,
    customerId: assignedFilters.customerId ? Number(assignedFilters.customerId) : undefined,
    dateFrom: assignedFilters.dateFrom || undefined,
    dateTo: assignedFilters.dateTo || undefined,
  }) || []
}

async function loadSummary() {
  summary.value = await window.posAPI.getPreorderSummary()
}

function openCatalogModal(item = null) {
  clearFeedback()
  catalogForm.id = item?.id || null
  catalogForm.code = item?.code || ''
  catalogForm.name = item?.name || ''
  catalogForm.category = item?.category || ''
  catalogForm.description = item?.description || ''
  catalogForm.productId = item?.productId || 0
  catalogForm.sku = item?.sku || ''
  catalogForm.image = item?.image || ''
  catalogForm.releaseDate = item?.releaseDate ? String(item.releaseDate).slice(0, 10) : ''
  catalogForm.dueDate = item?.dueDate ? String(item.dueDate).slice(0, 10) : ''
  catalogForm.unitPrice = Number(item?.unitPrice || 0)
  catalogForm.quantityDefault = Number(item?.quantityDefault || 1)
  catalogImagePreview.value = item ? (catalogImageUrls[item.id] || '') : ''
  showCatalogModal.value = true
}

function handleCatalogProductChange() {
  const product = products.value.find((entry) => Number(entry.id) === Number(catalogForm.productId))
  if (!product) return
  if (!catalogForm.name) catalogForm.name = product.name || ''
  catalogForm.sku = product.sku || catalogForm.sku
  catalogForm.category = product.category || catalogForm.category
  if (!catalogForm.unitPrice) catalogForm.unitPrice = Number(product.price || 0)
  if (!catalogForm.image) catalogForm.image = product.image || ''
  if (product.image) {
    window.posAPI.getProductImageUrl(product.image).then((url) => { catalogImagePreview.value = url || '' })
  }
}

async function selectCatalogImage() {
  const result = await window.posAPI.selectProductImage()
  if (!result?.success || result?.canceled) return
  catalogForm.image = result.fileName || ''
  catalogImagePreview.value = await window.posAPI.getProductImageUrl(catalogForm.image)
}

async function saveCatalogItem() {
  try {
    clearFeedback()
    const payload = {
      id: catalogForm.id,
      code: catalogForm.code,
      name: catalogForm.name,
      category: catalogForm.category,
      description: catalogForm.description,
      productId: Number(catalogForm.productId || 0) || null,
      sku: catalogForm.sku,
      image: catalogForm.image,
      releaseDate: catalogForm.releaseDate || null,
      dueDate: catalogForm.dueDate || null,
      unitPrice: Number(catalogForm.unitPrice || 0),
      quantityDefault: Number(catalogForm.quantityDefault || 1),
    }
    if (catalogForm.id) {
      await window.posAPI.updatePreorderCatalogItem(payload)
      message.value = 'Preventa base actualizada.'
    } else {
      await window.posAPI.createPreorderCatalogItem(payload)
      message.value = 'Preventa base creada.'
    }
    showCatalogModal.value = false
    await loadPreorderCatalog()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo guardar la preventa base.'
  }
}

async function deleteCatalogItem(item) {
  if (!window.confirm(`Desactivar preventa base ${item.name}?`)) return
  try {
    clearFeedback()
    await window.posAPI.deletePreorderCatalogItem({ id: item.id })
    message.value = 'Preventa base desactivada.'
    await loadPreorderCatalog()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo desactivar la preventa base.'
  }
}

function openAssignModal(item = null) {
  clearFeedback()
  assignForm.customerId = ''
  assignForm.catalogId = item ? String(item.id) : ''
  assignForm.initialPaymentAmount = 0
  assignForm.initialPaymentMethod = 'cash'
  assignForm.notes = item?.description || ''
  showAssignModal.value = true
}

function applyAssignSelection() {
  assignForm.notes = selectedAssignCatalog.value?.description || ''
}

async function assignCatalogItem() {
  try {
    clearFeedback()
    await window.posAPI.assignPreorderCatalogItem({
      customerId: Number(assignForm.customerId || 0),
      catalogId: Number(assignForm.catalogId || 0),
      initialPaymentAmount: Number(assignForm.initialPaymentAmount || 0),
      initialPaymentMethod: assignForm.initialPaymentMethod,
      notes: assignForm.notes,
    })
    showAssignModal.value = false
    message.value = 'Preventa asignada al cliente.'
    await Promise.all([loadPreorders(), loadSummary()])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo asignar la preventa.'
  }
}

async function openDetail(preorderId) {
  detail.value = await window.posAPI.getPreorderById(preorderId)
  detailImageUrl.value = detail.value?.preorder?.image ? await window.posAPI.getProductImageUrl(detail.value.preorder.image) : ''
  showDetail.value = true
}

function closeDetail() {
  showDetail.value = false
  detail.value = null
  detailImageUrl.value = ''
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
    clearFeedback()
    await window.posAPI.addPreorderPayment({
      preorderId: Number(paymentPreorderId.value),
      amount: Number(paymentForm.amount || 0),
      paymentMethod: paymentForm.paymentMethod,
      notes: paymentForm.notes,
    })
    showPayment.value = false
    message.value = 'Abono registrado.'
    await Promise.all([loadPreorders(), loadSummary()])
    if (showDetail.value && detail.value?.preorder?.id) await openDetail(detail.value.preorder.id)
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo registrar el abono.'
  }
}

async function markFulfilled(preorderId) {
  clearFeedback()
  await window.posAPI.markPreorderFulfilled({ preorderId: Number(preorderId), deductStock: true, createSale: false })
  message.value = 'Preventa marcada como surtida.'
  await Promise.all([loadPreorders(), loadSummary(), openDetail(preorderId)])
}

async function cancelPreorder(preorderId) {
  clearFeedback()
  const notes = window.prompt('Motivo de cancelacion:') || ''
  await window.posAPI.cancelPreorder({ preorderId: Number(preorderId), notes })
  message.value = 'Preventa cancelada.'
  await Promise.all([loadPreorders(), loadSummary(), openDetail(preorderId)])
}

async function importFromExcel() {
  try {
    clearFeedback()
    lastImportResult.value = await window.posAPI.importPreordersFromExcel()
    if (!lastImportResult.value?.success || lastImportResult.value?.canceled) return
    message.value = `Catalogo importado: ${lastImportResult.value.created} creadas y ${lastImportResult.value.updated || 0} actualizadas.`
    await loadPreorderCatalog()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo importar el catalogo.'
  }
}

async function downloadTemplate() {
  try {
    clearFeedback()
    const result = await window.posAPI.exportPreorderTemplate()
    if (!result?.success || result?.canceled) return
    message.value = 'Plantilla del catalogo exportada.'
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo exportar la plantilla.'
  }
}

async function exportPurchaseList() {
  try {
    clearFeedback()
    const result = await window.posAPI.exportPreorderPurchaseList()
    if (!result?.success || result?.canceled) return
    message.value = 'Lista de compra de preventas exportada.'
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo exportar la lista de compra.'
  }
}

onMounted(async () => {
  try {
    await Promise.all([loadCatalogOptions(), loadCatalogs(), loadPreorderCatalog(), loadPreorders(), loadSummary()])
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo cargar la pantalla de preventas.'
  }
})
</script>

<style scoped>
.preorders-layout { min-height: 100vh; background: #1e1e1e; color: #f5f5f5; padding: 20px; }
.preorders-header, .panel-head, .modal-head, .row, .row-actions, .detail-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.preorders-header { margin-bottom: 16px; }
.preorders-header h1, .panel-head h2 { margin: 0; color: #f2b138; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 14px; }
.summary-card, .card, .modal-card { background: #232323; border: 1px solid #323232; border-radius: 14px; padding: 14px; }
.summary-card span { display: block; color: #9ca3af; }
.summary-card strong { color: #f2b138; font-size: 22px; }
.filters, .form-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 12px 0; }
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
.catalog-card { background: #1f2937; border-radius: 14px; overflow: hidden; border: 1px solid #374151; }
.catalog-image, .detail-image, .assign-image, .preview-image { width: 100%; max-height: 200px; object-fit: cover; display: block; }
.catalog-image.placeholder { min-height: 180px; display: flex; align-items: center; justify-content: center; color: #94a3b8; background: #111827; }
.catalog-body { padding: 12px; display: grid; gap: 8px; }
.table-wrap { overflow: auto; }
.report-table { width: 100%; border-collapse: collapse; }
.report-table th, .report-table td { padding: 10px; border-bottom: 1px solid #374151; text-align: left; }
.input { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid #3a3a3a; background: #2a2a2a; color: white; }
.primary-btn, .secondary-btn, .mini-btn { border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 700; }
.primary-btn { background: #22c55e; color: white; }
.secondary-btn { background: #2563eb; color: white; }
.mini-btn { background: #334155; color: white; font-size: 12px; }
.mini-btn.danger { background: #b91c1c; }
.feedback { margin-bottom: 12px; padding: 12px; border-radius: 12px; }
.feedback.success { background: #14532d; }
.feedback.error { background: #7f1d1d; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 60; }
.modal-card { width: min(880px, 100%); max-height: 92vh; overflow: auto; background: #111827; }
.modal-card.large { width: min(1080px, 100%); }
.full { grid-column: 1 / -1; }
.image-row, .assign-preview { display: flex; gap: 10px; align-items: center; }
.empty-state { color: #9ca3af; padding: 20px; text-align: center; }
@media (max-width: 1100px) {
  .summary-grid, .filters, .form-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 720px) {
  .summary-grid, .filters, .form-grid { grid-template-columns: 1fr; }
  .preorders-header, .detail-head, .assign-preview { flex-direction: column; align-items: stretch; }
}
</style>
