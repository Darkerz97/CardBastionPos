<template>
  <div class="pos-layout">
    <aside class="sidebar">
      <div class="brand">
        <h1>Card Bastion</h1>
        <p>Point of Sale</p>
      </div>

      <div class="menu-block">
        <button class="menu-btn active">Nueva venta</button>
        <button class="menu-btn" @click="$router.push('/history')">Historial</button>
        <button class="menu-btn" @click="$router.push('/cash')">Caja</button>
        <button class="menu-btn" @click="$router.push('/products')">Productos</button>
        <button class="menu-btn" @click="$router.push('/backup')">Respaldo</button>
        <button class="menu-btn" @click="$router.push('/reports')">Reportes</button>
        <button class="menu-btn" @click="$router.push('/customers')">Clientes</button>
        <button class="menu-btn" @click="$router.push('/customers/history')">Historial por cliente</button>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <input
          ref="searchInputRef"
          v-model="search"
          class="search-input"
          type="text"
          placeholder="Buscar por nombre, SKU o escanear código..."
          @keydown.enter.prevent="handleScanOrExactSearch"
        />

        <button
          class="print-toggle-btn"
          :class="{ disabled: !printTicketsEnabled }"
          @click="togglePrintTickets"
        >
          {{ printTicketsEnabled ? 'Tickets: ON' : 'Tickets: OFF' }}
        </button>
      </header>

      <section class="content-grid">
        <div class="products-panel">
          <div class="panel-header">
            <h2>Productos</h2>
            <span>{{ filteredProducts.length }} resultados</span>
          </div>

          <div style="color: white; margin-bottom: 10px;">
            Productos cargados: {{ products.length }} | Filtrados: {{ filteredProducts.length }}
          </div>

          <div class="products-grid">
            <div
              class="product-card"
              v-for="product in filteredProducts"
              :key="product.id"
              @click="addToCart(product)"
            >
              <div class="product-image">
                <img
                  v-if="productImageMap[product.id]"
                  :src="productImageMap[product.id]"
                  alt="Producto"
                  class="product-card-image"
                  @error="handleProductImageError(product.id)"
                />
                <div v-else class="product-image-placeholder">
                  IMG
                </div>
              </div>

              <div class="product-info">
                <h3>
                  {{ product.name }}
                  <span v-if="Number(product.stock || 0) <= 3" class="low-stock-badge">
                    Bajo
                  </span>
                </h3>

                <p>{{ product.category || 'Sin categoría' }}</p>

                <small :class="{ 'low-stock-text': Number(product.stock || 0) <= 3 }">
                  Stock: {{ product.stock }}
                </small>

                <strong>$ {{ formatPrice(product.price) }}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="cart-panel">
          <div class="customer-box">
            <input
              v-model="customerSearch"
              class="input search-input"
              placeholder="Buscar cliente..."
              @input="handleCustomerSearch"
            />

            <div v-if="customerResults.length" class="customer-dropdown">
              <div
                v-for="c in customerResults"
                :key="c.id"
                class="customer-item"
                @click="selectCustomer(c)"
              >
                <div>
                  <strong>{{ c.name }}</strong>
                  <div style="font-size: 12px; color: #cbd5e1;">
                    {{ c.phone || 'Sin teléfono' }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="selectedCustomer" class="selected-customer">
              <div>
                Cliente: <strong>{{ selectedCustomer.name }}</strong>
                <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">
                  Crédito: ${{ formatPrice(selectedCustomer.store_credit || 0) }}
                </div>
              </div>

              <button class="clear-btn" @click="clearCustomer">
                ❌
              </button>
            </div>
          </div>

          <div v-if="lowStockCount > 0" class="stock-alert-box">
            ⚠️ Hay {{ lowStockCount }} producto(s) activos con stock bajo.
          </div>

          <div class="panel-header">
            <h2>Venta actual</h2>
            <span>{{ cart.totalItems }} artículos</span>
          </div>

          <div v-if="!hasOpenCash" class="cash-warning">
            <span>⚠️ No hay caja abierta. Debes abrir caja para vender.</span>
            <button class="open-cash-btn" @click="$router.push('/cash')">
              Abrir caja
            </button>
          </div>

          <div v-if="cartMessage" class="cart-warning">
            {{ cartMessage }}
          </div>

          <div v-if="cart.items.length" class="cart-items">
            <div class="cart-item" v-for="item in cart.items" :key="item.id">
              <div class="cart-item-info">
                <strong>{{ item.name }}</strong>
                <p>{{ item.sku }}</p>

                <div class="qty-controls">
                  <button @click="cart.decreaseQty(item.id)">−</button>
                  <span>{{ item.qty }}</span>
                  <button @click="increaseCartItem(item.id)">+</button>
                </div>
              </div>

              <div class="cart-item-right">
                <strong>$ {{ formatPrice(item.lineTotal) }}</strong>
                <button class="remove-btn" @click="cart.removeItem(item.id)">
                  Quitar
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-cart">
            No hay productos en el carrito
          </div>

          <div class="cart-summary">
            <div class="summary-row">
              <span>Subtotal</span>
              <strong>$ {{ formatPrice(cart.subtotal) }}</strong>
            </div>

            <div class="summary-row">
              <span>Descuento</span>
              <strong>$ 0.00</strong>
            </div>

            <div class="summary-row total">
              <span>Total</span>
              <strong>$ {{ formatPrice(cart.total) }}</strong>
            </div>

            <button
              class="pay-btn"
              :disabled="!cart.items.length || !hasOpenCash"
              @click="openPaymentModal"
            >
              Cobrar
            </button>
          </div>
        </div>
      </section>
    </main>

    <div v-if="showPaymentModal" class="modal-overlay" @click.self="closePaymentModal">
      <div class="modal">
        <div class="modal-header">
          <h2>Cobrar venta</h2>
          <button class="close-btn" @click="closePaymentModal">✕</button>
        </div>

        <div class="payment-methods">
          <button
            class="payment-method-btn"
            :class="{ active: paymentMethod === 'cash' }"
            @click="paymentMethod = 'cash'"
          >
            Efectivo
          </button>

          <button
            class="payment-method-btn"
            :class="{ active: paymentMethod === 'card' }"
            @click="paymentMethod = 'card'"
          >
            Tarjeta
          </button>
        </div>

        <div class="payment-summary">
          <div class="summary-row">
            <span>Total a cobrar</span>
            <strong>$ {{ formatPrice(cart.total) }}</strong>
          </div>

          <div v-if="selectedCustomer" class="credit-box">
            <div class="summary-row">
              <span>Crédito disponible</span>
              <strong>$ {{ formatPrice(selectedCustomer.store_credit || 0) }}</strong>
            </div>

            <label>Usar crédito</label>
            <input
              v-model.number="creditToUse"
              type="number"
              min="0"
              step="0.01"
              class="payment-input"
              placeholder="0.00"
              @input="validateCredit"
            />

            <button
              type="button"
              class="quick-cash-btn"
              style="margin-top: 10px; width: 100%;"
              @click="applyMaxCredit"
            >
              Aplicar crédito máximo
            </button>

            <div class="summary-row" style="margin-top: 12px;">
              <span>Total después de crédito</span>
              <strong>$ {{ formatPrice(remainingAfterCredit) }}</strong>
            </div>
          </div>

          <div v-if="paymentMethod === 'cash'" class="cash-section">
            <label>Monto recibido</label>
            <input
              v-model.number="cashReceived"
              type="number"
              min="0"
              step="0.01"
              class="payment-input"
              placeholder="0.00"
            />

            <div class="quick-cash-buttons">
              <button class="quick-cash-btn" @click="setExactAmount">Exacto</button>
              <button class="quick-cash-btn" @click="setCashAmount(20)">20</button>
              <button class="quick-cash-btn" @click="setCashAmount(50)">50</button>
              <button class="quick-cash-btn" @click="setCashAmount(100)">100</button>
              <button class="quick-cash-btn" @click="setCashAmount(200)">200</button>
              <button class="quick-cash-btn" @click="setCashAmount(500)">500</button>
            </div>

            <div class="summary-row total-change">
              <span>Cambio</span>
              <strong>$ {{ formatPrice(changeGiven) }}</strong>
            </div>
          </div>

          <div v-else class="card-section">
            <p>Pago con tarjeta seleccionado.</p>
          </div>
        </div>

        <div v-if="saleError" class="sale-error">
          {{ saleError }}
        </div>

        <button class="confirm-btn" @click="confirmSale" :disabled="savingSale">
          {{ savingSale ? 'Guardando...' : 'Confirmar venta' }}
        </button>
      </div>
    </div>

    <div v-if="saleSuccess" class="success-toast">
      Venta guardada correctamente. Folio: {{ saleSuccess }}
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCartStore } from '../stores/cartStore'

