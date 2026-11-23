
/* =========================================================
   TERRAVITA AQUATWIN — UJANI RESERVOIR
   File: app.js

   Expected project structure:
   /
   ├── index.html
   ├── style.css
   ├── app.js
   └── data/
       ├── water_extent_monthly.csv
       ├── twin_baseline.csv
       ├── study_area.geojson             (optional)
       └── water_extent_polygons.geojson  (optional)
========================================================= */

"use strict";

/* =========================================================
   1. CONFIGURATION
========================================================= */

const CONFIG = {
  waterCSV: "data/water_extent_monthly.csv",
  baselineCSV: "data/twin_baseline.csv",

  studyAreaGeoJSON: "data/study_area.geojson",
  waterPolygonsGeoJSON: "data/water_extent_polygons.geojson",

  reservoir: {
    name: "Ujani Reservoir",
    lat: 18.07,
    lng: 75.11,
    zoom: 10
  },

  colors: {
    teal: "#27d3c2",
    blue: "#43a5f5",
    orange: "#f2a65a",
    purple: "#a78bfa",
    muted: "#94a3b8",
    grid: "rgba(148,163,184,0.13)"
  }
};


/* =========================================================
   2. DOM HELPERS
========================================================= */

const $ = (selector) => document.querySelector(selector);

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setWidth = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.style.width = `${value}%`;
};

function showToast(message) {
  const toast = $("#toast");

  if (!toast) {
    console.info(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function showDataMessage(message) {
  console.warn(message);
  showToast(message);
}


/* =========================================================
   3. DATA NORMALIZATION
========================================================= */

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/()]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "");
}

function getValue(row, aliases) {
  if (!row || typeof row !== "object") return null;

  const normalized = {};

  Object.entries(row).forEach(([key, value]) => {
    normalized[normalizeKey(key)] = value;
  });

  for (const alias of aliases) {
    const key = normalizeKey(alias);

    if (
      Object.prototype.hasOwnProperty.call(normalized, key) &&
      normalized[key] !== "" &&
      normalized[key] !== null &&
      normalized[key] !== undefined
    ) {
      return normalized[key];
    }
  }

  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(String(value).replace(/,/g, "").trim());

  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/^(\d{4})[-/](\d{1,2})$/);

    if (match) {
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        1
      );
    }

    return null;
  }

  return date;
}

function formatMonth(date) {
  if (!date) return "Unknown";

  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric"
  });
}

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  });
}

function validRows(rows) {
  return Array.isArray(rows)
    ? rows.filter(row => row && typeof row === "object")
    : [];
}


/* =========================================================
   4. CSV LOADER
========================================================= */

