import { createRouter, createWebHashHistory } from 'vue-router'
import PosView from '../views/PosView.vue'
import SalesHistoryView from '../views/SalesHistoryView.vue'
import CashView from '../views/CashView.vue'
import ProductsView from '../views/ProductsView.vue'
import BackupView from '../views/BackupView.vue'
import ReportsView from '../views/ReportsView.vue'
import CustomersView from '../views/CustomersView.vue'
import CustomerHistoryView from '../views/CustomerHistoryView.vue'
import TournamentsView from '../views/TournamentsView.vue'


const routes = [
  { path: '/', name: 'pos', component: PosView },
  { path: '/history', name: 'history', component: SalesHistoryView },
  { path: '/cash', name: 'cash', component: CashView },
  { path: '/products', name: 'products', component: ProductsView },
  { path: '/backup', name: 'backup', component: BackupView },
  {path: '/reports', name: 'reports', component: ReportsView },
  {path: '/customers', name: 'customers', component: CustomersView },
  { path: '/customers/history', name: 'customer-history', component: CustomerHistoryView },
  { path: '/tournaments', name: 'tournaments', component: TournamentsView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
