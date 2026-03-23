<template>
  <div class="customers-layout">
    <header class="customers-header">
      <div>
        <h1>Clientes</h1>
        <p>Registro y edicion de clientes</p>
      </div>
    </header>

    <section class="customers-grid">
      <div class="card">
        <div class="form-title-row">
          <h2>{{ editingId ? 'Editar cliente' : 'Nuevo cliente' }}</h2>
          <button v-if="editingId" class="cancel-btn" @click="resetForm">
            Cancelar
          </button>
        </div>

        <div class="form-grid">
          <div class="full">
            <label>Nombre</label>
            <input v-model="form.name" class="input" />
          </div>

          <div>
            <label>Telefono</label>
            <input v-model="form.phone" class="input" />
          </div>

          <div>
            <label>Email</label>
            <input v-model="form.email" class="input" />
          </div>

          <div class="full">
            <label>Notas</label>
            <textarea v-model="form.notes" class="textarea"></textarea>
          </div>
        </div>

        <div v-if="message" class="message success">
          {{ message }}
        </div>

        <div v-if="errorMessage" class="message error">
          {{ errorMessage }}
        </div>

        <button class="primary-btn" @click="handleSaveCustomer">
          {{ editingId ? 'Guardar cambios' : 'Guardar cliente' }}
        </button>

        <button
          class="secondary-credit-btn"
          :disabled="!editingId"
          @click="toggleCreditForm"
        >
          {{ showCreditForm ? 'Cancelar abono' : 'Abonar credito' }}
        </button>

        <div v-if="showCreditForm" class="credit-form">
          <div>
            <label>Monto a abonar</label>
            <input
              v-model.number="creditForm.amount"
              class="input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <div>
            <label>Motivo</label>
            <input
              v-model="creditForm.reason"
              class="input"
              placeholder="Abono manual"
            />
          </div>

          <button class="primary-btn credit-save-btn" @click="handleAddCredit">
            Guardar abono
          </button>
        </div>
      </div>

      <div class="card">
        <div class="list-header">
          <h2>Clientes</h2>
          <span>{{ customers.length }} registros</span>
        </div>

        <input
          v-model="search"
          class="input"
          placeholder="Buscar por nombre, telefono o email"
          @input="handleSearch"
        />

        <div v-if="customers.length" class="customer-list">
          <div
            v-for="customer in customers"
            :key="customer.id"
            class="customer-row"
          >
            <div class="customer-main" @click="selectCustomer(customer)">
              <strong>{{ customer.name }}</strong>
              <p>{{ customer.phone || 'Sin telefono' }}</p>
              <small>{{ customer.email || 'Sin email' }}</small>
            </div>

            <div class="customer-meta">
              <span>{{ customer.points || 0 }} pts</span>
              <small class="credit-balance">Credito: ${{ formatPrice(customer.store_credit) }}</small>
              <button class="delete-btn" @click.stop="handleDeleteCustomer(customer)">
                Eliminar
              </button>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          No hay clientes registrados.
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

const customers = ref([])
const editingId = ref(null)
const search = ref('')
const message = ref('')
const errorMessage = ref('')
const showCreditForm = ref(false)

const form = reactive({
  name: '',
  phone: '',
  email: '',
  notes: '',
})

const creditForm = reactive({
  amount: null,
  reason: 'Abono manual',
})

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function updateCustomerCreditLocally(customerId, newBalance) {
  customers.value = customers.value.map((customer) => {
    if (Number(customer.id) !== Number(customerId)) return customer
    return {
      ...customer,
      store_credit: Number(newBalance || 0),
    }
  })
}

function resetCreditForm() {
  creditForm.amount = null
  creditForm.reason = 'Abono manual'
}

function toggleCreditForm() {
  if (!editingId.value) {
    errorMessage.value = 'Primero selecciona o guarda un cliente.'
    return
  }

  clearMessages()
  showCreditForm.value = !showCreditForm.value

  if (!showCreditForm.value) {
    resetCreditForm()
  }
}

