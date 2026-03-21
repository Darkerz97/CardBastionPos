<template>
  <div class="products-layout">
    <header class="products-header">
      <div>
        <h1>Productos e inventario</h1>
        <p>Normales + singles Star City</p>
      </div>
      <div class="header-actions">
        <button class="secondary-btn" @click="handleExportTemplate">Plantilla</button>
        <button class="secondary-btn" @click="handleImportExcel">Importar</button>
        <button class="secondary-btn" @click="handleBatchUpdateSingles">SCG lote</button>
        <button class="back-btn" @click="$router.push('/')">Volver</button>
      </div>
    </header>

    <section class="products-grid">
      <div class="card">
        <h2>{{ editingId ? 'Editar' : 'Agregar' }} producto</h2>

        <div class="form-grid">
          <div>
            <label>Tipo</label>
            <select v-model="form.product_type" class="input">
              <option value="normal">Normal</option>
              <option value="single">Single</option>
            </select>
          </div>
          <div>
            <label>Categoria</label>
            <input v-model="form.category" class="input" />
          </div>
          <div><label>SKU</label><input v-model="form.sku" class="input" /></div>
          <div><label>Codigo barras</label><input v-model="form.barcode" class="input" /></div>
          <div class="full"><label>Nombre</label><input v-model="form.name" class="input" /></div>

          <template v-if="isSingleForm">
            <div class="full single-helper">
              <strong>Flujo rapido para singles</strong>
              <p>Captura el nombre, abre Star City, pega la URL y el sistema intentara llenar los demas datos automaticamente.</p>
            </div>
          </template>

          <div><label>{{ isSingleForm ? 'Precio MXN autocalculado' : 'Precio MXN' }}</label><input v-model.number="form.price" type="number" min="0" step="0.01" class="input" :readonly="isSingleForm" /></div>
          <div><label>Costo</label><input v-model.number="form.cost" type="number" min="0" step="0.01" class="input" /></div>
          <div><label>Stock</label><input v-model.number="form.stock" type="number" min="0" step="1" class="input" /></div>
          <div><label>Stock min</label><input v-model.number="form.min_stock" type="number" min="0" step="1" class="input" /></div>

          <template v-if="isSingleForm">
            <div><label>SCG USD</label><input v-model.number="form.starcity_price_usd" class="input" type="number" min="0" step="0.01" /></div>
            <div class="full"><label>SCG URL</label><input v-model="form.starcity_url" class="input" /></div>
            <div class="full row-actions">
              <button class="secondary-btn" @click="openLinkModal">Vincular SCG</button>
              <button class="secondary-btn" @click="handleUpdateSinglePrice" :disabled="!editingId">Sync SCG</button>
              <button class="secondary-btn" @click="showSingleDetails = !showSingleDetails">
                {{ showSingleDetails ? 'Ocultar detalles' : 'Ver detalles' }}
              </button>
            </div>
            <div v-if="showSingleDetails" class="full single-details">
              <div class="form-grid">
                <div>
                  <label>Juego</label>
                  <select v-model="form.game" class="input">
                    <option value="">Selecciona</option>
                    <option v-for="option in gameOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </div>
                <div><label>Set</label><input v-model="form.set_name" class="input" /></div>
                <div><label>Set code</label><input v-model="form.set_code" class="input" /></div>
                <div><label>Collector</label><input v-model="form.collector_number" class="input" /></div>
                <div>
                  <label>Finish</label>
                  <select v-model="form.finish" class="input">
                    <option value="">Selecciona</option>
                    <option v-for="option in finishOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </div>
                <div>
                  <label>Idioma</label>
                  <select v-model="form.language" class="input">
                    <option value="">Selecciona</option>
                    <option v-for="option in languageOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </div>
                <div>
                  <label>Condicion</label>
                  <select v-model="form.card_condition" class="input">
                    <option value="">Selecciona</option>
                    <option v-for="option in cardConditionOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </div>
                <div><label>Scryfall ID</label><input v-model="form.scryfall_id" class="input" /></div>
                <div><label>SCG key</label><input v-model="form.starcity_variant_key" class="input" /></div>
                <div><label>Pricing mode</label><select v-model="form.pricing_mode" class="input"><option value="manual">manual</option><option value="starcity_direct">starcity_direct</option><option value="starcity_formula">starcity_formula</option></select></div>
                <div><label>Formula type</label><select v-model="form.pricing_formula_type" class="input"><option value="">auto</option><option value="multiplier">multiplier</option><option value="fixed_markup">fixed_markup</option><option value="multiplier_plus_fixed">multiplier_plus_fixed</option></select></div>
                <div><label>Formula val</label><input v-model.number="form.pricing_formula_value" class="input" type="number" min="0" step="0.01" /></div>
              </div>
            </div>
            <div class="full">
              <h3>Config global pricing</h3>
              <div class="form-grid">
                <div><label>TC</label><input v-model.number="pricingConfig.exchangeRate" class="input" type="number" step="0.01" /></div>
                <div><label>Multiplicador</label><input v-model.number="pricingConfig.multiplier" class="input" type="number" step="0.01" /></div>
                <div><label>Markup</label><input v-model.number="pricingConfig.fixedMarkup" class="input" type="number" step="0.01" /></div>
                <div><label>Redondeo</label><select v-model="pricingConfig.roundingMode" class="input"><option value="none">none</option><option value="nearest_1">nearest_1</option><option value="nearest_5">nearest_5</option><option value="nearest_10">nearest_10</option><option value="ceil_1">ceil_1</option><option value="ceil_5">ceil_5</option></select></div>
              </div>
              <button class="secondary-btn" @click="savePricingConfig">Guardar config</button>
            </div>
          </template>

          <div class="full">
            <label>Imagen</label>
            <div class="row-actions">
              <input v-model="form.image" class="input" readonly />
              <button class="secondary-btn" @click="handleSelectImage">Seleccionar</button>
            </div>
          </div>
        </div>

        <div v-if="message" class="message success">{{ message }}</div>
        <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>

        <div class="row-actions" style="margin-top:12px;">
          <button class="primary-btn" @click="handleSaveProduct">Guardar</button>
          <button v-if="editingId" class="cancel-btn" @click="cancelEdit">Cancelar</button>
        </div>
      </div>

      <div class="card">
        <div class="list-toolbar">
          <h2>Activos ({{ filteredActiveProducts.length }})</h2>
          <input v-model="productSearch" class="input search-input" placeholder="Buscar por nombre, SKU, barcode, categoria, set..." />
          <select v-model="listFilterType" class="input compact">
            <option value="all">Todos</option>
            <option value="normal">Normales</option>
            <option value="single">Singles</option>
          </select>
        </div>
        <div class="product-list">
          <div v-for="product in filteredActiveProducts" :key="product.id" class="product-row" @click="selectProduct(product)">
            <div>
              <strong>{{ product.name }} <small v-if="isSingleProduct(product)">[single]</small></strong>
              <p>{{ product.sku || 'Sin SKU' }} | {{ product.category || 'Sin categoria' }}</p>
              <p>Stock: {{ Number(product.stock||0) }} | Min: {{ Number(product.min_stock||0) }}</p>
              <p v-if="isSingleProduct(product)">{{ product.set_name || 'Sin set' }} | {{ product.finish || 'N/D' }} | SCG ${{ formatPrice(product.starcity_price_usd||0) }}</p>
            </div>
            <div class="product-actions" @click.stop>
              <strong>${{ formatPrice(product.price) }}</strong>
              <button class="small-btn" @click="openAdjustModal(product)">Ajustar</button>
              <button class="small-btn" @click="openEntryModal(product)">Entrada</button>
              <button class="small-btn" @click="openMovementsModal(product)">Movs</button>
              <button v-if="isSingleProduct(product)" class="small-btn" @click="openLinkModal(product)">Vincular SCG</button>
              <button v-if="isSingleProduct(product)" class="small-btn" @click="handleUpdateSinglePrice(product)">Sync SCG</button>
              <button class="danger-btn" @click="handleDeactivateProduct(product)">Desactivar</button>
            </div>
          </div>
        </div>
        <div class="list-toolbar" style="margin-top:18px;">
          <h2>Desactivados ({{ filteredInactiveProducts.length }})</h2>
          <input v-model="inactiveProductSearch" class="input search-input" placeholder="Buscar desactivados..." />
        </div>
        <div class="product-list">
          <div v-for="product in filteredInactiveProducts" :key="product.id" class="product-row inactive" @click.stop>
            <div>
              <strong>{{ product.name }}</strong>
              <p>{{ product.sku || 'Sin SKU' }}</p>
            </div>
            <div class="product-actions">
              <strong>${{ formatPrice(product.price) }}</strong>
              <button class="small-btn" @click="handleReactivateProduct(product)">Reactivar</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="adjustModal.open" class="modal-backdrop" @click.self="adjustModal.open=false">
      <div class="modal-card">
        <h3>Ajustar stock - {{ adjustModal.productName }}</h3>
        <div class="form-grid">
          <div><label>Modo</label><select v-model="adjustModal.mode" class="input"><option value="add">Sumar</option><option value="remove">Restar</option><option value="set">Fijar</option></select></div>
          <div><label>Cantidad</label><input v-model.number="adjustModal.quantity" class="input" type="number" min="0" /></div>
          <div class="full"><label>Motivo</label><textarea v-model="adjustModal.notes" class="input" rows="3"></textarea></div>
        </div>
        <div class="row-actions"><button class="cancel-btn" @click="adjustModal.open=false">Cancelar</button><button class="primary-btn" @click="handleSubmitAdjust">Guardar</button></div>
      </div>
    </div>

    <div v-if="entryModal.open" class="modal-backdrop" @click.self="entryModal.open=false">
      <div class="modal-card">
        <h3>Entrada - {{ entryModal.productName }}</h3>
        <div class="form-grid">
          <div><label>Cantidad</label><input v-model.number="entryModal.quantity" class="input" type="number" min="0" /></div>
          <div><label>Costo opcional</label><input v-model="entryModal.cost" class="input" type="number" min="0" step="0.01" /></div>
          <div class="full"><label>Referencia</label><input v-model="entryModal.reference" class="input" /></div>
          <div class="full"><label>Nota</label><textarea v-model="entryModal.notes" class="input" rows="3"></textarea></div>
        </div>
        <div class="row-actions"><button class="cancel-btn" @click="entryModal.open=false">Cancelar</button><button class="primary-btn" @click="handleSubmitEntry">Guardar</button></div>
      </div>
    </div>

    <div v-if="movementsModal.open" class="modal-backdrop" @click.self="movementsModal.open=false">
      <div class="modal-card large">
        <h3>Movimientos - {{ movementsModal.productName }}</h3>
        <table class="report-table" v-if="movementsList.length">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Cant</th><th>Antes</th><th>Despues</th><th>Ref</th><th>Notas</th></tr></thead>
          <tbody>
            <tr v-for="mv in movementsList" :key="mv.id"><td>{{ formatDate(mv.createdAt) }}</td><td>{{ mv.type }}</td><td>{{ mv.quantity }}</td><td>{{ mv.stockBefore }}</td><td>{{ mv.stockAfter }}</td><td>{{ formatReference(mv.referenceType,mv.referenceId) }}</td><td>{{ mv.notes || '-' }}</td></tr>
          </tbody>
        </table>
        <div v-else class="empty">Sin movimientos</div>
      </div>
    </div>

    <div v-if="linkModal.open" class="modal-backdrop" @click.self="linkModal.open=false">
      <div class="modal-card large">
        <h3>Vincular Star City - {{ linkModal.productName }}</h3>
        <div class="form-grid">
          <div class="full"><label>Busqueda</label><input v-model="linkModal.query" class="input" @keydown.enter.prevent="handleSearchSinglesCatalog" /></div>
          <div>
            <label>TCG</label>
            <select v-model="linkModal.game" class="input">
              <option value="Magic: The Gathering">Magic: The Gathering</option>
            </select>
          </div>
          <div class="full">
            <label>URL manual de Star City</label>
            <input v-model="linkModal.manualUrl" class="input" placeholder="Pega aqui la URL exacta de la carta en Star City" />
          </div>
        </div>
        <div class="row-actions">
          <button class="secondary-btn" type="button" @click="handleOpenStarCitySearch">
            Abrir en navegador
          </button>
          <button class="secondary-btn" type="button" @click="handleSearchSinglesCatalog" :disabled="linkSearchLoading">
            {{ linkSearchLoading ? 'Buscando...' : 'Buscar' }}
          </button>
          <button class="secondary-btn" type="button" @click="handleImportStarCityUrl" :disabled="linkImportLoading">
            {{ linkImportLoading ? 'Importando...' : 'Importar URL' }}
          </button>
          <span v-if="linkSearchLoading" class="search-status">Consultando Star City...</span>
          <span v-if="linkImportLoading" class="search-status">Leyendo precio desde la URL...</span>
        </div>
        <div v-if="linkSearchMessage" class="message success modal-message">{{ linkSearchMessage }}</div>
        <div v-if="linkSearchError" class="message error modal-message">{{ linkSearchError }}</div>
        <table class="report-table" v-if="linkModal.results.length">
          <thead><tr><th>Titulo</th><th>USD</th><th>URL</th><th></th></tr></thead>
          <tbody>
            <tr v-for="result in linkModal.results" :key="result.variantKey">
              <td>{{ result.title }}</td><td>${{ formatPrice(result.priceUsd||0) }}</td><td>{{ result.url }}</td>
              <td><button class="small-btn" @click="applyLinkResult(result)">Seleccionar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
