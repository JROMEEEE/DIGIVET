import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { DbStatusBadge } from '../../components/DbStatusBadge/DbStatusBadge'
import './DashboardLayout.css'

const navItems = [
  { to: '/dashboard',           label: 'Overview',       icon: 'OV', end: true },
  { to: '/dashboard/encode',    label: 'Encode',         icon: 'EN' },
  { to: '/dashboard/records',   label: 'Records',        icon: 'RC' },
  { to: '/dashboard/vets',      label: 'Veterinarians',  icon: 'VT' },
]

const titles = {
  '/dashboard':          { title: 'Dashboard',     crumb: 'Admin · Overview' },
  '/dashboard/encode':   { title: 'Encode',        crumb: 'Admin · Encoding' },
  '/dashboard/records':  { title: 'Records',       crumb: 'Admin · Records' },
  '/dashboard/vets':     { title: 'Veterinarians', crumb: 'Admin · Veterinarians' },
}

export default function DashboardLayout() {
  const location = useLocation()
  const meta = titles[location.pathname] ?? { title: 'Dashboard', crumb: 'Admin' }

  return (
    <div className="dash">
      <aside className="dash-sidebar" aria-label="Admin navigation">
        <Link to="/" className="dash-brand" aria-label="DIGIVET home">
          <span className="brand-mark" aria-hidden="true">DV</span>
          <span className="dash-brand-text">
            <span className="brand-name">DIGIVET</span>
            <span className="dash-brand-sub">Local System</span>
          </span>
        </Link>

        <nav className="dash-nav" aria-label="Admin sections">
          <div className="dash-nav-group">Workspace</div>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                {item.disabled ? (
                  <button type="button" className="dash-nav-item is-disabled" disabled>
                    <span className="dash-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="dash-nav-soon">soon</span>
                  </button>
                ) : (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `dash-nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <span className="dash-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="dash-sidebar-foot">
          <span className="badge-unofficial">Unofficial</span>
          <span className="dash-sidebar-version">v0.1.0</span>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div className="dash-topbar-left">
            <h1 className="dash-page-title">{meta.title}</h1>
            <span className="dash-breadcrumb">{meta.crumb}</span>
          </div>

          <div className="dash-topbar-right">
            <DbStatusBadge />
            <span className="dash-auth-pill" title="Authentication will be added later">
              Auth pending
            </span>
            <div className="dash-avatar" aria-label="Admin user">A</div>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  )
}