const products = ref([])
const search = ref('')
const searchInputRef = ref(null)
const cart = useCartStore()

const hasOpenCash = ref(false)
const showPaymentModal = ref(false)
const paymentMethod = ref('cash')
const cashReceived = ref(0)
const savingSale = ref(false)
const saleError = ref('')
const saleSuccess = ref('')
const printTicketsEnabled = ref(true)
const cartMessage = ref('')

const productImageMap = ref({})

const selectedCustomer = ref(null)
const customerSearch = ref('')
const customerResults = ref([])

const creditToUse = ref(0)

async function handleCustomerSearch() {
  if (!customerSearch.value.trim()) {
    customerResults.value = []
    return
  }

  customerResults.value = await window.posAPI.searchCustomers(customerSearch.value)
}

function selectCustomer(customer) {
  selectedCustomer.value = customer
  customerSearch.value = customer.name
  customerResults.value = []
  creditToUse.value = 0
}

function clearCustomer() {
  selectedCustomer.value = null
  customerSearch.value = ''
  customerResults.value = []
  creditToUse.value = 0
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

function handleProductImageError(productId) {
  productImageMap.value[productId] = ''
}

const lowStockCount = computed(() => {
  return products.value.filter(product => Number(product.stock || 0) <= 3).length
})

watch(paymentMethod, (newValue) => {
  if (newValue === 'cash') {
    cashReceived.value = Number(remainingAfterCredit.value || 0)
  }
})

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

async function checkCashStatus() {
  const session = await window.posAPI.getOpenCashSession()
  hasOpenCash.value = !!session
}

async function loadPrintSettings() {
  try {
    printTicketsEnabled.value = await window.posAPI.getPrintTicketsEnabled()
  } catch (error) {
    console.error('Error cargando configuración de impresión:', error)
  }
}

async function togglePrintTickets() {
  try {
    const newValue = !printTicketsEnabled.value
    const result = await window.posAPI.setPrintTicketsEnabled(newValue)

    if (result?.success) {
      printTicketsEnabled.value = result.enabled
    }
  } catch (error) {
    console.error('Error guardando configuración de impresión:', error)
  }
}

async function handleScanOrExactSearch() {
  const code = String(search.value || '').trim()
  if (!code) return

  try {
    const product = await window.posAPI.findProductByCode(code)

    if (product) {
      addToCart(product)
      search.value = ''
      await nextTick()
      searchInputRef.value?.focus()
    }
  } catch (error) {
    console.error('Error buscando producto por código:', error)
  }
}

function addToCart(product) {
  const result = cart.addProduct(product)

  if (!result?.success) {
    cartMessage.value = result?.message || 'No se pudo agregar el producto.'
    setTimeout(() => {
      cartMessage.value = ''
    }, 2500)
  }
}

function increaseCartItem(productId) {
  const result = cart.increaseQty(productId)

  if (!result?.success) {
    cartMessage.value = result?.message || 'No se pudo aumentar la cantidad.'
    setTimeout(() => {
      cartMessage.value = ''
    }, 2500)
  }
}

async function openPaymentModal() {
  creditToUse.value = 0
  await checkCashStatus()

  if (!hasOpenCash.value) {
    saleError.value = 'Debes abrir caja antes de realizar una venta.'
    return
  }

  paymentMethod.value = 'cash'
  cashReceived.value = Number(cart.total || 0)
  saleError.value = ''
  showPaymentModal.value = true
}

function closePaymentModal() {
  showPaymentModal.value = false
  saleError.value = ''

  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function setExactAmount() {
  cashReceived.value = Number(remainingAfterCredit.value || 0)
}

function setCashAmount(amount) {
  cashReceived.value = Number(amount || 0)
}

function validateCredit() {
  if (!selectedCustomer.value) {
    creditToUse.value = 0
    return
  }

  if (Number(creditToUse.value || 0) < 0) {
    creditToUse.value = 0
  }

  const available = Number(selectedCustomer.value.store_credit || 0)
  const total = Number(cart.total || 0)

  if (Number(creditToUse.value || 0) > available) {
    creditToUse.value = available
  }

  if (Number(creditToUse.value || 0) > total) {
    creditToUse.value = total
  }

  if (paymentMethod.value === 'cash' && Number(cashReceived.value || 0) < Number(remainingAfterCredit.value || 0)) {
    cashReceived.value = Number(remainingAfterCredit.value || 0)
  }
}

function applyMaxCredit() {
  if (!selectedCustomer.value) {
    creditToUse.value = 0
    return
  }

  const available = Number(selectedCustomer.value.store_credit || 0)
  const total = Number(cart.total || 0)
  creditToUse.value = Math.min(available, total)

  if (paymentMethod.value === 'cash' && Number(cashReceived.value || 0) < Number(remainingAfterCredit.value || 0)) {
    cashReceived.value = Number(remainingAfterCredit.value || 0)
  }
}

const remainingAfterCredit = computed(() => {
  const total = Number(cart.total || 0)
  const credit = Number(creditToUse.value || 0)
  return Math.max(total - credit, 0)
})

const changeGiven = computed(() => {
  if (paymentMethod.value !== 'cash') return 0
  return Math.max(Number(cashReceived.value || 0) - Number(remainingAfterCredit.value || 0), 0)
})

const filteredProducts = computed(() => {
  const term = search.value.trim().toLowerCase()

  if (!term) return products.value || []

  return (products.value || []).filter((product) => {
    return (
      String(product.name || '').toLowerCase().includes(term) ||
      String(product.sku || '').toLowerCase().includes(term) ||
      String(product.barcode || '').toLowerCase().includes(term)
    )
  })
})

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

async function confirmSale() {
  validateCredit()
  saleError.value = ''

  if (!cart.items.length) {
    saleError.value = 'No hay productos en el carrito.'
    return
  }

  if (Number(creditToUse.value || 0) > 0) {
    if (!selectedCustomer.value) {
      saleError.value = 'Debes seleccionar un cliente para usar crédito.'
      return
    }

    if (Number(creditToUse.value || 0) > Number(selectedCustomer.value.store_credit || 0)) {
      saleError.value = 'El cliente no tiene suficiente crédito disponible.'
      return
    }

    if (Number(creditToUse.value || 0) > Number(cart.total || 0)) {
      saleError.value = 'No puedes usar más crédito que el total de la venta.'
      return
    }
  }

  if (
    paymentMethod.value === 'cash' &&
    Number(cashReceived.value || 0) < Number(remainingAfterCredit.value || 0)
  ) {
    saleError.value = 'El monto recibido es menor al total restante.'
    return
  }

  try {
    savingSale.value = true

    const payload = {
      items: cart.items.map(item => ({
        id: Number(item.id),
        sku: String(item.sku || ''),
        name: String(item.name || ''),
        price: Number(item.price || 0),
        qty: Number(item.qty || 0),
        lineTotal: Number(item.lineTotal || 0),
      })),
      subtotal: Number(cart.subtotal || 0),
      discount: 0,
      total: Number(remainingAfterCredit.value || 0),
      payment_method: paymentMethod.value,
      cash_received: paymentMethod.value === 'cash' ? Number(cashReceived.value || 0) : 0,
      change_given: paymentMethod.value === 'cash' ? Number(changeGiven.value || 0) : 0,
      customerId: selectedCustomer.value?.id || null,
      credit_used: Number(creditToUse.value || 0),
    }

    const result = await window.posAPI.createSale(payload)

    if (!result?.success) {
      throw new Error('No se pudo guardar la venta.')
    }

    saleSuccess.value = result.folio || 'Venta guardada'
    cart.clearCart()
    clearCustomer()
    search.value = ''
    creditToUse.value = 0
    cashReceived.value = 0

    closePaymentModal()
    await loadProducts()
    await checkCashStatus()

    await nextTick()
    searchInputRef.value?.focus()

    if (
      printTicketsEnabled.value &&
      result.sale &&
      result.items?.length &&
      window.posAPI?.printTicket
    ) {
      setTimeout(async () => {
        try {
          await window.posAPI.printTicket({
            storeName: 'Card Bastion',
            sale: result.sale,
            items: result.items,
          })
        } catch (printError) {
          console.error('Error imprimiendo ticket:', printError)
        }
      }, 200)
    }

    setTimeout(() => {
      saleSuccess.value = ''
    }, 3000)
  } catch (error) {
    console.error('Error guardando venta:', error)
    saleError.value = error?.message || 'No se pudo guardar la venta.'
  } finally {
    savingSale.value = false
  }
}

onMounted(async () => {
  await loadProducts()
  await checkCashStatus()
  await loadPrintSettings()

  await nextTick()
  searchInputRef.value?.focus()
})
</script>

<style scoped>
.pos-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
}

.sidebar {
  background: #151515;
  border-right: 1px solid #2f2f2f;
  padding: 24px 18px;
}

.brand h1 {
  margin: 0;
  font-size: 28px;
  color: #f2b138;
}

.brand p {
  margin-top: 6px;
  color: #bdbdbd;
}

.menu-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 32px;
}

