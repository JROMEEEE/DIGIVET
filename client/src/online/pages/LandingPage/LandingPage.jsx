import { Link } from 'react-router-dom'
import './LandingPage.css'

function LandingPage() {
  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="brand" aria-label="DIGIVET home">
            <span className="brand-mark" aria-hidden="true">DV</span>
            <span className="brand-name">DIGIVET</span>
          </Link>
          <span className="badge-unofficial" title="Not affiliated with the Lipa City LGU">
            Unofficial
          </span>
          <span className="nav-spacer" />
          <nav className="nav-links" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
          <Link to="/dashboard" className="btn btn-primary">Open dashboard</Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div>
            <span className="eyebrow">Lipa City Veterinary Office</span>
            <h1>
              Digital pet vaccination records,{' '}
              <span className="accent">built for the field.</span>
            </h1>
            <p className="lede">
              DIGIVET is a hybrid offline + online system for encoding,
              tracking, and analyzing pet vaccinations across Lipa City —
              replacing paper logs with auditable digital records that sync
              when the internet is back.
            </p>
            <div className="hero-actions">
              <Link to="/dashboard" className="btn btn-primary">Open dashboard</Link>
              <a href="#features" className="btn btn-outline">See features</a>
            </div>
            <div className="hero-meta">
              <span className="dot" aria-hidden="true" />
              Capstone project — Batangas State University, Lipa Campus
            </div>
          </div>

          <aside className="hero-card" aria-label="Sample pet record">
            <div className="hero-card-head">
              <span className="hero-card-title">Pet Record · #LPA-00421</span>
              <span className="pill">Active</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Owner</span>
              <span className="value">J. Reyes</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Pet</span>
              <span className="value">Mango · Aspin · 3 yrs</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Last vaccine</span>
              <span className="value"><span className="tick" aria-hidden="true" />Anti-rabies</span>
            </div>
            <div className="hero-card-row">
              <span className="label">Next due</span>
              <span className="value">May 12, 2027</span>
            </div>
          </aside>
        </div>
      </section>

      <section id="features" className="section">
        <div className="section-head">
          <h2>Built around three goals</h2>
          <p>
            Comprehensive records, streamlined field operations, and the
            analytics the office needs to plan ahead.
          </p>
        </div>
        <div className="features">
          <article className="feature">
            <div className="icon" aria-hidden="true">01</div>
            <h3>Hybrid digital records</h3>
            <p>
              Comprehensive vaccination histories per registered pet, with
              role-based access so owners only see their own animals.
            </p>
          </article>
          <article className="feature">
            <div className="icon" aria-hidden="true">02</div>
            <h3>Field-ready &amp; offline</h3>
            <p>
              Encode vaccinations during field drives without internet, then
              sync to the central server when connectivity returns.
            </p>
          </article>
          <article className="feature">
            <div className="icon" aria-hidden="true">03</div>
            <h3>Coverage analytics</h3>
            <p>
              Interactive dashboards and area clustering surface trends in
              vaccination coverage to guide planning and outreach.
            </p>
          </article>
        </div>
      </section>

      <section className="disclaimer" id="about">
        <div className="disclaimer-inner">
          <div className="disclaimer-icon" aria-hidden="true">!</div>
          <p>
            <strong>Unofficial system.</strong> DIGIVET is an academic capstone
            project developed for the Lipa City Veterinary Office and is{' '}
            <em>not</em> an official product of the Lipa City Local Government
            Unit. Data, branding, and functionality are subject to change as
            the project evolves.
          </p>
        </div>
      </section>

      <footer className="footer" id="contact">
        <div className="footer-inner">
          <div className="brand" aria-label="DIGIVET">
            <span className="brand-mark" aria-hidden="true">DV</span>
            <span className="brand-name">DIGIVET</span>
            <span className="badge-unofficial" style={{ marginLeft: 8 }}>
              Unofficial
            </span>
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