async function handleAddCredit() {
  if (!editingId.value) {
    errorMessage.value = 'Primero selecciona o guarda un cliente.'
    return
  }

  const amount = Number(creditForm.amount || 0)
  if (amount <= 0) {
    errorMessage.value = 'El monto debe ser mayor a 0.'
    return
  }

  const reason = String(creditForm.reason || '').trim() || 'Abono manual'

  try {
    clearMessages()

    const result = await window.posAPI.addCustomerCredit({
      customerId: editingId.value,
      amount,
      reason,
    })

    updateCustomerCreditLocally(editingId.value, result?.newBalance)
    message.value = 'Credito abonado correctamente.'
    showCreditForm.value = false
    resetCreditForm()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo abonar credito.'
  }
}

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

function resetForm() {
  editingId.value = null
  showCreditForm.value = false
  form.name = ''
  form.phone = ''
  form.email = ''
  form.notes = ''
  resetCreditForm()
  clearMessages()
}

async function loadCustomers() {
  customers.value = await window.posAPI.getCustomers()
}

function selectCustomer(customer) {
  clearMessages()
  editingId.value = customer.id
  showCreditForm.value = false
  form.name = customer.name || ''
  form.phone = customer.phone || ''
  form.email = customer.email || ''
  form.notes = customer.notes || ''
  resetCreditForm()
}

async function handleSaveCustomer() {
  try {
    clearMessages()

    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
    }

    if (editingId.value) {
      await window.posAPI.updateCustomer({
        id: editingId.value,
        ...payload,
      })
      message.value = 'Cliente actualizado correctamente.'
    } else {
      await window.posAPI.createCustomer(payload)
      message.value = 'Cliente creado correctamente.'
    }

    resetForm()
    await loadCustomers()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo guardar el cliente.'
  }
}

async function handleSearch() {
  try {
    if (!search.value.trim()) {
      await loadCustomers()
      return
    }

    customers.value = await window.posAPI.searchCustomers(search.value)
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo buscar el cliente.'
  }
}

async function handleDeleteCustomer(customer) {
  const confirmed = window.confirm(`Eliminar al cliente "${customer.name}"?`)
  if (!confirmed) return

  try {
    clearMessages()
    await window.posAPI.deleteCustomer(customer.id)

    if (editingId.value === customer.id) {
      resetForm()
    }

    message.value = 'Cliente eliminado correctamente.'
    await loadCustomers()
  } catch (error) {
    errorMessage.value = error?.message || 'No se pudo eliminar el cliente.'
  }
}

onMounted(async () => {
  await loadCustomers()
})
</script>

<style scoped>
.customers-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.customers-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.customers-header h1 {
  margin: 0;
  color: #f2b138;
}

.customers-header p {
  margin: 6px 0 0 0;
  color: #bcbcbc;
}

.back-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  background: #f29a2e;
  color: #111;
  font-weight: 700;
  cursor: pointer;
}

.customers-grid {
  display: grid;
  grid-template-columns: 420px 1fr;
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
}

.input,
.textarea {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
}

.textarea {
  min-height: 100px;
  resize: vertical;
}

.primary-btn,
.cancel-btn,
.delete-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  width: 100%;
  margin-top: 18px;
  background: #22c55e;
  color: white;
}

.cancel-btn {
  background: #525252;
  color: white;
}

.delete-btn {
  background: #b91c1c;
  color: white;
  padding: 8px 10px;
  margin-top: 8px;
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

.customer-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.customer-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #2c2c2c;
  border-radius: 12px;
  padding: 12px;
}

.customer-main {
  flex: 1;
  cursor: pointer;
}

.customer-row p,
.customer-row small {
  display: block;
  margin: 4px 0 0 0;
  color: #bcbcbc;
}

.customer-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  text-align: right;
}

.credit-balance {
  color: #93c5fd;
  font-weight: 700;
}

.empty-state {
  margin-top: 16px;
  color: #bcbcbc;
  text-align: center;
  padding: 20px;
}

.secondary-credit-btn {
  width: 100%;
  margin-top: 12px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  font-weight: 700;
  cursor: pointer;
}

.secondary-credit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.credit-form {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.credit-save-btn {
  margin-top: 4px;
}
</style>