async function loadCSV(path) {
  if (typeof Papa === "undefined") {
    throw new Error("PapaParse library is not loaded.");
  }

  const response = await fetch(path, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Could not load ${path}. HTTP ${response.status}`
    );
  }

  const csvText = await response.text();

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: header => header.trim()
  });

  if (parsed.errors?.length) {
    console.warn(`CSV warnings for ${path}:`, parsed.errors);
  }

  return validRows(parsed.data);
}


/* =========================================================
   5. WATER EXTENT DATA
========================================================= */

function normalizeWaterRow(row) {
  const rawDate = getValue(row, [
    "date",
    "month",
    "year_month",
    "system_date",
    "time"
  ]);

  const date = parseDate(rawDate);

  return {
    date,
    month: formatMonth(date),
    year: date ? date.getFullYear() : null,

    s2Area: toNumber(getValue(row, [
      "s2_water_km2",
      "sentinel2_water_km2",
      "sentinel_2_water_km2",
      "s2_area_km2",
      "s2_water_area",
      "water_area_s2",
      "s2_area"
    ])),

    s1Area: toNumber(getValue(row, [
      "s1_water_km2",
      "sentinel1_water_km2",
      "sentinel_1_water_km2",
      "s1_area_km2",
      "s1_water_area",
      "water_area_s1",
      "s1_area"
    ])),

    s2Images: toNumber(getValue(row, [
      "s2_image_count",
      "sentinel2_image_count",
      "s2_images",
      "s2_count"
    ])),

    s1Images: toNumber(getValue(row, [
      "s1_image_count",
      "sentinel1_image_count",
      "s1_images",
      "s1_count"
    ]))
  };
}

let waterData = [];
let baselineData = [];
let filteredWaterData = [];
let charts = {};


/* =========================================================
   6. YEAR FILTER
========================================================= */

function populateYearFilter(data) {
  const filter = $("#yearFilter");
  if (!filter) return;

  const years = [
    ...new Set(
      data
        .map(item => item.year)
        .filter(year => Number.isInteger(year))
    )
  ].sort((a, b) => a - b);

  const previousValue = filter.value;

  filter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All years";
  filter.appendChild(allOption);

  years.forEach(year => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    filter.appendChild(option);
  });

  if (years.includes(Number(previousValue))) {
    filter.value = previousValue;
  } else {
    filter.value = "all";
  }
}

function applyYearFilter() {
  const filter = $("#yearFilter");
  const selectedYear = filter?.value || "all";

  filteredWaterData = selectedYear === "all"
    ? [...waterData]
    : waterData.filter(
        item => String(item.year) === selectedYear
      );

  updateDashboard();
}


/* =========================================================
   7. KPI CALCULATIONS
========================================================= */

function updateKPIs() {
  const s2Images = waterData.reduce(
    (sum, row) => sum + (row.s2Images || 0),
    0
  );

  const s1Images = waterData.reduce(
    (sum, row) => sum + (row.s1Images || 0),
    0
  );

  const months = waterData.filter(
    row => row.date
  ).length;

  const latestBaseline = baselineData.length
    ? baselineData[baselineData.length - 1]
    : null;

  const latestVolume = latestBaseline?.volume;

  setText("s2Images", formatNumber(s2Images, 0));
  setText("s1Images", formatNumber(s1Images, 0));
  setText("monthCount", formatNumber(months, 0));

  setText(
    "endVolume",
    latestVolume === null || latestVolume === undefined
      ? "—"
      : formatNumber(latestVolume, 2)
  );
}


/* =========================================================
   8. CHART HELPERS
========================================================= */

function destroyChart(name) {
  if (charts[name]) {
    charts[name].destroy();
    charts[name] = null;
  }
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,

    interaction: {
      intersect: false,
      mode: "index"
    },

    plugins: {
      legend: {
        labels: {
          color: CONFIG.colors.muted,
          usePointStyle: true,
          boxWidth: 8
        }
      },

      tooltip: {
        backgroundColor: "#101d30",
        titleColor: "#ffffff",
        bodyColor: "#dbe5f1",
        borderColor: "rgba(148,163,184,0.2)",
        borderWidth: 1,
        padding: 12
      }
    },

    scales: {
      x: {
        ticks: {
          color: CONFIG.colors.muted,
          maxRotation: 45,
          minRotation: 0
        },
        grid: {
          color: CONFIG.colors.grid
        }
      },

      y: {
        beginAtZero: true,
        ticks: {
          color: CONFIG.colors.muted
        },
        grid: {
          color: CONFIG.colors.grid
        }
      }
    }
  };
}

function renderWaterChart() {
  const canvas = $("#waterChart");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChart("water");

  const labels = filteredWaterData.map(row => row.month);

  charts.water = new Chart(canvas, {
    type: "line",

    data: {
      labels,

      datasets: [
        {
          label: "Sentinel-2 water area",
          data: filteredWaterData.map(row => row.s2Area),
          borderColor: CONFIG.colors.teal,
          backgroundColor: "rgba(39,211,194,0.10)",
          borderWidth: 2,
          tension: 0.3,
          spanGaps: false
        },

        {
          label: "Sentinel-1 water area",
          data: filteredWaterData.map(row => row.s1Area),
          borderColor: CONFIG.colors.blue,
          backgroundColor: "rgba(67,165,245,0.10)",
          borderWidth: 2,
          tension: 0.3,
          spanGaps: false
        }
      ]
    },

    options: chartDefaults()
  });
}

function renderVolumeChart() {
  const canvas = $("#volumeChart");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChart("volume");

  const rows = baselineData;

  charts.volume = new Chart(canvas, {
    type: "line",

    data: {
      labels: rows.map(row => row.month),

      datasets: [
        {
          label: "Scenario storage volume",
          data: rows.map(row => row.volume),
          borderColor: CONFIG.colors.purple,
          backgroundColor: "rgba(167,139,250,0.12)",
          fill: true,
          borderWidth: 2,
          tension: 0.3,
          spanGaps: false
        }
      ]
    },

    options: chartDefaults()
  });
}

function renderRainChart() {
  const canvas = $("#rainChart");
  if (!canvas || typeof Chart === "undefined") return;

  destroyChart("rain");

  const rows = baselineData;

  charts.rain = new Chart(canvas, {
    type: "bar",

    data: {
      labels: rows.map(row => row.month),

      datasets: [
        {
          label: "Catchment rainfall",
          data: rows.map(row => row.rainfall),
          backgroundColor: "rgba(67,165,245,0.65)",
          borderRadius: 5
        }
      ]
    },

    options: chartDefaults()
  });
}


/* =========================================================
   9. BASELINE DATA
========================================================= */

function normalizeBaselineRow(row) {
  const rawDate = getValue(row, [
    "date",
    "month",
    "year_month",
    "time"
  ]);

  const date = parseDate(rawDate);

  return {
    date,
    month: formatMonth(date),

    rainfall: toNumber(getValue(row, [
      "rainfall_mm",
      "rainfall",
      "monthly_rainfall_mm",
      "precipitation_mm",
      "precipitation"
    ])),

    volume: toNumber(getValue(row, [
      "storage_volume",
      "storage_volume_mcm",
      "volume_mcm",
      "volume",
      "scenario_volume",
      "storage_mcm"
    ])),

    inflow: toNumber(getValue(row, [
      "inflow",
      "inflow_mcm",
      "estimated_inflow_mcm"
    ])),

    release: toNumber(getValue(row, [
      "release",
      "release_mcm",
      "outflow_mcm"
    ])),

    evaporation: toNumber(getValue(row, [
      "evaporation",
      "evaporation_mcm",
      "evaporation_loss_mcm"
    ]))
  };
}


/* =========================================================
   10. BASELINE TABLE
========================================================= */

function renderBaselineTable() {
  const table = $("#baselineTable");
  if (!table) return;

  const tbody = table.querySelector("tbody");

  if (!tbody) {
    console.warn("Baseline table needs a tbody element.");
    return;
  }

  tbody.innerHTML = "";

  if (!baselineData.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = 5;
    td.textContent = "No baseline records available.";

    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  baselineData.forEach(row => {
    const tr = document.createElement("tr");

    const values = [
      row.month,
      formatNumber(row.rainfall),
      formatNumber(row.inflow),
      formatNumber(row.release),
      formatNumber(row.volume)
    ];

    values.forEach(value => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}


/* =========================================================
   11. COVERAGE INDICATORS
========================================================= */

function updateCoverage() {
  const s2Total = waterData.filter(
    row => row.s2Area !== null
  ).length;

  const s1Total = waterData.filter(
    row => row.s1Area !== null
  ).length;

  const total = waterData.length || 1;

  const s2Percent = (s2Total / total) * 100;
  const s1Percent = (s1Total / total) * 100;

  setText("s2Coverage", `${formatNumber(s2Percent, 0)}%`);
  setText("s1Coverage", `${formatNumber(s1Percent, 0)}%`);

  setWidth("s2CoverageBar", s2Percent);
  setWidth("s1CoverageBar", s1Percent);
}


/* =========================================================
   12. SCENARIO INFORMATION
========================================================= */

function updateScenario() {
  const first = baselineData[0];
  const last = baselineData[baselineData.length - 1];

  if (!first || !last) {
    setText("waterRange", "—");
    setText("scenarioVolume", "—");
    setText("scenarioFull", "—");
    return;
  }

  const firstVolume = first.volume;
  const lastVolume = last.volume;

  if (firstVolume !== null && lastVolume !== null) {
    const change = lastVolume - firstVolume;

    setText(
      "scenarioVolume",
      `${change >= 0 ? "+" : ""}${formatNumber(change)}`
    );
  } else {
    setText("scenarioVolume", "—");
  }

  setText(
    "waterRange",
    `${first.month} – ${last.month}`
  );

  setText(
    "scenarioFull",
    lastVolume === null
      ? "—"
      : formatNumber(lastVolume)
  );
}


/* =========================================================
   13. LEAFLET MAP
========================================================= */

let map = null;
let studyAreaLayer = null;
let waterPolygonLayer = null;

function initializeMap() {
  const mapElement = $("#reservoirMap");

  if (!mapElement || typeof L === "undefined") {
    console.warn("Map element or Leaflet library not found.");
    return;
  }

  map = L.map("reservoirMap", {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView(
    [
      CONFIG.reservoir.lat,
      CONFIG.reservoir.lng
    ],
    CONFIG.reservoir.zoom
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  ).addTo(map);

  L.marker([
    CONFIG.reservoir.lat,
    CONFIG.reservoir.lng
  ])
    .addTo(map)
    .bindPopup(`<strong>${CONFIG.reservoir.name}</strong><br>Demo study location`);

  loadOptionalGeoJSON();
}

async function loadGeoJSON(path, style) {
  try {
    const response = await fetch(path);

    if (!response.ok) {
      return null;
    }

    const geojson = await response.json();

    return L.geoJSON(geojson, {
      style,
      onEachFeature: (feature, layer) => {
        const properties = feature.properties || {};

        const label =
          properties.month ||
          properties.date ||
          properties.name ||
          "Study area feature";

        layer.bindPopup(String(label));
      }
    });
  } catch (error) {
    console.info(`Optional layer unavailable: ${path}`);
    return null;
  }
}

async function loadOptionalGeoJSON() {
  if (!map) return;

  studyAreaLayer = await loadGeoJSON(
    CONFIG.studyAreaGeoJSON,
    {
      color: "#27d3c2",
      weight: 2,
      fillColor: "#27d3c2",
      fillOpacity: 0.08
    }
  );

  waterPolygonLayer = await loadGeoJSON(
    CONFIG.waterPolygonsGeoJSON,
    {
      color: "#43a5f5",
      weight: 1.5,
      fillColor: "#43a5f5",
      fillOpacity: 0.35
    }
  );

  const overlays = {};

  if (studyAreaLayer) {
    studyAreaLayer.addTo(map);
    overlays["Study area"] = studyAreaLayer;
  }

  if (waterPolygonLayer) {
    waterPolygonLayer.addTo(map);
    overlays["Water extent polygons"] = waterPolygonLayer;
  }

  if (Object.keys(overlays).length) {
    L.control.layers(null, overlays, {
      collapsed: true
    }).addTo(map);
  }

  const combinedLayers = [
    studyAreaLayer,
    waterPolygonLayer
  ].filter(Boolean);

  if (combinedLayers.length) {
    const group = L.featureGroup(combinedLayers);
    const bounds = group.getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }
}


/* =========================================================
   14. DASHBOARD UPDATE
========================================================= */

function updateDashboard() {
  renderWaterChart();
  updateKPIs();
  updateCoverage();
  updateScenario();
  renderBaselineTable();
}


/* =========================================================
   15. MOBILE SIDEBAR
========================================================= */

function initializeMobileMenu() {
  const menuButton = $("#menuBtn");
  const sidebar = $("#sidebar");

  if (!menuButton || !sidebar) return;

  menuButton.addEventListener("click", () => {
    sidebar.classList.toggle("active");
  });

  document.addEventListener("click", event => {
    if (
      window.innerWidth <= 900 &&
      !sidebar.contains(event.target) &&
      !menuButton.contains(event.target)
    ) {
      sidebar.classList.remove("active");
    }
  });
}


/* =========================================================
   16. OPTIONAL DOWNLOAD HELPERS
========================================================= */

function downloadCSV(filename, rows) {
  if (!rows || !rows.length) {
    showToast("No data available to download.");
    return;
  }

  const headers = Object.keys(rows[0]);

  const escapeCSV = value => {
    const text = value === null || value === undefined
      ? ""
      : String(value);

    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map(row =>
      headers.map(header => escapeCSV(row[header])).join(",")
    )
  ].join("\n");

  const blob = new Blob(
    [csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}


/* =========================================================
   17. EVENT LISTENERS
========================================================= */

function initializeEvents() {
  const filter = $("#yearFilter");

  if (filter) {
    filter.addEventListener("change", applyYearFilter);
  }

  const waterDownload = $("#downloadWater");

  if (waterDownload) {
    waterDownload.addEventListener("click", () => {
      downloadCSV(
        "terravita_water_extent.csv",
        filteredWaterData
      );
    });
  }

  const baselineDownload = $("#downloadBaseline");

  if (baselineDownload) {
    baselineDownload.addEventListener("click", () => {
      downloadCSV(
        "terravita_twin_baseline.csv",
        baselineData
      );
    });
  }
}


/* =========================================================
   18. MAIN INITIALIZATION
========================================================= */

async function initializeDashboard() {
  initializeMap();
  initializeMobileMenu();
  initializeEvents();

  try {
    const [rawWater, rawBaseline] = await Promise.all([
      loadCSV(CONFIG.waterCSV),
      loadCSV(CONFIG.baselineCSV)
    ]);

    waterData = rawWater
      .map(normalizeWaterRow)
      .filter(row => row.date)
      .sort((a, b) => a.date - b.date);

    baselineData = rawBaseline
      .map(normalizeBaselineRow)
      .filter(row => row.date)
      .sort((a, b) => a.date - b.date);

    if (!waterData.length) {
      showDataMessage(
        "Water CSV loaded, but no valid dated records were found."
      );
    }

    if (!baselineData.length) {
      showDataMessage(
        "Baseline CSV loaded, but no valid dated records were found."
      );
    }

    populateYearFilter(waterData);

    renderVolumeChart();
    renderRainChart();

    applyYearFilter();

    console.info("TerraVita AquaTwin initialized.", {
      waterRecords: waterData.length,
      baselineRecords: baselineData.length
    });

  } catch (error) {
    console.error("Dashboard initialization failed:", error);

    showDataMessage(
      "Dashboard data could not be loaded. Check the data folder and CSV filenames."
    );
  }
}


/* =========================================================
   19. START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeDashboard
);
