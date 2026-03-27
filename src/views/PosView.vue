<template>
  <div class="pos-page" :class="{ compact: posCustomization.compactMode }">
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

      <section v-if="posCustomization.showHeroBanner" class="hero-banner">
        <div>
          <p class="eyebrow">{{ posCustomization.heroCaption }}</p>
          <h2>{{ posCustomization.heroTitle }}</h2>
          <span>{{ products.length }} productos disponibles</span>
        </div>

        <div class="hero-stats">
          <div class="hero-stat">
            <strong>{{ filteredProducts.length }}</strong>
            <small>Resultados</small>
          </div>

          <div class="hero-stat">
            <strong>{{ cart.totalItems }}</strong>
            <small>Items en carrito</small>
          </div>

          <div class="hero-stat warning">
            <strong>{{ lowStockCount }}</strong>
            <small>Stock bajo</small>
          </div>
        </div>
      </section>

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

                <strong>$ {{ formatPrice(getProductSalePrice(product)) }}</strong>
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

          <transition-group v-if="cart.items.length" name="cart-list" tag="div" class="cart-items">
            <div class="cart-item" v-for="item in cart.items" :key="item.id">
              <div class="cart-item-info">
                <strong>{{ item.name }}</strong>
                <p>{{ item.sku }}</p>

                <div class="item-price-row">
                  <span>
                    Precio unitario:
                    <strong>$ {{ formatPrice(item.price) }}</strong>
                  </span>

                  <button class="price-edit-btn" @click.stop="openPriceEditor(item)">
                    {{ editingPriceId === item.id ? 'Cerrar' : 'Editar precio' }}
                  </button>
                </div>

                <div v-if="editingPriceId === item.id" class="price-editor" @click.stop>
                  <input
                    v-model="editingPriceValue"
                    type="number"
                    min="0"
                    step="0.01"
                    class="price-editor-input"
                    placeholder="0.00"
                    @keydown.enter.prevent="applyItemPrice(item.id)"
                  />

                  <div class="price-editor-actions">
                    <button class="price-save-btn" @click.stop="applyItemPrice(item.id)">
                      Aplicar
                    </button>
                    <button
                      v-if="item.customPrice"
                      class="price-reset-btn"
                      @click.stop="resetItemPrice(item.id)"
                    >
                      Restablecer
                    </button>
                  </div>

                  <small class="price-editor-hint">
                    Solo cambia el precio de este cobro. El producto registrado no se modifica.
                  </small>
                </div>

                <div class="qty-controls">
                  <button @click="cart.decreaseQty(item.id)">−</button>
                  <span>{{ item.qty }}</span>
                  <button @click="increaseCartItem(item.id)">+</button>
                </div>
              </div>

              <div class="cart-item-right">
                <strong>$ {{ formatPrice(item.lineTotal) }}</strong>
                <small v-if="item.customPrice" class="custom-price-badge">
                  Precio temporal
                </small>
                <button class="remove-btn" @click="cart.removeItem(item.id)">
                  Quitar
                </button>
              </div>
            </div>
          </transition-group>

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

          <button
            class="payment-method-btn"
            :class="{ active: paymentMethod === 'transfer' }"
            @click="paymentMethod = 'transfer'"
          >
            Transferencia
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
              v-model="creditToUse"
              type="number"
              min="0"
              step="0.01"
              class="payment-input"
              placeholder="0.00"
              @blur="validateCredit"
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

          <div class="credit-box">
            <label>{{ paymentMethod === 'cash' ? 'Efectivo recibido' : 'Monto pagado' }}</label>
            <input
              v-model="paymentAmount"
              type="number"
              min="0"
              step="0.01"
              class="payment-input"
              placeholder="0.00"
              @blur="validatePaymentAmount"
            />

            <div class="summary-row" style="margin-top: 12px;">
              <span>Estado de pago</span>
              <strong>{{ paymentStatusLabel }}</strong>
            </div>

            <div class="summary-row" style="margin-top: 6px;">
              <span>Saldo pendiente</span>
              <strong>$ {{ formatPrice(pendingAmount) }}</strong>
            </div>

            <div v-if="paymentMethod === 'cash'" class="summary-row total-change" style="margin-top: 6px;">
              <span>Cambio</span>
              <strong>$ {{ formatPrice(changeAmount) }}</strong>
            </div>

            <div v-if="pendingAmount > 0" style="margin-top: 12px;">
              <label>Fecha límite (opcional)</label>
              <input
                v-model="dueDate"
                type="date"
                class="payment-input"
              />
            </div>

            <div style="margin-top: 12px;">
              <label>Notas de cobro (opcional)</label>
              <textarea
                v-model="paymentNotes"
                class="payment-input"
                rows="2"
                placeholder="Ej. paga el viernes"
              ></textarea>
            </div>
          </div>

          <div class="card-section">
            <p v-if="paymentMethod === 'cash'">Pago en efectivo seleccionado.</p>
            <p v-else-if="paymentMethod === 'card'">Pago con tarjeta seleccionado.</p>
            <p v-else>Pago por transferencia seleccionado.</p>
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
import { computed, nextTick, onMounted, ref } from 'vue'
import { useCartStore } from '../stores/cartStore'

