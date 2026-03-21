const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

function generateFolio() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return `CB-${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

function registerSalesHandlers() {
  ipcMain.handle('sales:create', (event, payload) => {
    const db = getDb()

    const openSession = db.prepare(`
      SELECT id
      FROM cash_sessions
      WHERE status = 'open'
      LIMIT 1
    `).get()

    if (!openSession) {
      throw new Error('No hay una caja abierta. Debes abrir caja antes de vender.')
    }

    const {
      items = [],
      subtotal = 0,
      discount = 0,
      total = 0,
      payment_method = 'cash',
      cash_received = 0,
      change_given = 0,
      customerId = null,
      credit_used = 0,
    } = payload || {}

    if (!items.length) {
      throw new Error('La venta no contiene productos.')
    }

    const subtotalValue = Number(subtotal || 0)
    const discountValue = Number(discount || 0)
    const totalValue = Number(total || 0)
    const creditToUse = Number(credit_used || 0)
    const baseTotal = Math.max(subtotalValue - discountValue, 0)
    const expectedTotal = Math.max(baseTotal - creditToUse, 0)

    if (creditToUse < 0) {
      throw new Error('El credito usado no puede ser menor a 0.')
    }

    if (Math.abs(totalValue - expectedTotal) > 0.01) {
      throw new Error('Total inconsistente con subtotal, descuento y credito aplicado.')
    }

    if (String(payment_method || 'cash') === 'cash' && Number(cash_received || 0) < totalValue) {
      throw new Error('El monto recibido en efectivo no puede ser menor al total.')
    }

    const folio = generateFolio()

    const insertSale = db.prepare(`
      INSERT INTO sales (
        folio,
        subtotal,
        discount,
        total,
        payment_method,
        cash_received,
        change_given,
        status,
        customer_id,
        credit_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertSaleItem = db.prepare(`
      INSERT INTO sale_items (
        sale_id, product_id, sku, product_name, qty, unit_price, unit_cost, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const updateStock = db.prepare(`
      UPDATE products
      SET stock = stock - ?
      WHERE id = ?
    `)

    const getCustomerCredit = db.prepare(`
      SELECT id, store_credit
      FROM customers
      WHERE id = ?
      LIMIT 1
    `)

    const updateCustomerCredit = db.prepare(`
      UPDATE customers
      SET
        store_credit = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    const insertCreditMovement = db.prepare(`
      INSERT INTO customer_credit_movements (
        customer_id,
        type,
        amount,
        balance_after,
        reason,
        reference_type,
        reference_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const transaction = db.transaction(() => {
      const saleResult = insertSale.run(
        folio,
        subtotalValue,
        discountValue,
        totalValue,
        String(payment_method || 'cash'),
        Number(cash_received || 0),
        Number(change_given || 0),
        'completed',
        customerId ? Number(customerId) : null,
        creditToUse
      )

      const saleId = Number(saleResult.lastInsertRowid)

      for (const item of items) {
        const productId = Number(item.id || 0)
        const qty = Number(item.qty || 0)

        const currentProduct = db.prepare(`
          SELECT id, name, stock, cost
          FROM products
          WHERE id = ?
          LIMIT 1
        `).get(productId)

        if (!currentProduct) {
          throw new Error(`El producto ${item.name || productId} ya no existe.`)
        }

        if (Number(currentProduct.stock || 0) < qty) {
          throw new Error(
            `Stock insuficiente para ${currentProduct.name}. Disponible: ${Number(currentProduct.stock || 0)}`
          )
        }

        insertSaleItem.run(
          saleId,
          productId,
          String(item.sku || ''),
          String(item.name || ''),
          qty,
          Number(item.price || 0),
          Number(currentProduct.cost || 0),
          Number(item.lineTotal || 0)
        )

        updateStock.run(qty, productId)
      }

      if (creditToUse > 0) {
        if (!customerId) {
          throw new Error('No puedes usar crédito sin seleccionar un cliente.')
        }

        const customer = getCustomerCredit.get(Number(customerId))

        if (!customer) {
          throw new Error('Cliente no encontrado para usar crédito.')
        }

        const maxCreditAllowed = Math.max(subtotalValue - discountValue, 0)

        if (creditToUse > maxCreditAllowed) {
          throw new Error('El crédito usado no puede ser mayor al total de la venta.')
        }

        if (creditToUse > Number(customer.store_credit || 0)) {
          throw new Error('El cliente no tiene suficiente crédito disponible.')
        }

        const newBalance = Number(customer.store_credit || 0) - creditToUse

        updateCustomerCredit.run(newBalance, Number(customerId))

        insertCreditMovement.run(
          Number(customerId),
          'use',
          creditToUse,
          newBalance,
          `Uso de crédito en venta ${folio}`,
          'sale',
          saleId
        )
      }

      return { saleId, folio }
    })

    const result = transaction()

    const savedSale = db.prepare(`
      SELECT
        id,
        folio,
        subtotal,
        discount,
        total,
        payment_method,
        cash_received,
        change_given,
        customer_id,
        created_at,
        credit_used
      FROM sales
      WHERE id = ?
    `).get(Number(result.saleId))

    const savedItems = db.prepare(`
      SELECT
        id,
        sale_id,
        product_id,
        sku,
        product_name,
        qty,
        unit_price,
        line_total
      FROM sale_items
      WHERE sale_id = ?
      ORDER BY id ASC
    `).all(Number(result.saleId))

    return {
      success: true,
      saleId: Number(result.saleId),
      folio: String(result.folio),
      sale: savedSale
        ? {
            id: Number(savedSale.id),
            folio: String(savedSale.folio || ''),
            subtotal: Number(savedSale.subtotal || 0),
            discount: Number(savedSale.discount || 0),
            total: Number(savedSale.total || 0),
            total_before_credit: Number(savedSale.total || 0) + Number(savedSale.credit_used || 0),
            payment_method: String(savedSale.payment_method || ''),
            cash_received: Number(savedSale.cash_received || 0),
            change_given: Number(savedSale.change_given || 0),
            customer_id: savedSale.customer_id ? Number(savedSale.customer_id) : null,
            credit_used: Number(savedSale.credit_used || 0),
            created_at: String(savedSale.created_at || ''),
          }
        : null,
      items: (savedItems || []).map(item => ({
        id: Number(item.id),
        sale_id: Number(item.sale_id),
        product_id: Number(item.product_id || 0),
        sku: String(item.sku || ''),
        product_name: String(item.product_name || ''),
        qty: Number(item.qty || 0),
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.line_total || 0),
      })),
    }
  })
}

module.exports = { registerSalesHandlers }
