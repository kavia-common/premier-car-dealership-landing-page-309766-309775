const API_BASE =
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_BACKEND_URL ||
  "";

/**
 * Returns true if we have a configured backend URL.
 * This is used to decide whether to call network endpoints or use mock fallback data.
 */
function hasApiBase() {
  return typeof API_BASE === "string" && API_BASE.trim().length > 0;
}

function joinUrl(base, path) {
  const trimmedBase = (base || "").replace(/\/+$/, "");
  const trimmedPath = (path || "").replace(/^\/+/, "");
  if (!trimmedBase) return `/${trimmedPath}`;
  return `${trimmedBase}/${trimmedPath}`;
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestJson(path, options = {}) {
  const url = hasApiBase() ? joinUrl(API_BASE, path) : path;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await safeJson(res);
    const err = new Error(
      body?.message ||
        body?.error ||
        `Request failed (${res.status} ${res.statusText})`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return safeJson(res);
}

function getMockInventory() {
  return [
    {
      id: "car-001",
      title: "2022 Honda Accord EX",
      price: 26995,
      year: 2022,
      make: "Honda",
      model: "Accord",
      body: "Sedan",
      mileage: 22110,
      fuel: "Gas",
      transmission: "Automatic",
      drivetrain: "FWD",
      color: "Platinum White",
      imageUrl: null,
      highlights: ["Clean CARFAX", "Adaptive Cruise", "Apple CarPlay"],
      description:
        "A comfortable, efficient midsize sedan with modern safety features and a refined interior.",
    },
    {
      id: "car-002",
      title: "2021 Toyota RAV4 XLE",
      price: 28950,
      year: 2021,
      make: "Toyota",
      model: "RAV4",
      body: "SUV",
      mileage: 28405,
      fuel: "Gas",
      transmission: "Automatic",
      drivetrain: "AWD",
      color: "Magnetic Gray",
      imageUrl: null,
      highlights: ["AWD", "Heated Seats", "Lane Assist"],
      description:
        "Versatile compact SUV with excellent reliability and everyday practicality.",
    },
    {
      id: "car-003",
      title: "2020 Tesla Model 3 Standard Range Plus",
      price: 30990,
      year: 2020,
      make: "Tesla",
      model: "Model 3",
      body: "Sedan",
      mileage: 19820,
      fuel: "Electric",
      transmission: "Single-speed",
      drivetrain: "RWD",
      color: "Red Multi-Coat",
      imageUrl: null,
      highlights: ["Autopilot", "Fast Charging", "Premium Audio"],
      description:
        "All-electric sedan with instant torque, a minimalist cabin, and strong safety ratings.",
    },
    {
      id: "car-004",
      title: "2023 Ford F-150 XLT",
      price: 41995,
      year: 2023,
      make: "Ford",
      model: "F-150",
      body: "Truck",
      mileage: 12050,
      fuel: "Gas",
      transmission: "Automatic",
      drivetrain: "4WD",
      color: "Iconic Silver",
      imageUrl: null,
      highlights: ["4WD", "Tow Package", "Remote Start"],
      description:
        "America’s favorite pickup with power, tech, and comfort for work or weekend adventures.",
    },
    {
      id: "car-005",
      title: "2022 BMW X3 xDrive30i",
      price: 39950,
      year: 2022,
      make: "BMW",
      model: "X3",
      body: "SUV",
      mileage: 16490,
      fuel: "Gas",
      transmission: "Automatic",
      drivetrain: "AWD",
      color: "Alpine White",
      imageUrl: null,
      highlights: ["Luxury Package", "Panoramic Roof", "AWD"],
      description:
        "Premium compact SUV with sporty handling and a high-quality, tech-forward cabin.",
    },
    {
      id: "car-006",
      title: "2021 Mazda CX-5 Touring",
      price: 24995,
      year: 2021,
      make: "Mazda",
      model: "CX-5",
      body: "SUV",
      mileage: 26340,
      fuel: "Gas",
      transmission: "Automatic",
      drivetrain: "AWD",
      color: "Deep Crystal Blue",
      imageUrl: null,
      highlights: ["AWD", "Blind Spot Monitor", "Great Condition"],
      description:
        "A stylish SUV known for agile driving dynamics and an upscale interior feel.",
    },
  ];
}

// PUBLIC_INTERFACE
export async function fetchInventory() {
  /** Fetch inventory list from configurable endpoint or return mock inventory when absent/unavailable. */
  if (!hasApiBase()) return { source: "mock", items: getMockInventory() };

  // Keep backend specifics configurable: try a few conventional paths; fallback to mock if not found.
  const candidates = ["/api/inventory", "/inventory", "/api/cars", "/cars"];
  let lastErr = null;

  for (const path of candidates) {
    try {
      const data = await requestJson(path, { method: "GET" });

      // Allow backend to return either array or {items: []}
      const items = Array.isArray(data) ? data : data?.items;
      if (Array.isArray(items)) return { source: "api", items };
    } catch (e) {
      lastErr = e;
      // If server returns 404 for one candidate, try the next candidate.
      // For other errors, still try the next to remain resilient.
    }
  }

  // Soft fallback to mock on error (as requested).
  return {
    source: "mock",
    items: getMockInventory(),
    warning:
      lastErr?.message ||
      "Backend inventory endpoint unavailable; using mock inventory.",
  };
}

// PUBLIC_INTERFACE
export async function submitLead(payload) {
  /** Submit a lead/contact payload to a configurable endpoint; throws on network errors. */
  if (!hasApiBase()) {
    // Simulate network latency.
    await new Promise((r) => setTimeout(r, 650));
    return { ok: true, source: "mock" };
  }

  const candidates = ["/api/leads", "/leads", "/api/contact", "/contact"];
  let lastErr = null;

  for (const path of candidates) {
    try {
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return { ok: true, source: "api", data };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Lead submission failed.");
}

// PUBLIC_INTERFACE
export async function submitGatedResourceRequest(payload) {
  /** Submit a gated resource request to a configurable endpoint; returns download link if provided. */
  if (!hasApiBase()) {
    await new Promise((r) => setTimeout(r, 650));
    return {
      ok: true,
      source: "mock",
      downloadUrl: null,
      message:
        "Thanks! We’ll email the resource shortly. (Mock mode: no email sent.)",
    };
  }

  const candidates = [
    "/api/resources/request",
    "/resources/request",
    "/api/resources",
    "/resources",
  ];
  let lastErr = null;

  for (const path of candidates) {
    try {
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return { ok: true, source: "api", ...(data || {}) };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Resource request failed.");
}

// PUBLIC_INTERFACE
export function getApiConfig() {
  /** Return the currently configured API base URL (if any). */
  return { apiBase: API_BASE || "" };
}