const products = ref([])
const search = ref('')
const searchInputRef = ref(null)
const cart = useCartStore()

const hasOpenCash = ref(false)
const showPaymentModal = ref(false)
const paymentMethod = ref('cash')
const savingSale = ref(false)
const saleError = ref('')
const saleSuccess = ref('')
const printTicketsEnabled = ref(true)
const cartMessage = ref('')

const productImageMap = ref({})

const selectedCustomer = ref(null)
const customerSearch = ref('')
const customerResults = ref([])

const creditToUse = ref('0')
const paymentAmount = ref('0')
const dueDate = ref('')
const paymentNotes = ref('')
const editingPriceId = ref(null)
const editingPriceValue = ref('')
const posCustomization = ref({
  storeName: 'Card Bastion',
  posSubtitle: 'Point of Sale',
  heroTitle: 'Ventas agiles con control visual y cobro flexible',
  heroCaption: 'Panel de cobro',
  accentColor: '#f2b138',
  showHeroBanner: true,
  compactMode: false,
})

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
  creditToUse.value = '0'
}

function clearCustomer() {
  selectedCustomer.value = null
  customerSearch.value = ''
  customerResults.value = []
  creditToUse.value = '0'
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

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function parseMoneyInput(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!normalized) return 0

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function getProductSalePrice(product) {
  const productType = String(product?.product_type || 'normal').toLowerCase()
  const game = String(product?.game || '').trim().toLowerCase()
  const usd = Number(product?.starcity_price_usd || 0)

  if (productType === 'single' && game === 'magic: the gathering' && usd > 0) {
    return Number((usd * 18).toFixed(2))
  }

  return Number(product?.price || 0)
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
  creditToUse.value = '0'
  await checkCashStatus()

  if (!hasOpenCash.value) {
    saleError.value = 'Debes abrir caja antes de realizar una venta.'
    return
  }

  paymentMethod.value = 'cash'
  paymentAmount.value = String(Number(cart.total || 0).toFixed(2))
  dueDate.value = ''
  paymentNotes.value = ''
  saleError.value = ''
  showPaymentModal.value = true
}

async function loadPosCustomization() {
  try {
    const settings = await window.posAPI.getPosCustomization()
    posCustomization.value = {
      ...posCustomization.value,
      ...(settings || {}),
    }
  } catch (error) {
    console.error('Error cargando personalizacion del POS:', error)
  }
}

function closePaymentModal() {
  showPaymentModal.value = false
  saleError.value = ''
  paymentAmount.value = '0'
  dueDate.value = ''
  paymentNotes.value = ''

  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function validateCredit() {
  if (!selectedCustomer.value) {
    creditToUse.value = '0'
    return
  }

  let nextValue = parseMoneyInput(creditToUse.value)

  if (nextValue < 0) {
    nextValue = 0
  }

  const available = Number(selectedCustomer.value.store_credit || 0)
  const total = Number(cart.total || 0)

  if (nextValue > available) {
    nextValue = available
  }

  if (nextValue > total) {
    nextValue = total
  }

  creditToUse.value = String(Number(nextValue).toFixed(2))

  validatePaymentAmount()
}

function applyMaxCredit() {
  if (!selectedCustomer.value) {
    creditToUse.value = '0'
    return
  }

  const available = Number(selectedCustomer.value.store_credit || 0)
  const total = Number(cart.total || 0)
  creditToUse.value = String(Math.min(available, total).toFixed(2))

  validatePaymentAmount()
}

function validatePaymentAmount() {
  const remaining = Number(remainingAfterCredit.value || 0)
  let nextValue = parseMoneyInput(paymentAmount.value)

  if (nextValue < 0) {
    nextValue = 0
  }

  if (paymentMethod.value !== 'cash' && nextValue > remaining) {
    nextValue = remaining
  }

  paymentAmount.value = String(Number(nextValue).toFixed(2))
}

function openPriceEditor(item) {
  if (editingPriceId.value === item.id) {
    editingPriceId.value = null
    editingPriceValue.value = ''
    return
  }

  editingPriceId.value = item.id
  editingPriceValue.value = String(Number(item.price || 0).toFixed(2))
}

function applyItemPrice(productId) {
  const result = cart.setItemPrice(productId, editingPriceValue.value)

  if (!result?.success) {
    cartMessage.value = result?.message || 'No se pudo actualizar el precio.'
    setTimeout(() => {
      cartMessage.value = ''
    }, 2500)
    return
  }

  editingPriceId.value = null
  editingPriceValue.value = ''
}

function resetItemPrice(productId) {
  const result = cart.resetItemPrice(productId)

  if (!result?.success) {
    cartMessage.value = result?.message || 'No se pudo restablecer el precio.'
    setTimeout(() => {
      cartMessage.value = ''
    }, 2500)
    return
  }

  const item = cart.items.find((entry) => entry.id === productId)
  editingPriceValue.value = String(Number(item?.price || 0).toFixed(2))
}

const remainingAfterCredit = computed(() => {
  const total = Number(cart.total || 0)
  const credit = parseMoneyInput(creditToUse.value)
  return Math.max(total - credit, 0)
})

const effectiveAmountPaid = computed(() => {
  const received = parseMoneyInput(paymentAmount.value)
  const remaining = Number(remainingAfterCredit.value || 0)
  return Math.min(received, remaining)
})

const pendingAmount = computed(() => {
  return Math.max(Number(remainingAfterCredit.value || 0) - Number(effectiveAmountPaid.value || 0), 0)
})

const changeAmount = computed(() => {
  if (paymentMethod.value !== 'cash') return 0
  return Math.max(parseMoneyInput(paymentAmount.value) - Number(effectiveAmountPaid.value || 0), 0)
})

const paymentStatusPreview = computed(() => {
  if (Number(pendingAmount.value || 0) <= 0) return 'paid'
  if (Number(effectiveAmountPaid.value || 0) <= 0) return 'pending'
  return 'partial'
})

const paymentStatusLabel = computed(() => {
  if (paymentStatusPreview.value === 'paid') return 'Pagado'
  if (paymentStatusPreview.value === 'partial') return 'Parcial'
  return 'Pendiente'
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
  validatePaymentAmount()
  saleError.value = ''

  if (!cart.items.length) {
    saleError.value = 'No hay productos en el carrito.'
    return
  }

  if (parseMoneyInput(creditToUse.value) > 0) {
    if (!selectedCustomer.value) {
      saleError.value = 'Debes seleccionar un cliente para usar crédito.'
      return
    }

    if (parseMoneyInput(creditToUse.value) > Number(selectedCustomer.value.store_credit || 0)) {
      saleError.value = 'El cliente no tiene suficiente crédito disponible.'
      return
    }

    if (parseMoneyInput(creditToUse.value) > Number(cart.total || 0)) {
      saleError.value = 'No puedes usar más crédito que el total de la venta.'
      return
    }
  }

  if (paymentMethod.value !== 'cash' && parseMoneyInput(paymentAmount.value) > Number(remainingAfterCredit.value || 0)) {
    saleError.value = 'El monto pagado no puede exceder el total neto.'
    return
  }

  if (Number(pendingAmount.value || 0) > 0 && !selectedCustomer.value) {
    saleError.value = 'Si el pago es menor al total, debes seleccionar cliente para enviarlo a cuenta por cobrar.'
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
      cash_received: paymentMethod.value === 'cash' ? parseMoneyInput(paymentAmount.value) : 0,
      change_given: paymentMethod.value === 'cash' ? Number(changeAmount.value || 0) : 0,
      customerId: selectedCustomer.value?.id || null,
      credit_used: parseMoneyInput(creditToUse.value),
      amount_paid: Number(effectiveAmountPaid.value || 0),
      due_date: dueDate.value || null,
      payment_notes: String(paymentNotes.value || ''),
    }

    const result = await window.posAPI.createSale(payload)

    if (!result?.success) {
      throw new Error('No se pudo guardar la venta.')
    }

    saleSuccess.value = result.folio || 'Venta guardada'
    cart.clearCart()
    clearCustomer()
    search.value = ''
    creditToUse.value = '0'
    paymentAmount.value = '0'
    dueDate.value = ''
    paymentNotes.value = ''
    editingPriceId.value = null
    editingPriceValue.value = ''

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
            storeName: posCustomization.value.storeName || 'Card Bastion',
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
  await loadPosCustomization()

  await nextTick()
  searchInputRef.value?.focus()
})
</script>

<style scoped>
.pos-page {
  padding: 20px;
  min-height: 100vh;
  color: #f5f5f5;
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
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.search-input:focus,
.input:focus,
.payment-input:focus,
.price-editor-input:focus {
  outline: none;
  border-color: rgba(242, 177, 56, 0.8);
  box-shadow: 0 0 0 4px rgba(242, 177, 56, 0.12);
  transform: translateY(-1px);
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

.hero-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 18px;
  padding: 20px 22px;
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(242, 177, 56, 0.22), transparent 22%),
    linear-gradient(135deg, rgba(24, 24, 27, 0.96), rgba(15, 23, 42, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.16);
  animation: surfaceEnter 0.5s ease both;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--accent-color, #f2b138);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.16em;
}

.hero-banner h2 {
  margin: 0;
  max-width: 620px;
  font-size: 30px;
  line-height: 1.1;
}

.hero-banner span {
  display: block;
  margin-top: 8px;
  color: #cbd5e1;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(90px, 1fr));
  gap: 12px;
}

.hero-stat {
  min-width: 96px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  text-align: center;
}

.hero-stat strong {
  display: block;
  font-size: 28px;
  color: #fff;
}

.hero-stat small {
  color: #cbd5e1;
}

.hero-stat.warning strong {
  color: #fbbf24;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;
}

.products-panel,
.cart-panel {
  background: linear-gradient(180deg, rgba(35, 35, 35, 0.96), rgba(27, 27, 27, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 18px;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.16);
  animation: surfaceEnter 0.5s ease both;
}

.panel-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  margin: 0;
  color: var(--accent-color, #f2b138);
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  max-height: calc(100vh - 240px);
  overflow-y: auto;
  padding-right: 6px;
}

.product-card {
  background: linear-gradient(180deg, #2c2c2c 0%, #252525 100%);
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.product-card:hover {
  transform: translateY(-4px) scale(1.01);
  border-color: var(--accent-color, #f2b138);
  box-shadow: 0 18px 28px rgba(0, 0, 0, 0.24);
}

.product-image {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3a3a3a;
  color: #d6d6d6;
  font-weight: bold;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  color: var(--accent-color, #f2b138);
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
  max-height: calc(100vh - 360px);
  overflow-y: auto;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: linear-gradient(180deg, rgba(45, 45, 45, 0.96), rgba(36, 36, 36, 0.96));
  border-radius: 16px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.cart-item-info p {
  margin: 4px 0 8px 0;
  color: #b5b5b5;
  font-size: 13px;
}

.cart-item-right {
  text-align: right;
}

.item-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #d6d6d6;
}

.price-edit-btn,
.price-save-btn,
.price-reset-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  font-weight: 700;
}

.price-edit-btn {
  background: rgba(37, 99, 235, 0.18);
  color: #bfdbfe;
}

.price-editor {
  margin: 10px 0 12px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.18);
  animation: panelDrop 0.2s ease;
}

.price-editor-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #3a3a3a;
  background: #20242c;
  color: white;
}

.price-editor-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.price-save-btn {
  background: #22c55e;
  color: white;
}

.price-reset-btn {
  background: #f59e0b;
  color: #111827;
}

.price-editor-hint {
  display: block;
  margin-top: 8px;
  color: #cbd5e1;
  line-height: 1.4;
}

.custom-price-badge {
  display: block;
  margin-top: 6px;
  color: #fbbf24;
  font-weight: 700;
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
  color: var(--accent-color, #f2b138);
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
  backdrop-filter: blur(6px);
  z-index: 2000;
}

.modal {
  width: 100%;
  max-width: 980px;
  background: linear-gradient(180deg, #232323, #1d1d1d);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.38);
  animation: modalEnter 0.24s ease;
  position: relative;
  z-index: 2001;
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
  background: var(--accent-color, #f29a2e);
  color: #111;
  font-weight: 700;
}

.pos-page.compact .products-grid {
  gap: 10px;
}

.pos-page.compact .product-image {
  height: 92px;
}

.pos-page.compact .product-info {
  padding: 10px;
}

.pos-page.compact .product-info h3 {
  font-size: 13px;
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

.payment-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.payment-summary > .summary-row:first-child {
  grid-column: 1 / -1;
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
  animation: toastIn 0.3s ease;
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

.cart-list-enter-active,
.cart-list-leave-active {
  transition: all 0.22s ease;
}

.cart-list-enter-from,
.cart-list-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@keyframes surfaceEnter {
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes panelDrop {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .products-grid {
    grid-template-columns: repeat(3, 1fr);
    max-height: none;
  }

  .cart-items {
    max-height: none;
  }
}

@media (max-width: 900px) {
  .hero-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-stats {
    width: 100%;
    grid-template-columns: repeat(3, 1fr);
  }

  .modal {
    max-width: 460px;
  }

  .payment-summary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .topbar {
    flex-direction: column;
  }

  .products-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .cart-item {
    flex-direction: column;
  }

  .cart-item-right {
    text-align: left;
  }

  .hero-stats {
    grid-template-columns: 1fr;
  }
}
</style>