.menu-btn {
  border: none;
  border-radius: 12px;
  padding: 14px;
  text-align: left;
  background: #262626;
  color: #f5f5f5;
  cursor: pointer;
  font-size: 15px;
}

.menu-btn.active,
.menu-btn:hover {
  background: #f29a2e;
  color: #111;
  font-weight: 700;
}

.main-content {
  padding: 20px;
}

.topbar {
  margin-bottom: 18px;
  display: flex;
  gap: 12px;
}

.search-input,
.input {
  flex: 1;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid #3a3a3a;
  background: #262626;
  color: #fff;
  font-size: 16px;
}

.print-toggle-btn {
  border: none;
  border-radius: 14px;
  padding: 0 18px;
  background: #2563eb;
  color: white;
  font-weight: 700;
  cursor: pointer;
  min-width: 140px;
}

.print-toggle-btn.disabled {
  background: #525252;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
}

.products-panel,
.cart-panel {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 18px;
}

.panel-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  margin: 0;
  color: #f2b138;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding-right: 6px;
}

.product-card {
  background: #2c2c2c;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #383838;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.product-card:hover {
  transform: translateY(-2px);
  border-color: #f2b138;
}

.product-image {
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3a3a3a;
  color: #d6d6d6;
  font-weight: bold;
  overflow: hidden;
  border-bottom: 1px solid #383838;
}

