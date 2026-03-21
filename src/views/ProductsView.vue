<template>
  <div class="products-layout">
    <header class="products-header">
      <div>
        <h1>Productos e inventario</h1>
        <p>Alta manual, ajustes de stock, entradas y movimientos</p>
      </div>

      <div class="header-actions">
        <button class="secondary-btn" @click="handleExportTemplate">
          Descargar plantilla
        </button>
        <button class="secondary-btn" @click="handleImportExcel">
          Importar Excel
        </button>
        <button class="back-btn" @click="$router.push('/')">
          Volver al POS
        </button>
      </div>
    </header>

    <section class="products-grid">
      <div class="card">
        <div class="form-title-row">
          <h2>{{ editingId ? 'Editar producto' : 'Agregar producto' }}</h2>
          <button v-if="editingId" class="cancel-btn" @click="cancelEdit">
            Cancelar edicion
          </button>
        </div>

        <div v-if="lowStockCount > 0" class="stock-alert-box">
          Hay {{ lowStockCount }} producto(s) activos con stock bajo.
        </div>

        <div class="form-grid">
          <div>
            <label>SKU</label>
            <input v-model="form.sku" class="input" />
          </div>

          <div>
            <label>Codigo de barras</label>
            <input v-model="form.barcode" class="input" />
          </div>

          <div class="full">
            <label>Nombre</label>
            <input v-model="form.name" class="input" />
          </div>

          <div>
            <label>Categoria</label>
            <input v-model="form.category" class="input" />
          </div>

          <div>
            <label>Precio</label>
            <input v-model.number="form.price" type="number" min="0" step="0.01" class="input" />
          </div>

          <div>
            <label>Costo</label>
            <input v-model.number="form.cost" type="number" min="0" step="0.01" class="input" />
          </div>

          <div>
            <label>Stock</label>
            <input v-model.number="form.stock" type="number" min="0" step="1" class="input" />
          </div>

          <div>
            <label>Stock minimo</label>
            <input v-model.number="form.min_stock" type="number" min="0" step="1" class="input" />
          </div>

          <div class="full">
            <label>Imagen</label>

            <div class="image-picker-row">
              <input
                v-model="form.image"
                class="input"
                placeholder="Nombre de imagen"
                readonly
              />
              <button
                type="button"
                class="secondary-btn small-btn"
                @click="handleSelectImage"
              >
                Seleccionar
              </button>
            </div>

            <div v-if="imagePreviewUrl" class="image-preview-box">
              <img
                :src="imagePreviewUrl"
                alt="Preview"
                class="image-preview"
                @error="handlePreviewError"
              />
            </div>
            <div v-else class="image-preview-empty">
              Sin preview de imagen
            </div>
          </div>
        </div>

        <div v-if="message" class="message success">
          {{ message }}
        </div>

        <div v-if="errorMessage" class="message error">
          {{ errorMessage }}
        </div>

        <button class="primary-btn" @click="handleSaveProduct">
          {{ editingId ? 'Guardar cambios' : 'Guardar producto' }}
        </button>
      </div>

      <div class="right-column">
        <div class="card">
          <div class="list-header">
            <h2>Productos activos</h2>
            <span>{{ products.length }} productos</span>
          </div>

          <div v-if="products.length" class="product-list">
            <div
              v-for="product in products"
              :key="product.id"
              class="product-row"
              @click="selectProduct(product)"
            >
              <div class="product-main">
                <strong>
                  {{ product.name }}
                  <span v-if="isLowStock(product)" class="low-stock-badge">
                    Stock bajo
                  </span>
                </strong>
                <p>{{ product.sku || 'Sin SKU' }} · {{ product.category || 'Sin categoria' }}</p>
                <small>{{ product.barcode || 'Sin codigo de barras' }}</small>
                <small>
                  Minimo: {{ Number(product.min_stock || 0) }}
                </small>
              </div>

              <div class="product-meta">
                <span :class="{ 'low-stock-text': isLowStock(product) }">
                  Stock: {{ Number(product.stock || 0) }}
                </span>
                <strong>${{ formatPrice(product.price) }}</strong>

                <div class="inventory-actions" @click.stop>
                  <button class="small-action-btn" @click="openAdjustModal(product)">
                    Ajustar stock
                  </button>
                  <button class="small-action-btn" @click="openEntryModal(product)">
                    Entrada
                  </button>
                  <button class="small-action-btn" @click="openMovementsModal(product)">
                    Movimientos
                  </button>
                </div>

                <button class="deactivate-btn" @click.stop="handleDeactivateProduct(product)">
                  Desactivar
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            No hay productos activos.
          </div>
        </div>

        <div class="card inactive-card">
          <div class="list-header">
            <h2>Productos desactivados</h2>
            <span>{{ inactiveProducts.length }} productos</span>
          </div>

          <div v-if="inactiveProducts.length" class="product-list">
            <div
              v-for="product in inactiveProducts"
              :key="product.id"
              class="product-row inactive-row"
            >
              <div class="product-main">
                <strong>{{ product.name }}</strong>
                <p>{{ product.sku || 'Sin SKU' }} · {{ product.category || 'Sin categoria' }}</p>
                <small>{{ product.barcode || 'Sin codigo de barras' }}</small>
              </div>

              <div class="product-meta">
                <span :class="{ 'low-stock-text': isLowStock(product) }">
                  Stock: {{ Number(product.stock || 0) }}
                </span>
                <strong>${{ formatPrice(product.price) }}</strong>

                <button class="reactivate-btn" @click="handleReactivateProduct(product)">
                  Reactivar
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            No hay productos desactivados.
          </div>
        </div>
      </div>
    </section>

    <div v-if="adjustModal.open" class="modal-backdrop" @click.self="closeAdjustModal">
      <div class="modal-card">
        <h3>Ajustar stock</h3>
        <p class="modal-subtitle">{{ adjustModal.productName }} · Stock actual: {{ adjustModal.currentStock }}</p>

        <div class="modal-grid">
          <div>
            <label>Modo</label>
            <select v-model="adjustModal.mode" class="input">
              <option value="add">Sumar</option>
              <option value="remove">Restar</option>
              <option value="set">Fijar</option>
            </select>
          </div>

          <div>
            <label>Cantidad</label>
            <input v-model.number="adjustModal.quantity" class="input" type="number" min="0" step="1" />
          </div>

          <div class="full">
            <label>Motivo</label>
            <textarea v-model="adjustModal.notes" class="input" rows="3" placeholder="Motivo obligatorio"></textarea>
          </div>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="closeAdjustModal">Cancelar</button>
          <button class="primary-btn inline" @click="handleSubmitAdjust">Guardar ajuste</button>
        </div>
      </div>
    </div>

    <div v-if="entryModal.open" class="modal-backdrop" @click.self="closeEntryModal">
      <div class="modal-card">
        <h3>Entrada de mercancia</h3>
        <p class="modal-subtitle">{{ entryModal.productName }} · Stock actual: {{ entryModal.currentStock }}</p>

        <div class="modal-grid">
          <div>
            <label>Cantidad</label>
            <input v-model.number="entryModal.quantity" class="input" type="number" min="0" step="1" />
          </div>

          <div>
            <label>Costo (opcional)</label>
            <input v-model="entryModal.cost" class="input" type="number" min="0" step="0.01" />
          </div>

          <div class="full">
            <label>Referencia (opcional)</label>
            <input v-model="entryModal.reference" class="input" placeholder="Compra, factura, folio" />
          </div>

          <div class="full">
            <label>Nota</label>
            <textarea v-model="entryModal.notes" class="input" rows="3" placeholder="Detalle de la entrada"></textarea>
          </div>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="closeEntryModal">Cancelar</button>
          <button class="primary-btn inline" @click="handleSubmitEntry">Registrar entrada</button>
        </div>
      </div>
    </div>

    <div v-if="movementsModal.open" class="modal-backdrop" @click.self="closeMovementsModal">
      <div class="modal-card large">
        <h3>Movimientos de inventario</h3>
        <p class="modal-subtitle">{{ movementsModal.productName }}</p>

        <div v-if="movementsLoading" class="empty-state">Cargando movimientos...</div>

        <div v-else-if="movementsList.length" class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Antes</th>
                <th>Despues</th>
                <th>Referencia</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="mv in movementsList" :key="mv.id">
                <td>{{ formatDate(mv.createdAt) }}</td>
                <td>{{ formatMovementType(mv.type) }}</td>
                <td>{{ Number(mv.quantity || 0) }}</td>
                <td>{{ Number(mv.stockBefore || 0) }}</td>
                <td>{{ Number(mv.stockAfter || 0) }}</td>
                <td>{{ formatReference(mv.referenceType, mv.referenceId) }}</td>
                <td>{{ mv.notes || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">Este producto aun no tiene movimientos.</div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="closeMovementsModal">Cerrar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const products = ref([])
const inactiveProducts = ref([])
const message = ref('')
const errorMessage = ref('')
const editingId = ref(null)
const imagePreviewUrl = ref('')

const movementsList = ref([])
const movementsLoading = ref(false)

const adjustModal = reactive({
  open: false,
  productId: null,
  productName: '',
  currentStock: 0,
  mode: 'add',
  quantity: 0,
  notes: '',
})

const entryModal = reactive({
  open: false,
  productId: null,
  productName: '',
  currentStock: 0,
  quantity: 0,
  cost: '',
  reference: '',
  notes: '',
})

const movementsModal = reactive({
  open: false,
  productId: null,
  productName: '',
})

const form = reactive({
  sku: '',
  barcode: '',
  name: '',
  category: '',
  price: 0,
  cost: 0,
  stock: 0,
  min_stock: 0,
  image: '',
})

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function formatMovementType(type) {
  if (type === 'in') return 'Entrada'
  if (type === 'sale') return 'Venta'
  if (type === 'adjust') return 'Ajuste'
  if (type === 'loss') return 'Merma'
  if (type === 'return') return 'Devolucion'
  return type || 'N/D'
}

function formatReference(referenceType, referenceId) {
  const type = referenceType || 'manual'
  return referenceId ? `${type} #${referenceId}` : type
}

function isLowStock(product) {
  return Number(product?.stock || 0) <= Number(product?.min_stock || 0)
}

const lowStockCount = computed(() => {
  return products.value.filter(product => isLowStock(product)).length
})

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

function resetForm() {
  editingId.value = null
  form.sku = ''
  form.barcode = ''
  form.name = ''
  form.category = ''
  form.price = 0
  form.cost = 0
  form.stock = 0
  form.min_stock = 0
  form.image = ''
  imagePreviewUrl.value = ''
}

function cancelEdit() {
  resetForm()
  clearMessages()
}

async function loadProducts() {
  try {
    const data = await window.posAPI.getProducts()
    products.value = data || []

    const inactive = await window.posAPI.getInactiveProducts()
    inactiveProducts.value = inactive || []
  } catch (error) {
    console.error('Error cargando productos:', error)
    products.value = []
    inactiveProducts.value = []
  }
}

async function resolvePreview(fileName) {
  if (!fileName) return ''

  try {
    const url = await window.posAPI.getProductImageUrl(fileName)
    return url || ''
  } catch (error) {
    console.error('Error resolviendo preview:', error)
    return ''
  }
}

async function handleSelectImage() {
  try {
    clearMessages()

    const result = await window.posAPI.selectProductImage()

    if (result?.canceled) return

    if (result?.success) {
      form.image = result.fileName || ''
      imagePreviewUrl.value = await resolvePreview(result.fileName)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error?.message || 'No se pudo seleccionar la imagen.'
  }
}

function handlePreviewError() {
  imagePreviewUrl.value = ''
}

async function selectProduct(product) {
  clearMessages()
  editingId.value = product.id
  form.sku = product.sku || ''
  form.barcode = product.barcode || ''
  form.name = product.name || ''
  form.category = product.category || ''
  form.price = Number(product.price || 0)
  form.cost = Number(product.cost || 0)
  form.stock = Number(product.stock || 0)
  form.min_stock = Number(product.min_stock || 0)
  form.image = product.image || ''
  imagePreviewUrl.value = await resolvePreview(product.image)
}

async function handleSaveProduct() {
  try {
    clearMessages()

    const payload = {
      sku: form.sku,
      barcode: form.barcode,
      name: form.name,
      category: form.category,
      price: Number(form.price || 0),
      cost: Number(form.cost || 0),
      stock: Number(form.stock || 0),
      min_stock: Number(form.min_stock || 0),
      image: form.image,
    }

    let result

    if (editingId.value) {
      result = await window.posAPI.updateProduct({
        id: editingId.value,
        ...payload,
      })
    } else {
      result = await window.posAPI.createProduct(payload)
    }

    if (result?.success) {
      message.value = editingId.value
        ? 'Producto actualizado correctamente.'
        : 'Producto creado correctamente.'

      resetForm()
      await loadProducts()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo guardar el producto.'
  }
}

async function handleImportExcel() {
  try {
    clearMessages()

    const result = await window.posAPI.importProductsFromExcel()

    if (result?.canceled) return

    if (result?.success) {
      message.value = `Importacion completada. Nuevos: ${result.created}, actualizados: ${result.updated}, omitidos: ${result.skipped}.`
      resetForm()
      await loadProducts()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo importar el archivo.'
  }
}

async function handleExportTemplate() {
  try {
    clearMessages()

    const result = await window.posAPI.exportProductTemplate()

    if (result?.canceled) return

    if (result?.success) {
      message.value = `Plantilla guardada en: ${result.filePath}`
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo exportar la plantilla.'
  }
}

async function handleDeactivateProduct(product) {
  const confirmed = window.confirm(`Deseas desactivar el producto "${product.name}"?`)
  if (!confirmed) return

  try {
    clearMessages()

    const result = await window.posAPI.deactivateProduct(product.id)

    if (result?.success) {
      message.value = 'Producto desactivado correctamente.'

      if (editingId.value === product.id) {
        resetForm()
      }

      await loadProducts()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo desactivar el producto.'
  }
}

async function handleReactivateProduct(product) {
  const confirmed = window.confirm(`Deseas reactivar el producto "${product.name}"?`)
  if (!confirmed) return

  try {
    clearMessages()

    const result = await window.posAPI.reactivateProduct(product.id)

    if (result?.success) {
      message.value = 'Producto reactivado correctamente.'
      await loadProducts()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo reactivar el producto.'
  }
}

function openAdjustModal(product) {
  clearMessages()
  adjustModal.open = true
  adjustModal.productId = Number(product.id)
  adjustModal.productName = product.name || ''
  adjustModal.currentStock = Number(product.stock || 0)
  adjustModal.mode = 'add'
  adjustModal.quantity = 0
  adjustModal.notes = ''
}

function closeAdjustModal() {
  adjustModal.open = false
}

async function handleSubmitAdjust() {
  try {
    clearMessages()

    if (!adjustModal.notes.trim()) {
      throw new Error('Debes capturar el motivo del ajuste.')
    }

    const quantity = Number(adjustModal.quantity || 0)
    if (quantity < 0) {
      throw new Error('La cantidad no puede ser menor a 0.')
    }

    const result = await window.posAPI.adjustStock({
      productId: adjustModal.productId,
      mode: adjustModal.mode,
      quantity,
      notes: adjustModal.notes,
    })

    if (result?.success) {
      message.value = 'Ajuste de stock guardado correctamente.'
      closeAdjustModal()
      await loadProducts()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo ajustar el stock.'
  }
}

function openEntryModal(product) {
  clearMessages()
  entryModal.open = true
  entryModal.productId = Number(product.id)
  entryModal.productName = product.name || ''
  entryModal.currentStock = Number(product.stock || 0)
  entryModal.quantity = 0
  entryModal.cost = ''
  entryModal.reference = ''
  entryModal.notes = ''
}

function closeEntryModal() {
  entryModal.open = false
}

async function handleSubmitEntry() {
  try {
    clearMessages()

    const quantity = Number(entryModal.quantity || 0)
    if (quantity <= 0) {
      throw new Error('La cantidad debe ser mayor a 0.')
    }

    const payload = {
      productId: entryModal.productId,
      quantity,
      notes: entryModal.notes,
      reference: entryModal.reference,
    }

    if (entryModal.cost !== '' && entryModal.cost !== null) {
      payload.cost = Number(entryModal.cost)
    }

    const result = await window.posAPI.addStockEntry(payload)

    if (result?.success) {
      message.value = 'Entrada de mercancia registrada correctamente.'
      closeEntryModal()
      await loadProducts()
    }
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo registrar la entrada.'
  }
}

async function openMovementsModal(product) {
  clearMessages()
  movementsModal.open = true
  movementsModal.productId = Number(product.id)
  movementsModal.productName = product.name || ''

  movementsLoading.value = true
  movementsList.value = []

  try {
    const data = await window.posAPI.getProductMovements(product.id)
    movementsList.value = data || []
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudieron cargar los movimientos.'
  } finally {
    movementsLoading.value = false
  }
}

function closeMovementsModal() {
  movementsModal.open = false
  movementsList.value = []
}

onMounted(async () => {
  await loadProducts()
})
</script>

<style scoped>
.products-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.products-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.products-header h1 {
  margin: 0;
  color: #f2b138;
}

.products-header p {
  margin: 6px 0 0 0;
  color: #bcbcbc;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.products-grid {
  display: grid;
  grid-template-columns: 480px 1fr;
  gap: 20px;
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
}

.form-title-row,
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.full {
  grid-column: 1 / -1;
  margin-top: 8px;
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

.primary-btn,
.secondary-btn,
.back-btn,
.cancel-btn {
  border: none;
  border-radius: 12px;
  padding: 14px 16px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  width: 100%;
  margin-top: 18px;
  background: #22c55e;
  color: white;
}

.primary-btn.inline {
  width: auto;
  margin-top: 0;
}

.secondary-btn {
  background: #2563eb;
  color: white;
}

.back-btn {
  background: #f29a2e;
  color: #111;
}

.cancel-btn {
  background: #525252;
  color: white;
  padding: 10px 12px;
}

.message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 10px;
}

.message.success {
  background: #166534;
}

.message.error {
  background: #7f1d1d;
}

.stock-alert-box {
  margin: 16px 0;
  background: #92400e;
  color: white;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
}

.product-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.product-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2c2c2c;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid transparent;
  cursor: pointer;
}

.product-row:hover {
  border-color: #f2b138;
}

.product-main {
  flex: 1;
}

.product-row p,
.product-row small {
  display: block;
  margin: 4px 0 0 0;
  color: #bcbcbc;
}

.product-meta {
  text-align: right;
}

.inventory-actions {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.small-action-btn {
  background: #334155;
  border: none;
  border-radius: 8px;
  padding: 7px 10px;
  color: #f8fafc;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
}

.small-action-btn:hover {
  background: #475569;
}

.deactivate-btn {
  margin-top: 8px;
  background: #b91c1c;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  color: white;
  cursor: pointer;
  font-weight: 700;
}

.reactivate-btn {
  margin-top: 8px;
  background: #15803d;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  color: white;
  cursor: pointer;
  font-weight: 700;
}

.inactive-card {
  border-color: #4b5563;
}

.inactive-row {
  opacity: 0.9;
}

.empty-state {
  margin-top: 16px;
  color: #bcbcbc;
  text-align: center;
  padding: 20px;
}

.low-stock-badge {
  display: inline-block;
  margin-left: 8px;
  background: #b45309;
  color: white;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  vertical-align: middle;
}

.low-stock-text {
  color: #f59e0b;
  font-weight: 700;
}

.image-picker-row {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.small-btn {
  padding: 12px 14px;
  white-space: nowrap;
}

.image-preview-box {
  margin-top: 12px;
}

.image-preview {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  display: block;
}

.image-preview-empty {
  margin-top: 12px;
  color: #9ca3af;
  font-size: 13px;
}

.modal-backdrop {
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
  width: min(760px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 18px;
  padding: 18px;
}

.modal-card.large {
  width: min(1080px, 100%);
}

.modal-card h3 {
  margin: 0;
  color: #f2b138;
}

.modal-subtitle {
  margin: 8px 0 0 0;
  color: #d1d5db;
}

.modal-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.table-wrap {
  margin-top: 12px;
  overflow: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
}

.report-table th,
.report-table td {
  padding: 10px;
  border-bottom: 1px solid #374151;
  text-align: left;
}

@media (max-width: 1200px) {
  .products-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .products-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .form-grid,
  .modal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
