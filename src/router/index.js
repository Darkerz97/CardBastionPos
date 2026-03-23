import { createRouter, createWebHashHistory } from 'vue-router'
import PosView from '../views/PosView.vue'
import SalesHistoryView from '../views/SalesHistoryView.vue'
import CashView from '../views/CashView.vue'
import ProductsView from '../views/ProductsView.vue'
import BackupView from '../views/BackupView.vue'
import ReportsView from '../views/ReportsView.vue'
import SettingsView from '../views/SettingsView.vue'
import CustomersView from '../views/CustomersView.vue'
import CustomerHistoryView from '../views/CustomerHistoryView.vue'
import TournamentsView from '../views/TournamentsView.vue'
import ReceivablesView from '../views/ReceivablesView.vue'
import PreordersView from '../views/PreordersView.vue'
import UsersAdminView from '../views/UsersAdminView.vue'
import { refreshSession, hasWindowAccess, getFirstAllowedRoute } from '../session'


const routes = [
  { path: '/', name: 'pos', component: PosView, meta: { permission: 'pos' } },
  { path: '/history', name: 'history', component: SalesHistoryView, meta: { permission: 'history' } },
  { path: '/cash', name: 'cash', component: CashView, meta: { permission: 'cash' } },
  { path: '/products', name: 'products', component: ProductsView, meta: { permission: 'products' } },
  { path: '/backup', name: 'backup', component: BackupView, meta: { permission: 'backup' } },
  { path: '/reports', name: 'reports', component: ReportsView, meta: { permission: 'reports' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { permission: 'settings' } },
  { path: '/customers', name: 'customers', component: CustomersView, meta: { permission: 'customers' } },
  { path: '/customers/history', name: 'customer-history', component: CustomerHistoryView, meta: { permission: 'customer-history' } },
  { path: '/receivables', name: 'receivables', component: ReceivablesView, meta: { permission: 'receivables' } },
  { path: '/preorders', name: 'preorders', component: PreordersView, meta: { permission: 'preorders' } },
  { path: '/tournaments', name: 'tournaments', component: TournamentsView, meta: { permission: 'tournaments' } },
  { path: '/users', name: 'users', component: UsersAdminView, meta: { permission: 'users' } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to) => {
  await refreshSession()

  if (!to.meta?.permission) {
    return true
  }

  if (!hasWindowAccess(to.meta.permission)) {
    return getFirstAllowedRoute()
  }

  return true
})

export default router