.product-card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.product-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #d6d6d6;
  font-size: 13px;
  font-weight: 700;
}

.product-info {
  padding: 12px;
}

.product-info h3 {
  margin: 0 0 6px 0;
  font-size: 15px;
}

.product-info p,
.product-info small {
  display: block;
  margin: 0 0 8px 0;
  color: #b0b0b0;
  font-size: 13px;
}

.product-info strong {
  color: #f2b138;
}

.cart-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.cart-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  max-height: calc(100vh - 320px);
  overflow-y: auto;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2d2d2d;
  border-radius: 12px;
  padding: 12px;
}

.cart-item-info p {
  margin: 4px 0 8px 0;
  color: #b5b5b5;
  font-size: 13px;
}

.cart-item-right {
  text-align: right;
}

.qty-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty-controls button,
.remove-btn,
.close-btn,
.payment-method-btn {
  border: none;
  border-radius: 8px;
  background: #444;
  color: white;
  cursor: pointer;
  padding: 6px 10px;
}

.remove-btn {
  margin-top: 8px;
  background: #7f1d1d;
}

.empty-cart {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #b5b5b5;
  min-height: 300px;
}

.cart-summary {
  border-top: 1px solid #3a3a3a;
  padding-top: 16px;
  margin-top: 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 12px;
}

