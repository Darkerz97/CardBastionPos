<template>
  <div class="products-layout">
    <header class="products-header">
      <div>
        <h1>Productos</h1>
        <p>Alta manual, edición, importación y activación/desactivación</p>
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
            Cancelar edición
          </button>
        </div>

        <div v-if="lowStockCount > 0" class="stock-alert-box">
          ⚠️ Hay {{ lowStockCount }} producto(s) activos con stock bajo.
        </div>

        <div class="form-grid">
          <div>
            <label>SKU</label>
            <input v-model="form.sku" class="input" />
          </div>

          <div>
            <label>Código de barras</label>
            <input v-model="form.barcode" class="input" />
          </div>

          <div class="full">
            <label>Nombre</label>
            <input v-model="form.name" class="input" />
          </div>

          <div>
            <label>Categoría</label>
            <input v-model="form.category" class="input" />
          </div>

          <div>
            <label>Precio</label>
            <input v-model.number="form.price" type="number" step="0.01" class="input" />
          </div>

          <div>
            <label>Costo</label>
            <input v-model.number="form.cost" type="number" step="0.01" class="input" />
          </div>

          <div>
            <label>Stock</label>
            <input v-model.number="form.stock" type="number" step="1" class="input" />
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
                <p>{{ product.sku || 'Sin SKU' }} · {{ product.category || 'Sin categoría' }}</p>
                <small>{{ product.barcode || 'Sin código de barras' }}</small>
              </div>

              <div class="product-meta">
                <span :class="{ 'low-stock-text': isLowStock(product) }">
                  Stock: {{ product.stock }}
                </span>
                <strong>${{ formatPrice(product.price) }}</strong>

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
                <p>{{ product.sku || 'Sin SKU' }} · {{ product.category || 'Sin categoría' }}</p>
                <small>{{ product.barcode || 'Sin código de barras' }}</small>
              </div>

              <div class="product-meta">
                <span :class="{ 'low-stock-text': isLowStock(product) }">
                  Stock: {{ product.stock }}
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
const productImageMap = ref({})

const form = reactive({
  sku: '',
  barcode: '',
  name: '',
  category: '',
  price: 0,
  cost: 0,
  stock: 0,
  image: '',
})

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function isLowStock(product) {
  return Number(product?.stock || 0) <= 3
}

const lowStockCount = computed(() => {
  return products.value.filter(product => Number(product.stock || 0) <= 3).length
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
    await resolveProductImages(products.value)
  } catch (error) {
    console.error('Error cargando productos en POS:', error)
    products.value = []
    productImageMap.value = {}
  }
}

function handleProductImageError(productId) {
  productImageMap.value[productId] = ''
}

async function resolvePreview(fileName) {
  if (!fileName) return ''

  try {
    const url = await window.posAPI.getProductImageUrl(fileName)
    console.log('URL resuelta para preview:', url)
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
    console.log('Resultado seleccionar imagen:', result)

    if (result?.canceled) return

    if (result?.success) {
      form.image = result.fileName || ''
      imagePreviewUrl.value = await resolvePreview(result.fileName)
      console.log('Preview URL:', imagePreviewUrl.value)
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
      message.value = `Importación completada. Nuevos: ${result.created}, actualizados: ${result.updated}, omitidos: ${result.skipped}.`
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
  const confirmed = window.confirm(`¿Deseas desactivar el producto "${product.name}"?`)
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
  const confirmed = window.confirm(`¿Deseas reactivar el producto "${product.name}"?`)
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

async function resolveProductImages(list) {
  try {
    const entries = await Promise.all(
      (list || []).map(async (product) => {
        const imageUrl = product.image
          ? await window.posAPI.getProductImageUrl(product.image)
          : ''
        return [product.id, imageUrl]
      })
    )

    productImageMap.value = Object.fromEntries(entries)
  } catch (error) {
    console.error('Error resolviendo imágenes de productos:', error)
    productImageMap.value = {}
  }
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
</style>