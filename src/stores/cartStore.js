import { defineStore } from 'pinia'

function getSalePrice(product) {
  const productType = String(product?.product_type || 'normal').toLowerCase()
  const game = String(product?.game || '').trim().toLowerCase()
  const usd = Number(product?.starcity_price_usd || 0)

  if (productType === 'single' && game === 'magic: the gathering' && usd > 0) {
    return Number((usd * 18).toFixed(2))
  }

  return Number(product?.price || 0)
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: [],
  }),

  getters: {
    subtotal(state) {
      return state.items.reduce((sum, item) => sum + item.lineTotal, 0)
    },

    total(state) {
      return state.items.reduce((sum, item) => sum + item.lineTotal, 0)
    },

    totalItems(state) {
      return state.items.reduce((sum, item) => sum + item.qty, 0)
    },
  },

  actions: {
    addProduct(product) {
      const stock = Number(product.stock || 0)
      const existing = this.items.find((item) => item.id === product.id)

      if (stock <= 0) {
        return {
          success: false,
          message: 'Este producto no tiene stock disponible.',
        }
      }

      if (existing) {
        if (existing.qty >= stock) {
          return {
            success: false,
            message: `Solo hay ${stock} pieza(s) disponibles de ${product.name}.`,
          }
        }

        existing.qty += 1
        existing.lineTotal = existing.qty * existing.price

        return { success: true }
      }

      const salePrice = getSalePrice(product)

      this.items.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        originalPrice: salePrice,
        price: salePrice,
        stock: stock,
        qty: 1,
        customPrice: false,
        lineTotal: salePrice,
      })

      return { success: true }
    },

    increaseQty(productId) {
      const item = this.items.find((i) => i.id === productId)
      if (!item) {
        return { success: false, message: 'Producto no encontrado en carrito.' }
      }

      const stock = Number(item.stock || 0)

      if (item.qty >= stock) {
        return {
          success: false,
          message: `Solo hay ${stock} pieza(s) disponibles de ${item.name}.`,
        }
      }

      item.qty += 1
      item.lineTotal = item.qty * item.price

      return { success: true }
    },

    decreaseQty(productId) {
      const item = this.items.find((i) => i.id === productId)
      if (!item) return

      item.qty -= 1

      if (item.qty <= 0) {
        this.items = this.items.filter((i) => i.id !== productId)
      } else {
        item.lineTotal = item.qty * item.price
      }
    },

    removeItem(productId) {
      this.items = this.items.filter((i) => i.id !== productId)
    },

    setItemPrice(productId, nextPrice) {
      const item = this.items.find((i) => i.id === productId)
      if (!item) {
        return { success: false, message: 'Producto no encontrado en carrito.' }
      }

      const parsedPrice = Number(nextPrice)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return { success: false, message: 'Ingresa un precio valido.' }
      }

      item.price = Number(parsedPrice.toFixed(2))
      item.customPrice = Number(item.price) !== Number(item.originalPrice || 0)
      item.lineTotal = Number((item.qty * item.price).toFixed(2))

      return { success: true }
    },

    resetItemPrice(productId) {
      const item = this.items.find((i) => i.id === productId)
      if (!item) {
        return { success: false, message: 'Producto no encontrado en carrito.' }
      }

      item.price = Number(item.originalPrice || 0)
      item.customPrice = false
      item.lineTotal = Number((item.qty * item.price).toFixed(2))

      return { success: true }
    },

    clearCart() {
      this.items = []
    },
  },
})