.summary-row.total {
  font-size: 20px;
  margin-top: 10px;
  color: #f2b138;
}

.pay-btn,
.confirm-btn {
  width: 100%;
  margin-top: 16px;
  padding: 16px;
  border: none;
  border-radius: 14px;
  background: #22c55e;
  color: white;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.pay-btn:disabled,
.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  width: 100%;
  max-width: 460px;
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 20px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.modal-header h2 {
  margin: 0;
  color: #f2b138;
}

.payment-methods {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.payment-method-btn {
  flex: 1;
  padding: 12px;
}

.payment-method-btn.active {
  background: #f29a2e;
  color: #111;
  font-weight: 700;
}

.payment-input {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
  font-size: 16px;
  margin-top: 8px;
}

.quick-cash-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 12px;
}

.quick-cash-btn {
  border: none;
  border-radius: 10px;
  background: #3a3a3a;
  color: white;
  padding: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.15s ease;
}

.quick-cash-btn:hover {
  background: #f29a2e;
  color: #111;
}

.cash-warning {
  background: #7f1d1d;
  color: white;
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 12px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.open-cash-btn {
  background: #f2b138;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-weight: bold;
  cursor: pointer;
}

.cash-section,
.card-section {
  margin-top: 16px;
}

.total-change {
  margin-top: 16px;
  font-size: 18px;
  color: #22c55e;
}

.sale-error {
  margin-top: 16px;
  padding: 12px;
  border-radius: 10px;
  background: #7f1d1d;
  color: #fff;
}

.success-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  background: #166534;
  color: white;
  padding: 14px 18px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.cart-warning {
  background: #92400e;
  color: white;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
  font-weight: 600;
}

.stock-alert-box {
  margin-bottom: 12px;
  background: #92400e;
  color: white;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
}

.low-stock-badge {
  display: inline-block;
  margin-left: 8px;
  background: #b45309;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 999px;
  vertical-align: middle;
}

.low-stock-text {
  color: #f59e0b !important;
  font-weight: 700;
}

.customer-box {
  margin-bottom: 12px;
  position: relative;
}

.customer-dropdown {
  position: absolute;
  width: 100%;
  background: #2c2c2c;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
}

.customer-item {
  padding: 10px;
  cursor: pointer;
}

.customer-item:hover {
  background: #3a3a3a;
}

.selected-customer {
  margin-top: 8px;
  background: #1f2937;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.clear-btn {
  background: #b91c1c;
  border: none;
  padding: 4px 8px;
  border-radius: 6px;
  color: white;
  cursor: pointer;
}

.credit-box {
  margin-top: 14px;
  padding: 12px;
  background: #2c2c2c;
  border-radius: 12px;
}
</style>

