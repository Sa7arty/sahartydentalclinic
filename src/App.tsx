import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PatientsList from './pages/PatientsList'
import PatientDetail from './pages/PatientDetail'
import Schedule from './pages/Schedule'
import NewVisit from './pages/NewVisit'
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
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<PatientsList />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="schedule/new-visit" element={<NewVisit />} />
        <Route path="finances" element={<Balance />} />
        <Route path="balance" element={<Navigate to="/finances" replace />} />
        <Route path="hr" element={<HR />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
