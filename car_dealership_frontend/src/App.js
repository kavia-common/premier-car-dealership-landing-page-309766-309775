import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import logo from "./logo.svg";
import Modal from "./components/Modal";
import {
  fetchInventory,
  getApiConfig,
  submitGatedResourceRequest,
  submitLead,
} from "./services/api";
import {
  validateEmail,
  validateMinLen,
  validatePhoneOptional,
  validateRequired,
} from "./utils/validation";
import {
  getLeadSubmissionCooldownRemainingMs,
  markLeadSubmitted,
} from "./utils/leadThrottle";

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

function normalizeStr(v) {
  return (v || "").toString().trim().toLowerCase();
}

function getUniqueValues(items, key) {
  const set = new Set();
  for (const it of items) {
    const v = it?.[key];
    if (typeof v === "string" && v.trim()) set.add(v.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Account for sticky header height
  const y = el.getBoundingClientRect().top + window.scrollY - 78;
  window.scrollTo({ top: y, behavior: "smooth" });
}

/**
 * Lightweight SPA landing page for a dealership. Implements:
 * - Sticky header with in-page navigation
 * - Hero with CTAs
 * - Inventory grid with filters and View Details modal
 * - Dealership highlights
 * - Resources section with gated modal
 * - Contact / lead form with inline validation, success/error states, and duplicate submission prevention
 */
// PUBLIC_INTERFACE
export default function App() {
  /** Main single-page application component. */
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const [inventoryState, setInventoryState] = useState({
    loading: true,
    source: "unknown",
    warning: "",
    error: "",
    items: [],
  });

  const [filters, setFilters] = useState({
    query: "",
    make: "All",
    body: "All",
    maxPrice: "Any",
  });

  const [selectedCar, setSelectedCar] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState({
    id: "resource-01",
    title: "Buyer’s Guide: How to Choose Your Next Vehicle",
    description:
      "A quick, practical guide you can skim in minutes—then dive deeper when you’re ready.",
  });

  const [resourceForm, setResourceForm] = useState({
    name: "",
    email: "",
    dealership: "",
  });
  const [resourceErrors, setResourceErrors] = useState({});
  const [resourceSubmitState, setResourceSubmitState] = useState({
    status: "idle", // idle | submitting | success | error
    message: "",
    downloadUrl: "",
  });

  const [leadForm, setLeadForm] = useState({
    name: "",
    dealership: "",
    title: "",
    email: "",
    phone: "",
    message: "",
    interest: "Request a Demo",
  });

  const [leadErrors, setLeadErrors] = useState({});
  const [leadSubmitState, setLeadSubmitState] = useState({
    status: "idle", // idle | blocked | submitting | success | error
    message: "",
  });

  const leadFormRef = useRef(null);
  const contactSectionRef = useRef(null);

  const apiConfig = useMemo(() => getApiConfig(), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setInventoryState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const res = await fetchInventory();
        if (cancelled) return;
        setInventoryState({
          loading: false,
          source: res.source,
          warning: res.warning || "",
          error: "",
          items: res.items || [],
        });
      } catch (e) {
        if (cancelled) return;
        setInventoryState({
          loading: false,
          source: "unknown",
          warning: "",
          error: e?.message || "Failed to load inventory.",
          items: [],
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lead form duplicate submission prevention (24h) per requirements
  useEffect(() => {
    const remaining = getLeadSubmissionCooldownRemainingMs();
    if (remaining > 0) {
      setLeadSubmitState({
        status: "blocked",
        message:
          "Thank you — your request has already been submitted recently. Please check your email, or contact us directly if you need help sooner.",
      });
    }
  }, []);

  const makes = useMemo(
    () => ["All", ...getUniqueValues(inventoryState.items, "make")],
    [inventoryState.items]
  );
  const bodies = useMemo(
    () => ["All", ...getUniqueValues(inventoryState.items, "body")],
    [inventoryState.items]
  );

  const filteredInventory = useMemo(() => {
    const q = normalizeStr(filters.query);
    const max =
      filters.maxPrice === "Any" ? Infinity : Number(filters.maxPrice);

    return (inventoryState.items || []).filter((car) => {
      const makeOk = filters.make === "All" || car?.make === filters.make;
      const bodyOk = filters.body === "All" || car?.body === filters.body;

      const priceNum = Number(car?.price);
      const priceOk = !Number.isFinite(max) ? true : (priceNum || 0) <= max;

      const haystack = normalizeStr(
        `${car?.title || ""} ${car?.make || ""} ${car?.model || ""} ${car?.body || ""} ${car?.year || ""}`
      );
      const qOk = !q || haystack.includes(q);

      return makeOk && bodyOk && priceOk && qOk;
    });
  }, [filters, inventoryState.items]);

  function openDetails(car) {
    setSelectedCar(car);
    setDetailsModalOpen(true);
  }

  function closeDetails() {
    setDetailsModalOpen(false);
    setSelectedCar(null);
  }

  function openResourceModal(resource) {
    setSelectedResource(resource);
    setResourceForm({ name: "", email: "", dealership: "" });
    setResourceErrors({});
    setResourceSubmitState({ status: "idle", message: "", downloadUrl: "" });
    setResourceModalOpen(true);
  }

  function validateResourceForm(values) {
    const errs = {};
    const nameErr = validateRequired(values.name);
    if (nameErr) errs.name = nameErr;
    const emailErr = validateEmail(values.email);
    if (emailErr) errs.email = emailErr;
    const dealerErr = validateRequired(values.dealership);
    if (dealerErr) errs.dealership = dealerErr;
    return errs;
  }

  function validateLeadForm(values) {
    const errs = {};
    const nameErr = validateRequired(values.name);
    if (nameErr) errs.name = nameErr;

    const dealerErr = validateRequired(values.dealership);
    if (dealerErr) errs.dealership = dealerErr;

    const titleErr = validateRequired(values.title);
    if (titleErr) errs.title = titleErr;

    const emailErr = validateEmail(values.email);
    if (emailErr) errs.email = emailErr;

    const phoneErr = validatePhoneOptional(values.phone);
    if (phoneErr) errs.phone = phoneErr;

    // Message optional, but if present enforce minimal clarity.
    const msg = (values.message || "").trim();
    if (msg) {
      const msgErr = validateMinLen(msg, 10, "Message");
      if (msgErr) errs.message = msgErr;
    }

    return errs;
  }

  async function handleResourceSubmit(e) {
    e.preventDefault();
    if (resourceSubmitState.status === "submitting") return;

    const errs = validateResourceForm(resourceForm);
    setResourceErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setResourceSubmitState({ status: "submitting", message: "", downloadUrl: "" });
    try {
      const res = await submitGatedResourceRequest({
        ...resourceForm,
        resourceId: selectedResource?.id,
      });

      setResourceSubmitState({
        status: "success",
        message:
          res?.message ||
          "Thanks! Your download is ready below (and we’ll also email it to you).",
        downloadUrl: res?.downloadUrl || "",
      });
    } catch (err) {
      setResourceSubmitState({
        status: "error",
        message:
          err?.message ||
          "We couldn’t send the resource request. Please try again or contact us directly.",
        downloadUrl: "",
      });
    }
  }

  async function handleLeadSubmit(e) {
    e.preventDefault();

    const remaining = getLeadSubmissionCooldownRemainingMs();
    if (remaining > 0) {
      setLeadSubmitState({
        status: "blocked",
        message:
          "Thank you — your request has already been submitted recently. Please check your email, or contact us directly if you need help sooner.",
      });
      return;
    }

    if (leadSubmitState.status === "submitting") return;

    const errs = validateLeadForm(leadForm);
    setLeadErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLeadSubmitState({ status: "submitting", message: "" });
    try {
      await submitLead({
        ...leadForm,
        source: "landing_page",
        createdAt: new Date().toISOString(),
      });

      markLeadSubmitted();
      setLeadSubmitState({
        status: "success",
        message:
          "Thank you — your request has been submitted. We’ll reach out within 1 business day.",
      });
    } catch (err) {
      setLeadSubmitState({
        status: "error",
        message:
          err?.message ||
          "Submission failed. Please try again, or reach out via phone/email below.",
      });
    }
  }

  function handleCtaPrimary() {
    // Highest priority use case: Request demo / consultation -> take user to form
    scrollToId("contact");
    setTimeout(() => {
      leadFormRef.current?.querySelector('input[name="name"]')?.focus?.();
    }, 250);
  }

  function handleCtaSecondary() {
    scrollToId("resources");
  }

  function NavLinks({ onNavigate }) {
    return (
      <>
        <a href="#inventory" onClick={onNavigate}>
          Inventory
        </a>
        <a href="#highlights" onClick={onNavigate}>
          Highlights
        </a>
        <a href="#resources" onClick={onNavigate}>
          Resources
        </a>
        <a href="#contact" onClick={onNavigate}>
          Contact
        </a>
      </>
    );
  }

  return (
    <div>
      <a className="skipLink" href="#main">
        Skip to content
      </a>

      <header className="header" aria-label="Primary">
        <div className="container headerInner">
          <a
            className="brand"
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setIsMobileNavOpen(false);
              scrollToId("top");
            }}
            aria-label="Premier Auto. Go to top."
          >
            <div className="brandMark" aria-hidden="true">
              <img
                src={logo}
                alt=""
                width="22"
                height="22"
                style={{ opacity: 0.8 }}
              />
            </div>
            <div className="brandTitle">
              <strong>Premier Auto</strong>
              <span>Modern inventory. Real support.</span>
            </div>
          </a>

          <nav className="nav" aria-label="In-page navigation">
            <NavLinks
              onNavigate={(e) => {
                // allow default jump, but close mobile if any
                setIsMobileNavOpen(false);
              }}
            />
          </nav>

          <div className="headerActions">
            <button
              type="button"
              className="mobileNavToggle"
              aria-label={isMobileNavOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileNavOpen}
              onClick={() => setIsMobileNavOpen((v) => !v)}
            >
              Menu
            </button>

            <button
              type="button"
              className="btn btnPrimary smallBtn"
              onClick={handleCtaPrimary}
              aria-label="Request a demo"
            >
              Request a Demo
            </button>
          </div>
        </div>
      </header>

      {isMobileNavOpen ? (
        <div className="container" style={{ paddingTop: 10 }}>
          <div className="panel" aria-label="Mobile menu">
            <div className="pillRow" style={{ justifyContent: "center" }}>
              <NavLinks
                onNavigate={(e) => {
                  setIsMobileNavOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <main id="main">
        <section id="top" className="hero" aria-label="Hero">
          <div className="heroBg" aria-hidden="true" />
          <div className="container heroGrid">
            <div className="heroCard">
              <span className="badge">Trusted by local drivers & families</span>
              <h1 className="heroTitle">
                Find your next car — fast, transparent, and stress-free.
              </h1>
              <p className="heroLead">
                Browse curated inventory, compare specs, and reach a real person
                when you’re ready. No pressure — just clarity.
              </p>

              <div className="buttonRow" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => scrollToId("inventory")}
                  aria-label="Browse inventory"
                >
                  Browse Inventory
                </button>
                <button
                  type="button"
                  className="btn btnSecondary"
                  onClick={handleCtaPrimary}
                  aria-label="Book a free consultation"
                >
                  Book Free Consultation
                </button>
                <button
                  type="button"
                  className="btn btnGhost"
                  onClick={handleCtaSecondary}
                  aria-label="Download buyer resources"
                >
                  Download Buyer Guide
                </button>
              </div>

              <div className="heroKpis" aria-label="Key benefits">
                <div className="kpi">
                  <strong>Upfront pricing</strong>
                  <span>No hidden fees, no surprises</span>
                </div>
                <div className="kpi">
                  <strong>Easy financing</strong>
                  <span>Options for every budget</span>
                </div>
                <div className="kpi">
                  <strong>Trade-in support</strong>
                  <span>Get an estimate in minutes</span>
                </div>
              </div>

              <div className="hr" />

              <p className="hint">
                {apiConfig?.apiBase
                  ? `Live mode: API base configured (${apiConfig.apiBase}).`
                  : "Mock mode: no API base configured; using fallback inventory."}
              </p>
            </div>

            <aside className="heroAside" aria-label="Quick actions">
              <h2 className="asideTitle">Popular actions</h2>

              <div className="asideBox">
                <strong>Book a Test Drive</strong>
                <p>
                  Tell us what you’re considering, and we’ll confirm your time
                  within one business day.
                </p>
                <div className="buttonRow" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btnPrimary smallBtn"
                    onClick={handleCtaPrimary}
                  >
                    Request a Demo
                  </button>
                  <button
                    type="button"
                    className="btn btnGhost smallBtn"
                    onClick={() => scrollToId("contact")}
                  >
                    Contact Sales
                  </button>
                </div>
              </div>

              <div className="asideBox">
                <strong>Customer Reviews</strong>
                <p>
                  “Quick process, clear options, and the car was exactly as
                  described.”
                </p>
                <div className="pillRow" style={{ marginTop: 10 }}>
                  <span className="pill">
                    <strong>4.8/5</strong> rating
                  </span>
                  <span className="pill">
                    <strong>Same‑day</strong> pickup
                  </span>
                </div>
              </div>

              <div className="asideBox">
                <strong>Need help choosing?</strong>
                <p>
                  We’ll match you to options by budget, body type, and must-have
                  features.
                </p>
                <button
                  type="button"
                  className="btn btnSecondary smallBtn"
                  onClick={() => scrollToId("inventory")}
                >
                  Filter Inventory
                </button>
              </div>
            </aside>
          </div>
        </section>

        <section id="inventory" className="section" aria-label="Featured inventory">
          <div className="container">
            <div className="sectionHeader">
              <div>
                <h2 className="sectionTitle">Featured Inventory</h2>
                <p className="sectionSubtitle">
                  Filter by make, body style, and price — then open details for a
                  fast comparison.
                </p>
              </div>
              <div className="pillRow" aria-label="Inventory status">
                <span className="pill">
                  <strong>{filteredInventory.length}</strong> results
                </span>
                <span className="pill">
                  Source: <strong>{inventoryState.source}</strong>
                </span>
              </div>
            </div>

            <div className="panel">
              {inventoryState.warning ? (
                <div className="alert" role="status" style={{ marginBottom: 12 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    Notice
                  </strong>
                  <span className="hint">{inventoryState.warning}</span>
                </div>
              ) : null}

              {inventoryState.error ? (
                <div className="alert alertError" role="alert" style={{ marginBottom: 12 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    Inventory unavailable
                  </strong>
                  <span className="hint">{inventoryState.error}</span>
                </div>
              ) : null}

              <div className="filters" aria-label="Inventory filters">
                <div className="field">
                  <div className="labelRow">
                    <label className="label" htmlFor="invQuery">
                      Search
                    </label>
                    <span className="hint">e.g., SUV, 2022, Honda</span>
                  </div>
                  <input
                    id="invQuery"
                    className="input"
                    value={filters.query}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, query: e.target.value }))
                    }
                    placeholder="Search make, model, year..."
                    aria-label="Search inventory"
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="invMake">
                    Make
                  </label>
                  <select
                    id="invMake"
                    className="select"
                    value={filters.make}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, make: e.target.value }))
                    }
                    aria-label="Filter by make"
                  >
                    {makes.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label" htmlFor="invBody">
                    Body
                  </label>
                  <select
                    id="invBody"
                    className="select"
                    value={filters.body}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, body: e.target.value }))
                    }
                    aria-label="Filter by body style"
                  >
                    {bodies.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label" htmlFor="invPrice">
                    Max Price
                  </label>
                  <select
                    id="invPrice"
                    className="select"
                    value={filters.maxPrice}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, maxPrice: e.target.value }))
                    }
                    aria-label="Filter by maximum price"
                  >
                    <option value="Any">Any</option>
                    <option value="25000">$25,000</option>
                    <option value="30000">$30,000</option>
                    <option value="40000">$40,000</option>
                    <option value="50000">$50,000</option>
                  </select>
                </div>
              </div>

              <div className="inventoryMetaRow">
                <div className="pillRow" aria-label="Applied filters">
                  <span className="pill">
                    Make: <strong>{filters.make}</strong>
                  </span>
                  <span className="pill">
                    Body: <strong>{filters.body}</strong>
                  </span>
                  <span className="pill">
                    Max: <strong>{filters.maxPrice === "Any" ? "Any" : formatCurrency(filters.maxPrice)}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btnGhost smallBtn"
                  onClick={() =>
                    setFilters({ query: "", make: "All", body: "All", maxPrice: "Any" })
                  }
                >
                  Clear filters
                </button>
              </div>

              {inventoryState.loading ? (
                <div className="alert" role="status" aria-live="polite">
                  Loading inventory…
                </div>
              ) : null}

              {!inventoryState.loading && filteredInventory.length === 0 ? (
                <div className="alert" role="status" aria-live="polite">
                  <strong style={{ display: "block", marginBottom: 6 }}>
                    No matches
                  </strong>
                  <span className="hint">
                    Try clearing filters or searching by a different keyword.
                  </span>
                </div>
              ) : null}

              <div className="grid" role="list" aria-label="Inventory results">
                {filteredInventory.map((car) => (
                  <div className="card" role="listitem" key={car?.id || car?.title}>
                    <div className="cardImage" aria-label="Vehicle image placeholder">
                      {car?.make ? car.make : "Vehicle"}
                    </div>

                    <div className="cardTop">
                      <div>
                        <div className="cardTitle">{car?.title || "Vehicle"}</div>
                        <div className="cardMeta" aria-label="Vehicle attributes">
                          <span>{car?.year || "—"}</span>
                          <span>{car?.body || "—"}</span>
                          <span>{car?.drivetrain || "—"}</span>
                        </div>
                      </div>
                      <div className="cardPrice">{formatCurrency(car?.price)}</div>
                    </div>

                    <div className="cardMeta">
                      <span>{Number.isFinite(Number(car?.mileage)) ? `${Number(car.mileage).toLocaleString()} mi` : "—"}</span>
                      <span>{car?.fuel || "—"}</span>
                      <span>{car?.transmission || "—"}</span>
                    </div>

                    <div className="cardActions">
                      <button
                        type="button"
                        className="btn btnPrimary smallBtn"
                        onClick={() => openDetails(car)}
                        aria-label={`View details for ${car?.title || "vehicle"}`}
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        className="btn btnGhost smallBtn"
                        onClick={() => {
                          setLeadForm((f) => ({
                            ...f,
                            interest: "Book a Test Drive",
                            message: `I'm interested in ${car?.title || "a vehicle"}.\nPreferred time window: `,
                          }));
                          scrollToId("contact");
                          setTimeout(() => {
                            leadFormRef.current
                              ?.querySelector('textarea[name="message"]')
                              ?.focus?.();
                          }, 250);
                        }}
                        aria-label={`Contact about ${car?.title || "vehicle"}`}
                      >
                        Inquire
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="highlights" className="section" aria-label="Dealership highlights">
          <div className="container">
            <div className="sectionHeader">
              <div>
                <h2 className="sectionTitle">Why Premier Auto</h2>
                <p className="sectionSubtitle">
                  Dealership-centric support: financing, warranty options, and trade-in
                  guidance—designed to keep your buying experience simple.
                </p>
              </div>
            </div>

            <div className="highlightsGrid">
              <div className="highlightCard">
                <div className="highlightIcon" aria-hidden="true">
                  $
                </div>
                <h3>Flexible financing</h3>
                <p>
                  Clear options with competitive rates. We’ll walk you through the best fit
                  based on budget, term, and usage.
                </p>
              </div>

              <div className="highlightCard">
                <div className="highlightIcon" aria-hidden="true">
                  ✓
                </div>
                <h3>Warranty & protection</h3>
                <p>
                  Add coverage that makes sense for your ownership plan—short-term peace of
                  mind or long-haul protection.
                </p>
              </div>

              <div className="highlightCard">
                <div className="highlightIcon" aria-hidden="true">
                  ⇄
                </div>
                <h3>Trade-in support</h3>
                <p>
                  Get a quick estimate and transparent process. We help you understand how
                  trade-in impacts your final monthly payment.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="resources" className="section" aria-label="Resources">
          <div className="container">
            <div className="sectionHeader">
              <div>
                <h2 className="sectionTitle">Resources</h2>
                <p className="sectionSubtitle">
                  Prefer to research first? Download concise guides and checklists.
                  Resources are gated to deliver by email.
                </p>
              </div>
            </div>

            <div className="resourceGrid">
              <div className="resourceCard">
                <h3>Buyer’s Guide (Gated)</h3>
                <p>
                  A fast checklist for comparing makes/models, spotting hidden costs, and
                  narrowing your shortlist.
                </p>
                <ul className="resourceList">
                  <li>What to verify before you visit</li>
                  <li>Questions to ask on a test drive</li>
                  <li>How to compare financing offers</li>
                </ul>
                <div className="buttonRow" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={() =>
                      openResourceModal({
                        id: "buyers-guide",
                        title: "Buyer’s Guide: Compare Confidently",
                        description:
                          "A short checklist for narrowing options and avoiding surprises.",
                      })
                    }
                  >
                    Download Guide
                  </button>
                  <button
                    type="button"
                    className="btn btnGhost"
                    onClick={() =>
                      openResourceModal({
                        id: "trade-in-checklist",
                        title: "Trade‑in Checklist: Maximize Value",
                        description:
                          "Simple steps to prepare your trade-in and understand valuation.",
                      })
                    }
                  >
                    Trade‑in Checklist
                  </button>
                </div>
              </div>

              <div className="resourceCard">
                <h3>Pricing overview</h3>
                <p>
                  We keep things simple. Explore vehicles in your range and talk to us for
                  tailored financing options.
                </p>
                <div className="pillRow" style={{ marginTop: 12 }}>
                  <span className="pill">
                    <strong>Basic</strong> $20–30k
                  </span>
                  <span className="pill">
                    <strong>Pro</strong> $30–40k
                  </span>
                  <span className="pill">
                    <strong>Premium</strong> $40k+
                  </span>
                </div>
                <div className="buttonRow" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btnSecondary"
                    onClick={() => scrollToId("inventory")}
                  >
                    Explore Inventory
                  </button>
                  <button
                    type="button"
                    className="btn btnGhost"
                    onClick={handleCtaPrimary}
                  >
                    Contact Sales
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="contact"
          className="section"
          aria-label="Contact and lead form"
          ref={contactSectionRef}
        >
          <div className="container">
            <div className="sectionHeader">
              <div>
                <h2 className="sectionTitle">Contact Us</h2>
                <p className="sectionSubtitle">
                  Request a demo/consultation, book a test drive, or ask a question.
                  We’ll respond within 1 business day.
                </p>
              </div>
              <div className="pillRow">
                <span className="pill">
                  Phone: <strong>(555) 010‑2020</strong>
                </span>
                <span className="pill">
                  Email: <strong>sales@premierauto.example</strong>
                </span>
              </div>
            </div>

            <div className="panel">
              {leadSubmitState.status === "success" ? (
                <div className="alert alertSuccess" role="status" aria-live="polite">
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    Request received
                  </strong>
                  <span className="hint">{leadSubmitState.message}</span>
                </div>
              ) : null}

              {leadSubmitState.status === "blocked" ? (
                <div className="alert" role="status" aria-live="polite">
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    Already submitted
                  </strong>
                  <span className="hint">{leadSubmitState.message}</span>
                </div>
              ) : null}

              {leadSubmitState.status === "error" ? (
                <div className="alert alertError" role="alert" aria-live="assertive">
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    Submission error
                  </strong>
                  <span className="hint">{leadSubmitState.message}</span>
                </div>
              ) : null}

              <form onSubmit={handleLeadSubmit} ref={leadFormRef} noValidate>
                <div className="formGrid" style={{ marginTop: 12 }}>
                  <div className="field">
                    <label className="label" htmlFor="leadName">
                      Name *
                    </label>
                    <input
                      id="leadName"
                      name="name"
                      className="input"
                      value={leadForm.name}
                      onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))}
                      onBlur={() =>
                        setLeadErrors((errs) => ({
                          ...errs,
                          name: validateRequired(leadForm.name),
                        }))
                      }
                      aria-invalid={Boolean(leadErrors.name)}
                      aria-describedby={leadErrors.name ? "leadNameErr" : undefined}
                      autoComplete="name"
                    />
                    {leadErrors.name ? (
                      <div id="leadNameErr" className="errorText" role="alert">
                        {leadErrors.name}
                      </div>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="leadDealership">
                      Dealership Name *
                    </label>
                    <input
                      id="leadDealership"
                      name="dealership"
                      className="input"
                      value={leadForm.dealership}
                      onChange={(e) =>
                        setLeadForm((f) => ({ ...f, dealership: e.target.value }))
                      }
                      onBlur={() =>
                        setLeadErrors((errs) => ({
                          ...errs,
                          dealership: validateRequired(leadForm.dealership),
                        }))
                      }
                      aria-invalid={Boolean(leadErrors.dealership)}
                      aria-describedby={leadErrors.dealership ? "leadDealErr" : undefined}
                      autoComplete="organization"
                    />
                    {leadErrors.dealership ? (
                      <div id="leadDealErr" className="errorText" role="alert">
                        {leadErrors.dealership}
                      </div>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="leadTitle">
                      Title / Role *
                    </label>
                    <input
                      id="leadTitle"
                      name="title"
                      className="input"
                      value={leadForm.title}
                      onChange={(e) =>
                        setLeadForm((f) => ({ ...f, title: e.target.value }))
                      }
                      onBlur={() =>
                        setLeadErrors((errs) => ({
                          ...errs,
                          title: validateRequired(leadForm.title),
                        }))
                      }
                      aria-invalid={Boolean(leadErrors.title)}
                      aria-describedby={leadErrors.title ? "leadTitleErr" : undefined}
                      placeholder="Owner, GM, Marketing Director..."
                      autoComplete="organization-title"
                    />
                    {leadErrors.title ? (
                      <div id="leadTitleErr" className="errorText" role="alert">
                        {leadErrors.title}
                      </div>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="leadEmail">
                      Email *
                    </label>
                    <input
                      id="leadEmail"
                      name="email"
                      className="input"
                      value={leadForm.email}
                      onChange={(e) =>
                        setLeadForm((f) => ({ ...f, email: e.target.value }))
                      }
                      onBlur={() =>
                        setLeadErrors((errs) => ({
                          ...errs,
                          email: validateEmail(leadForm.email),
                        }))
                      }
                      aria-invalid={Boolean(leadErrors.email)}
                      aria-describedby={leadErrors.email ? "leadEmailErr" : undefined}
                      autoComplete="email"
                      inputMode="email"
                    />
                    {leadErrors.email ? (
                      <div id="leadEmailErr" className="errorText" role="alert">
                        {leadErrors.email}
                      </div>
                    ) : null}
                  </div>

                  <div className="field">
                    <div className="labelRow">
                      <label className="label" htmlFor="leadPhone">
                        Phone
                      </label>
                      <span className="hint">Optional</span>
                    </div>
                    <input
                      id="leadPhone"
                      name="phone"
                      className="input"
                      value={leadForm.phone}
                      onChange={(e) =>
                        setLeadForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      onBlur={() =>
                        setLeadErrors((errs) => ({
                          ...errs,
                          phone: validatePhoneOptional(leadForm.phone),
                        }))
                      }
                      aria-invalid={Boolean(leadErrors.phone)}
                      aria-describedby={leadErrors.phone ? "leadPhoneErr" : undefined}
                      autoComplete="tel"
                      inputMode="tel"
                    />
                    {leadErrors.phone ? (
                      <div id="leadPhoneErr" className="errorText" role="alert">
                        {leadErrors.phone}
                      </div>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="leadInterest">
                      I’m interested in
                    </label>
                    <select
                      id="leadInterest"
                      name="interest"
                      className="select"
                      value={leadForm.interest}
                      onChange={(e) =>
                        setLeadForm((f) => ({ ...f, interest: e.target.value }))
                      }
                      aria-label="Interest type"
                    >
                      <option>Request a Demo</option>
                      <option>Book a Test Drive</option>
                      <option>Financing Options</option>
                      <option>Trade‑in Estimate</option>
                      <option>General Question</option>
                    </select>
                  </div>

                  <div className="field formFull">
                    <div className="labelRow">
                      <label className="label" htmlFor="leadMessage">
                        Message
                      </label>
                      <span className="hint">Optional (min 10 chars if provided)</span>
                    </div>
                    <textarea
                      id="leadMessage"
                      name="message"
                      className="textarea"
                      value={leadForm.message}
                      onChange={(e) =>
                        setLeadForm((f) => ({ ...f, message: e.target.value }))
                      }
                      onBlur={() =>
                        setLeadErrors((errs) => ({
                          ...errs,
                          message: leadForm.message.trim()
                            ? validateMinLen(leadForm.message, 10, "Message")
                            : "",
                        }))
                      }
                      aria-invalid={Boolean(leadErrors.message)}
                      aria-describedby={leadErrors.message ? "leadMsgErr" : undefined}
                      placeholder="Tell us what you’re looking for (budget, body style, must-haves)…"
                    />
                    {leadErrors.message ? (
                      <div id="leadMsgErr" className="errorText" role="alert">
                        {leadErrors.message}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="buttonRow" style={{ marginTop: 14 }}>
                  <button
                    type="submit"
                    className="btn btnPrimary"
                    disabled={
                      leadSubmitState.status === "submitting" ||
                      leadSubmitState.status === "blocked"
                    }
                    aria-label="Submit contact request"
                  >
                    {leadSubmitState.status === "submitting"
                      ? "Submitting…"
                      : "Submit Request"}
                  </button>

                  <button
                    type="button"
                    className="btn btnGhost"
                    onClick={() => {
                      setLeadForm({
                        name: "",
                        dealership: "",
                        title: "",
                        email: "",
                        phone: "",
                        message: "",
                        interest: "Request a Demo",
                      });
                      setLeadErrors({});
                      setLeadSubmitState({ status: "idle", message: "" });
                    }}
                    disabled={leadSubmitState.status === "submitting"}
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    className="btn btnSecondary"
                    onClick={() => scrollToId("inventory")}
                  >
                    Keep Browsing
                  </button>
                </div>

                <p className="hint" style={{ marginTop: 12 }}>
                  We prioritize accessibility and privacy. If this form is unavailable,
                  contact us at <strong>sales@premierauto.example</strong>.
                </p>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer" aria-label="Footer">
        <div className="container footerGrid">
          <div>
            <div className="brand" aria-label="Premier Auto">
              <div className="brandMark" aria-hidden="true">
                <img
                  src={logo}
                  alt=""
                  width="22"
                  height="22"
                  style={{ opacity: 0.8 }}
                />
              </div>
              <div className="brandTitle">
                <strong>Premier Auto</strong>
                <span>Transparent pricing & real support</span>
              </div>
            </div>
            <p className="footerSmall">
              Headquarters: 123 Market Street, Suite 200, Example City, ST 00000
              (for mailing and support). Service availability may vary by region.
            </p>
            <p className="footerSmall">
              © {new Date().getFullYear()} Premier Auto. All rights reserved.
            </p>
          </div>

          <div>
            <div className="miniLinks" aria-label="Footer links">
              <a href="#inventory">Inventory</a>
              <a href="#highlights">Highlights</a>
              <a href="#resources">Resources</a>
              <a href="#contact">Contact</a>
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
              <strong style={{ display: "block", marginBottom: 6 }}>
                Quick contact
              </strong>
              <p className="hint">
                Phone: (555) 010‑2020 <br />
                Email: sales@premierauto.example
              </p>
            </div>
          </div>
        </div>
      </footer>

      <Modal
        isOpen={detailsModalOpen}
        title={selectedCar?.title || "Vehicle details"}
        description="Compare key specs and take the next step when ready."
        onClose={closeDetails}
        initialFocusSelector='button[data-primary="true"]'
        footer={
          <div className="buttonRow">
            <button
              type="button"
              className="btn btnPrimary"
              data-primary="true"
              onClick={() => {
                closeDetails();
                setLeadForm((f) => ({
                  ...f,
                  interest: "Book a Test Drive",
                  message: `I'm interested in ${selectedCar?.title || "this vehicle"}.\nPreferred time window: `,
                }));
                scrollToId("contact");
              }}
            >
              Book a Test Drive
            </button>
            <button
              type="button"
              className="btn btnGhost"
              onClick={closeDetails}
            >
              Close
            </button>
          </div>
        }
      >
        {selectedCar ? (
          <div className="detailsGrid">
            <div>
              <div className="cardImage" aria-label="Vehicle image placeholder">
                {selectedCar?.make || "Vehicle"}
              </div>
              <div className="hr" />
              <p className="hint">
                {selectedCar?.description ||
                  "Detailed description is not available for this vehicle."}
              </p>
              {Array.isArray(selectedCar?.highlights) && selectedCar.highlights.length ? (
                <>
                  <div className="hr" />
                  <div className="pillRow" aria-label="Highlights">
                    {selectedCar.highlights.slice(0, 6).map((h) => (
                      <span key={h} className="pill">
                        {h}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div>
              <div className="pillRow" style={{ marginBottom: 10 }}>
                <span className="pill">
                  Price: <strong>{formatCurrency(selectedCar?.price)}</strong>
                </span>
                <span className="pill">
                  Year: <strong>{selectedCar?.year || "—"}</strong>
                </span>
              </div>

              <div className="detailsSpecs" aria-label="Vehicle specifications">
                <div className="spec">
                  <span>Make</span>
                  <strong>{selectedCar?.make || "—"}</strong>
                </div>
                <div className="spec">
                  <span>Model</span>
                  <strong>{selectedCar?.model || "—"}</strong>
                </div>
                <div className="spec">
                  <span>Body</span>
                  <strong>{selectedCar?.body || "—"}</strong>
                </div>
                <div className="spec">
                  <span>Drivetrain</span>
                  <strong>{selectedCar?.drivetrain || "—"}</strong>
                </div>
                <div className="spec">
                  <span>Mileage</span>
                  <strong>
                    {Number.isFinite(Number(selectedCar?.mileage))
                      ? `${Number(selectedCar.mileage).toLocaleString()} mi`
                      : "—"}
                  </strong>
                </div>
                <div className="spec">
                  <span>Fuel</span>
                  <strong>{selectedCar?.fuel || "—"}</strong>
                </div>
                <div className="spec">
                  <span>Transmission</span>
                  <strong>{selectedCar?.transmission || "—"}</strong>
                </div>
                <div className="spec">
                  <span>Color</span>
                  <strong>{selectedCar?.color || "—"}</strong>
                </div>
              </div>

              <div className="hr" />

              <div className="alert" role="note">
                <strong style={{ display: "block", marginBottom: 4 }}>
                  Next step
                </strong>
                <span className="hint">
                  Want a payment estimate or trade‑in range? Submit the contact form and
                  we’ll respond within 1 business day.
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={resourceModalOpen}
        title={selectedResource?.title || "Download resource"}
        description={selectedResource?.description || "Fill out the form to access the download."}
        onClose={() => setResourceModalOpen(false)}
        initialFocusSelector='input[name="resourceName"]'
        footer={
          resourceSubmitState.status === "success" ? (
            <div className="buttonRow">
              {resourceSubmitState.downloadUrl ? (
                <a
                  className="btn btnPrimary"
                  href={resourceSubmitState.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open download
                </a>
              ) : (
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => setResourceModalOpen(false)}
                >
                  Done
                </button>
              )}
              <button
                type="button"
                className="btn btnGhost"
                onClick={() => setResourceModalOpen(false)}
              >
                Close
              </button>
            </div>
          ) : (
            <div className="buttonRow">
              <button
                type="submit"
                form="resourceForm"
                className="btn btnPrimary"
                disabled={resourceSubmitState.status === "submitting"}
              >
                {resourceSubmitState.status === "submitting"
                  ? "Submitting…"
                  : "Get the resource"}
              </button>
              <button
                type="button"
                className="btn btnGhost"
                onClick={() => setResourceModalOpen(false)}
                disabled={resourceSubmitState.status === "submitting"}
              >
                Cancel
              </button>
            </div>
          )
        }
      >
        {resourceSubmitState.status === "success" ? (
          <div className="alert alertSuccess" role="status" aria-live="polite">
            <strong style={{ display: "block", marginBottom: 4 }}>
              Request received
            </strong>
            <span className="hint">
              {resourceSubmitState.message ||
                "Thanks! Your resource is ready."}
            </span>
            {!resourceSubmitState.downloadUrl ? (
              <p className="hint" style={{ marginTop: 10 }}>
                If no download link appears, we’ll deliver it via email.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {resourceSubmitState.status === "error" ? (
              <div className="alert alertError" role="alert" aria-live="assertive">
                <strong style={{ display: "block", marginBottom: 4 }}>
                  Couldn’t complete request
                </strong>
                <span className="hint">{resourceSubmitState.message}</span>
              </div>
            ) : null}

            <form id="resourceForm" onSubmit={handleResourceSubmit} noValidate>
              <div className="formGrid">
                <div className="field">
                  <label className="label" htmlFor="resourceName">
                    Name *
                  </label>
                  <input
                    id="resourceName"
                    name="resourceName"
                    className="input"
                    value={resourceForm.name}
                    onChange={(e) =>
                      setResourceForm((f) => ({ ...f, name: e.target.value }))
                    }
                    onBlur={() =>
                      setResourceErrors((errs) => ({
                        ...errs,
                        name: validateRequired(resourceForm.name),
                      }))
                    }
                    aria-invalid={Boolean(resourceErrors.name)}
                    aria-describedby={resourceErrors.name ? "resNameErr" : undefined}
                    autoComplete="name"
                  />
                  {resourceErrors.name ? (
                    <div id="resNameErr" className="errorText" role="alert">
                      {resourceErrors.name}
                    </div>
                  ) : null}
                </div>

                <div className="field">
                  <label className="label" htmlFor="resourceEmail">
                    Email *
                  </label>
                  <input
                    id="resourceEmail"
                    name="resourceEmail"
                    className="input"
                    value={resourceForm.email}
                    onChange={(e) =>
                      setResourceForm((f) => ({ ...f, email: e.target.value }))
                    }
                    onBlur={() =>
                      setResourceErrors((errs) => ({
                        ...errs,
                        email: validateEmail(resourceForm.email),
                      }))
                    }
                    aria-invalid={Boolean(resourceErrors.email)}
                    aria-describedby={resourceErrors.email ? "resEmailErr" : undefined}
                    autoComplete="email"
                    inputMode="email"
                  />
                  {resourceErrors.email ? (
                    <div id="resEmailErr" className="errorText" role="alert">
                      {resourceErrors.email}
                    </div>
                  ) : null}
                </div>

                <div className="field formFull">
                  <label className="label" htmlFor="resourceDealer">
                    Dealership Name *
                  </label>
                  <input
                    id="resourceDealer"
                    name="resourceDealer"
                    className="input"
                    value={resourceForm.dealership}
                    onChange={(e) =>
                      setResourceForm((f) => ({ ...f, dealership: e.target.value }))
                    }
                    onBlur={() =>
                      setResourceErrors((errs) => ({
                        ...errs,
                        dealership: validateRequired(resourceForm.dealership),
                      }))
                    }
                    aria-invalid={Boolean(resourceErrors.dealership)}
                    aria-describedby={
                      resourceErrors.dealership ? "resDealErr" : undefined
                    }
                    autoComplete="organization"
                  />
                  {resourceErrors.dealership ? (
                    <div id="resDealErr" className="errorText" role="alert">
                      {resourceErrors.dealership}
                    </div>
                  ) : null}
                </div>
              </div>

              <p className="hint" style={{ marginTop: 10 }}>
                We use your email to deliver the download link and follow-up details.
              </p>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}
