<template>
  <div class="app-shell" :style="themeVars" :class="{ compact: posCustomization.compactMode }">
    <aside class="shell-sidebar">
      <div class="brand">
        <img :src="heroImage" alt="Card Bastion" class="brand-logo" />
        <h1>{{ posCustomization.storeName }}</h1>
        <p>{{ posCustomization.posSubtitle }}</p>
        <small v-if="sessionState.user" class="session-caption">
          {{ sessionState.user.displayName }}
        </small>
      </div>

      <div class="menu-block">
        <button
          v-for="item in visibleMenuItems"
          :key="item.route"
          class="menu-btn"
          :class="{ active: isActiveRoute(item) }"
          @click="router.push(item.route)"
        >
          {{ item.label }}
        </button>

        <button class="menu-btn logout-btn" @click="handleLogout">
          Cambiar usuario
        </button>
      </div>
    </aside>

    <main class="shell-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import heroImage from '../assets/hero.png'
import { clearSessionState, hasWindowAccess, sessionState } from '../session'

const router = useRouter()
const route = useRoute()

const posCustomization = ref({
  storeName: 'Card Bastion',
  posSubtitle: 'Point of Sale',
  accentColor: '#f2b138',
  compactMode: false,
})

const menuItems = [
  { key: 'pos', label: 'Nueva venta', route: '/' },
  { key: 'history', label: 'Historial', route: '/history' },
  { key: 'cash', label: 'Caja', route: '/cash' },
  { key: 'products', label: 'Productos', route: '/products' },
  { key: 'backup', label: 'Respaldo', route: '/backup' },
  { key: 'reports', label: 'Reportes', route: '/reports' },
  { key: 'settings', label: 'Configuracion', route: '/settings' },
  { key: 'customers', label: 'Clientes', route: '/customers' },
  { key: 'customer-history', label: 'Historial por cliente', route: '/customers/history' },
  { key: 'receivables', label: 'Cuentas por cobrar', route: '/receivables' },
  { key: 'preorders', label: 'Preventas', route: '/preorders' },
  { key: 'tournaments', label: 'Torneos', route: '/tournaments' },
  { key: 'users', label: 'Usuarios', route: '/users' },
]

const visibleMenuItems = computed(() => {
  return menuItems.filter((item) => hasWindowAccess(item.key))
})

const themeVars = computed(() => ({
  '--accent-color': posCustomization.value?.accentColor || '#f2b138',
}))

function isActiveRoute(item) {
  return route.path === item.route
}

async function loadPosCustomization() {
  try {
    const settings = await window.posAPI.getPosCustomization()
    posCustomization.value = {
      ...posCustomization.value,
      ...(settings || {}),
    }
  } catch (error) {
    console.error('Error cargando personalizacion del menu:', error)
  }
}

async function handleLogout() {
  await window.posAPI.logout()
  clearSessionState()
  window.location.reload()
}

onMounted(async () => {
  await loadPosCustomization()
})
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 100vh;
  background: #0f1115;
  color: #f5f5f5;
}

.shell-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  background:
    radial-gradient(circle at top left, rgba(242, 177, 56, 0.18), transparent 28%),
    linear-gradient(180deg, #151515 0%, #111827 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  padding: 24px 18px;
}

.shell-sidebar::after {
  content: '';
  position: absolute;
  inset: 14px 12px 14px 14px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

.brand,
.menu-block {
  position: relative;
  z-index: 1;
}

.brand-logo {
  width: 84px;
  height: 84px;
  object-fit: cover;
  border-radius: 20px;
  margin-bottom: 12px;
  box-shadow: 0 18px 30px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  animation: floatBrand 5s ease-in-out infinite;
}

.brand h1 {
  margin: 0;
  font-size: 28px;
  color: var(--accent-color, #f2b138);
}

.brand p {
  margin-top: 6px;
  color: #bdbdbd;
}

.session-caption {
  display: block;
  margin-top: 10px;
  color: #d4d4d8;
}

.menu-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 32px;
}

.menu-btn {
  border: none;
  border-radius: 14px;
  padding: 14px;
  text-align: left;
  background: rgba(38, 38, 38, 0.84);
  color: #f5f5f5;
  cursor: pointer;
  font-size: 15px;
  transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.menu-btn.active,
.menu-btn:hover {
  background: var(--accent-color, #f29a2e);
  color: #111;
  font-weight: 700;
  transform: translateX(4px);
}

.logout-btn {
  background: #7f1d1d;
}

.shell-content {
  min-width: 0;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.1), transparent 20%),
    radial-gradient(circle at bottom left, rgba(242, 177, 56, 0.08), transparent 24%);
}

@keyframes floatBrand {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}

@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .shell-sidebar {
    position: relative;
    height: auto;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
}
</style>
