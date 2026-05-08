import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './shared/AuthContext'
import LandingPage        from './online/pages/LandingPage/LandingPage'
import LoginPage          from './online/pages/LoginPage/LoginPage'
import RegisterPage       from './online/pages/RegisterPage/RegisterPage'
import DashboardLayout    from './local/pages/DashboardLayout/DashboardLayout'
import DashboardOverview  from './local/pages/DashboardOverview/DashboardOverview'
import EncodePage         from './local/pages/EncodePage/EncodePage'
import RecordsPage        from './local/pages/RecordsPage/RecordsPage'
import VeterinariansPage  from './local/pages/VeterinariansPage/VeterinariansPage'
import './shared/styles/components.css'

// ── Route guards ──────────────────────────────────────────────
function AdminRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

function GuestOnly({ children }) {
  const { user } = useAuth()
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

// ── App ───────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/"         element={<LandingPage />} />
      <Route path="/login"    element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />

      <Route path="/dashboard" element={<AdminRoute><DashboardLayout /></AdminRoute>}>
        <Route index          element={<DashboardOverview />} />
        <Route path="encode"  element={<EncodePage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="vets"    element={<VeterinariansPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