const gameOptions = ['Magic: The Gathering', 'Pokemon', 'Yu-Gi-Oh!', 'One Piece', 'Lorcana', 'Star Wars Unlimited', 'Flesh and Blood']
const finishOptions = ['nonfoil', 'foil', 'etched', 'surge foil']
const languageOptions = ['EN', 'ES', 'JP', 'DE', 'FR', 'IT', 'PT', 'KO', 'CN', 'TW']
const cardConditionOptions = ['NM', 'LP', 'MP', 'HP', 'DMG']
const products = ref([])
const inactiveProducts = ref([])
const listFilterType = ref('all')
const productSearch = ref('')
const inactiveProductSearch = ref('')
const message = ref('')
const errorMessage = ref('')
const editingId = ref(null)
const pricingConfig = reactive({ exchangeRate: 18, multiplier: 1, fixedMarkup: 0, roundingMode: 'none' })
const movementsList = ref([])
const showSingleDetails = ref(false)
const linkSearchLoading = ref(false)
const linkSearchMessage = ref('')
const linkSearchError = ref('')
const linkImportLoading = ref(false)
const form = reactive({ product_type:'normal', sku:'', barcode:'', name:'', category:'', price:0, cost:0, stock:0, min_stock:0, image:'', game:'', card_name:'', set_name:'', set_code:'', collector_number:'', finish:'', language:'', card_condition:'', scryfall_id:'', starcity_url:'', starcity_variant_key:'', starcity_price_usd:0, starcity_last_sync:null, pricing_mode:'manual', pricing_formula_type:'', pricing_formula_value:0 })
const adjustModal = reactive({ open:false, productId:null, productName:'', currentStock:0, mode:'add', quantity:0, notes:'' })
const entryModal = reactive({ open:false, productId:null, productName:'', currentStock:0, quantity:0, cost:'', reference:'', notes:'' })
const movementsModal = reactive({ open:false, productId:null, productName:'' })
const linkModal = reactive({ open:false, productId:null, productName:'', query:'', game:'Magic: The Gathering', manualUrl:'', results:[] })
const isSingleForm = computed(() => form.product_type === 'single')
const filteredActiveProducts = computed(() => {
  const term = normalizeSearchTerm(productSearch.value)
  return (products.value || []).filter((product) => {
    if (listFilterType.value !== 'all' && normalizedProductType(product) !== listFilterType.value) return false
    if (!term) return true
    return buildProductSearchText(product).includes(term)
  })
})
const filteredInactiveProducts = computed(() => {
  const term = normalizeSearchTerm(inactiveProductSearch.value)
  return (inactiveProducts.value || []).filter((product) => !term || buildProductSearchText(product).includes(term))
})
function formatPrice(v){ return Number(v||0).toFixed(2) }
function formatDate(v){ return v ? new Date(v).toLocaleString() : '' }
function formatReference(t,id){ return id ? `${t||'manual'} #${id}` : (t||'manual') }
function normalizedProductType(p){ return String(p?.product_type || 'normal').toLowerCase() === 'single' ? 'single' : 'normal' }
function isSingleProduct(p){ return normalizedProductType(p) === 'single' }
function normalizeSearchTerm(v){ return String(v || '').trim().toLowerCase() }
function buildProductSearchText(product){
  return [
    product?.name,
    product?.sku,
    product?.barcode,
    product?.category,
    product?.card_name,
    product?.set_name,
    product?.set_code,
    product?.collector_number,
    product?.game,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
}
function clearMessages(){ message.value=''; errorMessage.value='' }
function clearLinkSearchState(){ linkSearchLoading.value=false; linkSearchMessage.value=''; linkSearchError.value=''; linkImportLoading.value=false }
function cancelEdit(){ editingId.value=null; showSingleDetails.value=false; Object.assign(form,{ product_type:'normal', sku:'', barcode:'', name:'', category:'', price:0, cost:0, stock:0, min_stock:0, image:'', game:'', card_name:'', set_name:'', set_code:'', collector_number:'', finish:'', language:'', card_condition:'', scryfall_id:'', starcity_url:'', starcity_variant_key:'', starcity_price_usd:0, starcity_last_sync:null, pricing_mode:'manual', pricing_formula_type:'', pricing_formula_value:0 }) }
async function loadProducts(){ try{ const [a,b]=await Promise.all([window.posAPI.getProducts(), window.posAPI.getInactiveProducts()]); products.value=a||[]; inactiveProducts.value=b||[] }catch(e){ products.value=[]; inactiveProducts.value=[] } }
async function loadPricingConfig(){ try{ const r=await window.posAPI.getSinglesPricingConfig(); if(r?.config) Object.assign(pricingConfig,{ exchangeRate:Number(r.config.exchangeRate||18), multiplier:Number(r.config.multiplier||1), fixedMarkup:Number(r.config.fixedMarkup||0), roundingMode:String(r.config.roundingMode||'none') }) }catch(e){} }
async function savePricingConfig(){ try{ clearMessages(); const r=await window.posAPI.updateSinglesPricingConfig(pricingConfig); if(r?.success) message.value='Configuracion guardada.' }catch(e){ errorMessage.value=e?.message||'Error guardando config.' } }
async function handleSelectImage(){ try{ const r=await window.posAPI.selectProductImage(); if(r?.success) form.image=r.fileName||'' }catch(e){ errorMessage.value=e?.message||'Error seleccionando imagen.' } }
async function selectProduct(p){ editingId.value=p.id; showSingleDetails.value=String(p?.product_type||'normal').toLowerCase()==='single'; Object.assign(form,p,{ product_type:p.product_type||'normal', pricing_mode:p.pricing_mode||'manual' }) }
function payloadFromForm(){ return { ...form, price:Number(form.price||0), cost:Number(form.cost||0), stock:Number(form.stock||0), min_stock:Number(form.min_stock||0), starcity_price_usd:Number(form.starcity_price_usd||0), pricing_formula_value:Number(form.pricing_formula_value||0) } }
async function handleSaveProduct(){ try{ clearMessages(); let r=null; const payload=payloadFromForm(); if(editingId.value){ r=form.product_type==='single' ? await window.posAPI.updateSingle({ id:editingId.value, ...payload }) : await window.posAPI.updateProduct({ id:editingId.value, ...payload }) } else { r=form.product_type==='single' ? await window.posAPI.createSingle(payload) : await window.posAPI.createProduct(payload) } if(r?.success){ message.value='Guardado correctamente.'; cancelEdit(); await loadProducts() } }catch(e){ errorMessage.value=e?.message||'No se pudo guardar.' } }
async function handleImportExcel(){ try{ clearMessages(); const r=await window.posAPI.importProductsFromExcel(); if(r?.success) { message.value=`Importado. Nuevos:${r.created} Actualizados:${r.updated}`; await loadProducts() } }catch(e){ errorMessage.value=e?.message||'Error importando.' } }
async function handleExportTemplate(){ try{ clearMessages(); const r=await window.posAPI.exportProductTemplate(); if(r?.success) message.value=`Plantilla: ${r.filePath}` }catch(e){ errorMessage.value=e?.message||'Error exportando.' } }
async function handleDeactivateProduct(p){ if(!window.confirm(`Desactivar ${p.name}?`)) return; try{ await window.posAPI.deactivateProduct(p.id); await loadProducts() }catch(e){ errorMessage.value=e?.message||'Error desactivando.' } }
async function handleReactivateProduct(p){ if(!window.confirm(`Reactivar ${p.name}?`)) return; try{ await window.posAPI.reactivateProduct(p.id); await loadProducts() }catch(e){ errorMessage.value=e?.message||'Error reactivando.' } }
async function handleUpdateSinglePrice(p=null){ try{ clearMessages(); const id=Number(p?.id||editingId.value||0); if(!id) throw new Error('Selecciona un single.'); const r=await window.posAPI.updateSingleStarCityPrice({ productId:id }); if(r?.success){ message.value='SCG actualizado.'; await loadProducts(); if(editingId.value===id) await selectProduct(r.product) } }catch(e){ errorMessage.value=e?.message||'Error SCG.' } }
async function handleRecalculateSinglePrice(p=null){ try{ clearMessages(); const id=Number(p?.id||editingId.value||0); if(!id) throw new Error('Selecciona un single.'); const r=await window.posAPI.recalculateSingleSalePrice({ productId:id }); if(r?.success){ message.value=`Precio recalculado ${formatPrice(r.salePriceMxn)}`; await loadProducts(); if(editingId.value===id) await selectProduct(r.product) } }catch(e){ errorMessage.value=e?.message||'Error recalculo.' } }
async function handleBatchUpdateSingles(){ try{ clearMessages(); const r=await window.posAPI.updateSingleStarCityPricesBatch({}); if(r?.success){ message.value=`Lote total:${r.total} ok:${r.updated} fail:${r.failed}`; await loadProducts() } }catch(e){ errorMessage.value=e?.message||'Error lote.' } }
function openAdjustModal(p){ Object.assign(adjustModal,{ open:true, productId:Number(p.id), productName:p.name||'', currentStock:Number(p.stock||0), mode:'add', quantity:0, notes:'' }) }
async function handleSubmitAdjust(){ try{ if(!adjustModal.notes.trim()) throw new Error('Motivo obligatorio'); const r=await window.posAPI.adjustStock({ productId:adjustModal.productId, mode:adjustModal.mode, quantity:Number(adjustModal.quantity||0), notes:adjustModal.notes }); if(r?.success){ adjustModal.open=false; await loadProducts(); message.value='Ajuste guardado.' } }catch(e){ errorMessage.value=e?.message||'Error ajuste.' } }
function openEntryModal(p){ Object.assign(entryModal,{ open:true, productId:Number(p.id), productName:p.name||'', currentStock:Number(p.stock||0), quantity:0, cost:'', reference:'', notes:'' }) }
async function handleSubmitEntry(){ try{ const q=Number(entryModal.quantity||0); if(q<=0) throw new Error('Cantidad mayor a 0'); const payload={ productId:entryModal.productId, quantity:q, notes:entryModal.notes, reference:entryModal.reference }; if(entryModal.cost!==''&&entryModal.cost!==null) payload.cost=Number(entryModal.cost); const r=await window.posAPI.addStockEntry(payload); if(r?.success){ entryModal.open=false; await loadProducts(); message.value='Entrada registrada.' } }catch(e){ errorMessage.value=e?.message||'Error entrada.' } }
async function openMovementsModal(p){ movementsModal.open=true; movementsModal.productId=Number(p.id); movementsModal.productName=p.name||''; movementsList.value=await window.posAPI.getProductMovements(p.id) }
async function openLinkModal(p=null){
  clearMessages()
  clearLinkSearchState()
  if(p) await selectProduct(p)
  if(String(form.product_type || '').toLowerCase() !== 'single'){
    if(editingId.value){
      errorMessage.value='Este producto esta como "normal". Cambia Tipo a "single", guarda y luego vincula SCG.'
    } else {
      errorMessage.value='Selecciona o crea un producto tipo single para vincular SCG.'
    }
    return
  }
  Object.assign(linkModal,{ open:true, productId:Number(p?.id||editingId.value||0), productName:form.name||'Single', query:form.card_name||form.name||'', game:'Magic: The Gathering', manualUrl:form.starcity_url||'', results:[] })
}
async function handleOpenStarCitySearch(){
  try{
    clearMessages()
    clearLinkSearchState()
    if(!String(linkModal.query || '').trim()) throw new Error('Escribe el nombre de la carta para abrir la busqueda.')
    await window.posAPI.openStarCitySearch({ query:linkModal.query, game:linkModal.game })
    linkSearchMessage.value='Se abrio la busqueda en tu navegador. Copia la URL correcta de la carta y pegala abajo.'
  }catch(e){
    linkSearchError.value=e?.message||'No se pudo abrir el navegador.'
  }
}
async function handleSearchSinglesCatalog(){
  try{
    clearMessages()
    clearLinkSearchState()
    if(!String(linkModal.query || '').trim()) throw new Error('Escribe el nombre de la carta para buscar.')
    linkSearchLoading.value=true
    const r=await window.posAPI.searchSinglesCatalog({ query:linkModal.query, game:linkModal.game })
    linkModal.results=r?.results||[]
    if(linkModal.results.length){
      linkSearchMessage.value=`Se encontraron ${linkModal.results.length} coincidencia(s).`
    } else {
      linkSearchMessage.value='No se encontraron coincidencias con esos filtros.'
    }
  }catch(e){
    linkModal.results=[]
    linkSearchError.value=e?.message||'Error busqueda SCG.'
  }finally{
    linkSearchLoading.value=false
  }
}
async function handleImportStarCityUrl(){
  try{
    clearMessages()
    clearLinkSearchState()
    if(!String(linkModal.manualUrl || '').trim()) throw new Error('Pega la URL exacta de la carta en Star City.')
    linkImportLoading.value=true
    const r=await window.posAPI.fetchSingleStarCityPriceFromUrl({ url:linkModal.manualUrl })
    form.starcity_url=r?.url||String(linkModal.manualUrl || '').trim()
    form.starcity_variant_key=r?.url||String(linkModal.manualUrl || '').trim()
    form.starcity_price_usd=Number(r?.priceUsd||0)
    form.price=Number(r?.priceMxn||0)
    form.starcity_last_sync=new Date().toISOString()
    if(r?.metadata){
      form.product_type='single'
      form.game=r.metadata.game||form.game||'Magic: The Gathering'
      form.category=r.metadata.category||form.category||'Singles'
      form.name=r.metadata.name||form.name
      form.card_name=r.metadata.cardName||form.card_name||form.name
      form.set_name=r.metadata.setName||form.set_name
      form.set_code=r.metadata.setCode||form.set_code
      form.collector_number=r.metadata.collectorNumber||form.collector_number
      form.finish=r.metadata.finish||form.finish
      form.language=r.metadata.language||form.language
      form.card_condition=r.metadata.cardCondition||form.card_condition
    }
    linkModal.manualUrl=form.starcity_url
    if(editingId.value){
      await window.posAPI.linkSingleStarCity({ productId:Number(editingId.value), url:form.starcity_url, variantKey:form.starcity_variant_key, priceUsd:Number(form.starcity_price_usd||0), price:Number(form.price||0) })
      await loadProducts()
      message.value=`URL importada. Precio SCG USD ${formatPrice(form.starcity_price_usd)} / MXN ${formatPrice(form.price)}`
    } else {
      message.value=`URL importada. Precio SCG USD ${formatPrice(form.starcity_price_usd)} / MXN ${formatPrice(form.price)}. Guarda el producto para conservarlo.`
    }
    linkSearchMessage.value='URL validada correctamente.'
  }catch(e){
    linkSearchError.value=e?.message||'No se pudo importar la URL.'
  }finally{
    linkImportLoading.value=false
  }
}
async function applyLinkResult(r){ try{ form.starcity_url=r.url||''; form.starcity_variant_key=r.variantKey||''; form.starcity_price_usd=Number(r.priceUsd||0); form.starcity_last_sync=new Date().toISOString(); if(editingId.value){ await window.posAPI.linkSingleStarCity({ productId:Number(editingId.value), url:r.url, variantKey:r.variantKey, priceUsd:Number(r.priceUsd||0) }); await loadProducts(); message.value='Vinculado.' } else { message.value='Vinculo listo, guarda producto.' } linkModal.open=false }catch(e){ errorMessage.value=e?.message||'Error vinculando.' } }
onMounted(async()=>{ await Promise.all([loadProducts(), loadPricingConfig()]) })
</script>

<style scoped>
.products-layout{min-height:100vh;background:#1e1e1e;color:#f5f5f5;padding:20px}
.products-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap}
.header-actions,.row-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.products-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:#232323;border:1px solid #323232;border-radius:12px;padding:14px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.full{grid-column:1/-1}
.input{width:100%;padding:10px;border-radius:10px;border:1px solid #3a3a3a;background:#2a2a2a;color:#fff}
.compact{width:180px}
.list-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.search-input{flex:1 1 260px;min-width:220px}
.search-status{color:#d1d5db;font-size:13px}
.primary-btn,.secondary-btn,.back-btn,.cancel-btn,.small-btn,.danger-btn{border:none;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer}
.primary-btn{background:#22c55e;color:#fff}.secondary-btn{background:#2563eb;color:#fff}.back-btn{background:#f29a2e;color:#111}.cancel-btn{background:#525252;color:#fff}.small-btn{background:#334155;color:#fff}.danger-btn{background:#b91c1c;color:#fff}
.product-list{display:flex;flex-direction:column;gap:8px;max-height:42vh;overflow:auto}
.product-row{display:flex;justify-content:space-between;gap:10px;background:#2c2c2c;padding:10px;border-radius:10px}.product-row.inactive{opacity:.8}
.product-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px;z-index:70}
.modal-card{width:min(780px,100%);max-height:90vh;overflow:auto;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:14px}.modal-card.large{width:min(1100px,100%)}
.modal-message{margin-top:10px}
.report-table{width:100%;border-collapse:collapse;margin-top:10px}.report-table th,.report-table td{padding:8px;border-bottom:1px solid #374151;text-align:left}
.message{margin-top:12px;padding:10px;border-radius:8px}.message.success{background:#166534}.message.error{background:#7f1d1d}
.single-helper,.single-details{padding:12px;border:1px solid #374151;border-radius:10px;background:#1f2937}
.single-helper p{margin:6px 0 0;color:#d1d5db}
@media(max-width:1100px){.products-grid{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}}
</style>
