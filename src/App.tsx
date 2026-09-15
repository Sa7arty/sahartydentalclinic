import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import PageGuard from './components/PageGuard'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PatientsList from './pages/PatientsList'
import PatientDetail from './pages/PatientDetail'
import Schedule from './pages/Schedule'
import Balance from './pages/Balance'
import HR from './pages/HR'
import Analytics from './pages/Analytics'
import Inventory from './pages/Inventory'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <PageGuard page="dashboard">
              <Dashboard />
            </PageGuard>
          }
        />
        <Route
          path="patients"
          element={
            <PageGuard page="patients">
              <PatientsList />
            </PageGuard>
          }
        />
        <Route
          path="patients/:id"
          element={
            <PageGuard page="patients">
              <PatientDetail />
            </PageGuard>
          }
        />
        <Route
          path="schedule"
          element={
            <PageGuard page="schedule">
              <Schedule />
            </PageGuard>
          }
        />
        <Route
          path="finances"
          element={
            <PageGuard page="finances">
              <Balance />
            </PageGuard>
          }
        />
        <Route path="balance" element={<Navigate to="/finances" replace />} />
        <Route
          path="hr"
          element={
            <PageGuard page="hr">
              <HR />
            </PageGuard>
          }
        />
        <Route
          path="analytics"
          element={
            <PageGuard page="analytics">
              <Analytics />
            </PageGuard>
          }
        />
        <Route
          path="inventory"
          element={
            <PageGuard page="inventory">
              <Inventory />
            </PageGuard>
          }
        />
        <Route
          path="settings"
          element={
            <PageGuard page="settings">
              <Settings />
            </PageGuard>
          }
        />
      </Route>
    </Routes>
  )
}
