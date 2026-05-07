import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './online/pages/LandingPage/LandingPage'
import DashboardLayout from './local/pages/DashboardLayout/DashboardLayout'
import DashboardOverview from './local/pages/DashboardOverview/DashboardOverview'
import EncodePage from './local/pages/EncodePage/EncodePage'
import VeterinariansPage from './local/pages/VeterinariansPage/VeterinariansPage'
import RecordsPage from './local/pages/RecordsPage/RecordsPage'
import './shared/styles/components.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardOverview />} />
          <Route path="encode" element={<EncodePage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="vets" element={<VeterinariansPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
