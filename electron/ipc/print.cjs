const { ipcMain, BrowserWindow } = require('electron')

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function buildTicketHtml(payload) {
  const {
    storeName = 'Card Bastion',
    sale = {},
    items = [],
  } = payload || {}

  const itemsHtml = items.map(item => `
    <div class="item">
      <div class="item-name">${escapeHtml(item.product_name || item.name || '')}</div>
      <div class="item-meta">
        <span>${escapeHtml(item.qty)} x $${formatMoney(item.unit_price || item.price)}</span>
        <strong>$${formatMoney(item.line_total || item.lineTotal)}</strong>
      </div>
    </div>
  `).join('')

  const paymentLabel =
    sale.payment_method === 'cash'
      ? 'Efectivo'
      : sale.payment_method === 'card'
        ? 'Tarjeta'
        : escapeHtml(sale.payment_method || 'N/D')

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Ticket</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        width: 280px;
        margin: 0 auto;
        padding: 12px;
        color: #000;
        background: #fff;
        font-size: 12px;
      }

      .center {
        text-align: center;
      }

      .store-name {
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 4px;
      }

      .divider {
        border-top: 1px dashed #000;
        margin: 10px 0;
      }

      .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin: 4px 0;
      }

      .item {
        margin-bottom: 8px;
      }

      .item-name {
        font-weight: bold;
      }

      .item-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .total {
        font-size: 16px;
        font-weight: bold;
      }

      .footer {
        margin-top: 12px;
        text-align: center;
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <div class="center">
      <div class="store-name">${escapeHtml(storeName)}</div>
      <div>Ticket de venta</div>
    </div>

    <div class="divider"></div>

    <div class="row"><span>Folio:</span><strong>${escapeHtml(sale.folio || '')}</strong></div>
    <div class="row"><span>Fecha:</span><strong>${escapeHtml(sale.created_at || '')}</strong></div>
    <div class="row"><span>Método:</span><strong>${paymentLabel}</strong></div>

    <div class="divider"></div>

    ${itemsHtml}

    <div class="divider"></div>

    <div class="row"><span>Subtotal</span><strong>$${formatMoney(sale.subtotal)}</strong></div>
    <div class="row"><span>Descuento</span><strong>$${formatMoney(sale.discount)}</strong></div>
    <div class="row total"><span>Total</span><strong>$${formatMoney(sale.total)}</strong></div>

    ${sale.payment_method === 'cash' ? `
      <div class="row"><span>Recibido</span><strong>$${formatMoney(sale.cash_received)}</strong></div>
      <div class="row"><span>Cambio</span><strong>$${formatMoney(sale.change_given)}</strong></div>
    ` : ''}

    <div class="divider"></div>

    <div class="footer">
      Gracias por tu compra<br />
      Card Bastion
    </div>
  </body>
  </html>
  `
}

function registerPrintHandlers() {
  ipcMain.handle('print:ticket', async (event, payload) => {
    const printWindow = new BrowserWindow({
      width: 320,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: false,
      },
    })

    const html = buildTicketHtml(payload)
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    return new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: {
            marginType: 'none',
          },
        },
        (success, failureReason) => {
          printWindow.close()

          if (!success) {
            reject(new Error(failureReason || 'No se pudo imprimir el ticket.'))
            return
          }

          resolve({ success: true })
        }
      )
    })
  })
}

module.exports = { registerPrintHandlers }