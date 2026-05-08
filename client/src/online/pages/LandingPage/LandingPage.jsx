import { Link } from 'react-router-dom'
import { useAuth } from '../../../shared/AuthContext'
import './LandingPage.css'

function LandingPage() {
  const { user } = useAuth()

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="brand" aria-label="DIGIVET home">
            <span className="brand-mark" aria-hidden="true">DV</span>
            <div className="brand-text">
              <span className="brand-name">DIGIVET</span>
              <span className="brand-sub">Local System</span>
            </div>
          </Link>
          <span className="badge-unofficial" title="Not affiliated with the Lipa City LGU">
            Unofficial
          </span>
          <span className="nav-spacer" />
          <div className="nav-auth">
            {user ? (
              <>
                <span className="nav-user">
                  {user.display_name}
                </span>
                <Link to="/dashboard" className="btn btn-primary">Go to dashboard</Link>
              </>
            ) : (
              <>
                <Link to="/login"    className="btn btn-outline">Sign in</Link>
                <Link to="/register" className="btn btn-primary">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div>
            <span className="eyebrow">Lipa City Veterinary Office · Local System</span>
            <h1>
              Pet vaccinations,{' '}
              <span className="accent">encoded in the field.</span>
            </h1>
            <p className="lede">
              DIGIVET Local is the offline field tool for veterinary staff —
              encode vaccination records during barangay drives or clinic visits,
              manage pet registrations, and generate approval IDs, all without
              needing internet access.
            </p>
            <div className="hero-actions">
              <Link to="/login"    className="btn btn-primary">Sign in to dashboard</Link>
              <Link to="/register" className="btn btn-outline">Register as a vet</Link>
            </div>
            <div className="hero-meta">
              <span className="dot" aria-hidden="true" />
              Capstone project — Batangas State University, Lipa Campus
            </div>
          </div>

          <aside className="hero-card" aria-label="Sample vaccination record">
            <div className="hero-card-head">
              <span className="hero-card-title">Vaccination Record</span>
              <span className="pill">DRIVE</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Pet</span>
              <span className="value">Mango · Aspin · 3 yrs</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Owner</span>
              <span className="value">J. Reyes · Brgy. Anilao</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Vaccine</span>
              <span className="value"><span className="tick" aria-hidden="true" />Anti-rabies</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Approval ID</span>
              <span className="value mono">AP-2026-4F3A2C1B</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Session</span>
              <span className="value">Brgy. Drive · May 8, 2026</span>
            </div>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Everything the field needs</h2>
          <p>
            Purpose-built for veterinary staff conducting barangay vaccination
            drives and managing clinic records.
          </p>
        </div>
        <div className="features">
          <article className="feature">
            <div className="icon" aria-hidden="true">01</div>
            <h3>Barangay drive sessions</h3>
            <p>
              Start a session for any barangay and get all registered pets
              pre-loaded. Encode vaccinations one by one — no searching required.
            </p>
          </article>
          <article className="feature">
            <div className="icon" aria-hidden="true">02</div>
            <h3>Approval ID generation</h3>
            <p>
              Every vaccination record gets a unique auto-generated approval code
              tied to the attending vet, providing a verifiable audit trail.
            </p>
          </article>
          <article className="feature">
            <div className="icon" aria-hidden="true">03</div>
            <h3>Records management</h3>
            <p>
              View, filter, edit, and delete vaccination records. Filter by
              barangay session or search by pet and owner name across all entries.
            </p>
          </article>
        </div>
      </section>

      <section className="disclaimer">
        <div className="disclaimer-inner">
          <div className="disclaimer-icon" aria-hidden="true">!</div>
          <p>
            <strong>Local system only.</strong> This is the offline field module
            for veterinary staff. Pet owner access and inter-system sync are part
            of a separate online module currently in development.{' '}
            DIGIVET is an academic capstone project and is{' '}
            <em>not</em> an official product of the Lipa City Local Government Unit.
          </p>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">DV</span>
            <span className="brand-name">DIGIVET</span>
            <span className="badge-unofficial" style={{ marginLeft: 8 }}>Unofficial</span>
          </div>
          <div className="footer-meta">
            © {new Date().getFullYear()} DIGIVET · Capstone project, BatStateU Lipa
          </div>
        </div>
      </footer>
    </>
  )
}

export default LandingPage
