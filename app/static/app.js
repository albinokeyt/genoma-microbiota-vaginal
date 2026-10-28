const MARKERS = [
  { id: "lacto", label: "Lactobacillus spp.", channel: "ROX / Orange", m: -4.87, b: 49.87, role: "protective" },
  { id: "gardnerella", label: "Gardnerella vaginalis", channel: "FAM / Green", m: -3.82, b: 39.54, role: "pathogen" },
  { id: "atopobium", label: "Atopobium vaginae", channel: "HEX / Yellow", m: -3.8, b: 38.35, role: "pathogen" },
  { id: "total", label: "Bacterias totales", channel: "Cy5 / Red", m: -3.98, b: 46.93, role: "total" },
];

const ADDITIONAL = [
  "Ureaplasma parvum", "Ureaplasma urealyticum", "Mycoplasma hominis", "Mycoplasma genitalium",
  "Chlamydia trachomatis", "Neisseria gonorrhoeae", "Haemophilus ducreyi", "Trichomonas vaginalis",
  "Herpes simplex virus type 1", "Herpes simplex virus type 2", "Streptococcus agalactiae (Grupo B)", "Treponema pallidum",
];

const SETTINGS_STORAGE = "microbiota-vaginal-settings-v1";
const DEFAULT_SETTINGS = {
  vphGroups: clone(MolecularPanels.defaultGroups),
  formula: { logBase: 10 },
  curves: Object.fromEntries(MARKERS.map((marker) => [marker.id, { m: marker.m, b: marker.b, factor: 1 }])),
  thresholds: {
    lactoWarning: 30,
    lactoOptimal: 70,
    lactoAbsoluteMinimum: 1e6,
    totalInsufficient: 1e5,
    totalAdequate: 1e6,
    totalIncreased: 1e7,
    totalOverload: 1e8,
    kc1Vaginosis: 0.5,
    kc1Normal: 1,
    kc2Altered: 1,
    kc3Altered: 2,
  },
  report: {
    percentageDecimals: 2,
    concentrationDecimals: 2,
    defaultSampleType: "Hisopado vaginal",
    defaultPurity: "Óptimo",
    defaultSignature: "Laboratorio Genoma",
    footerText: "Laboratorio Genoma · Informe de apoyo para interpretación profesional",
  },
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function mergeSettings(saved) {
  const merged = clone(DEFAULT_SETTINGS);
  if (!saved || typeof saved !== "object") return merged;
  Object.assign(merged.formula, saved.formula || {});
  Object.assign(merged.thresholds, saved.thresholds || {});
  Object.assign(merged.report, saved.report || {});
  Object.keys(merged.vphGroups).forEach((group) => Object.assign(merged.vphGroups[group], saved.vphGroups?.[group] || {}));
  MARKERS.forEach((marker) => Object.assign(merged.curves[marker.id], saved.curves?.[marker.id] || {}));
  if (merged.curves.total.m === -3.839 && merged.curves.total.b === 0) merged.curves.total.b = 36.094;
  return merged;
}

function loadSettings() {
  try { return mergeSettings(JSON.parse(localStorage.getItem(SETTINGS_STORAGE) || "null")); }
  catch { return clone(DEFAULT_SETTINGS); }
}

let settings = loadSettings();

async function hydrateSettings() {
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) return;
    const saved = await response.json();
    if (!saved || !Object.keys(saved).length) return;
    settings = mergeSettings(saved);
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings));
    state.curves = settings.curves;
    renderSettings();
    renderReport();
  } catch { /* The local configuration remains available offline. */ }
}

const state = {
  components: { microbiota: true, fungi: false, vph: false },
  molecular: MolecularPanels.newState(),
  patientName: "", patientId: "", evalDate: new Date().toISOString().slice(0, 10), sampleType: settings.report.defaultSampleType,
  history: "", dna: "", purity: settings.report.defaultPurity, values: {}, curves: settings.curves, additional: {},
  fungiHigh: "", fungiMedium: "", fungiLow: "", interpretation: "", conclusions: "", recommendations: "", signatureText: settings.report.defaultSignature,
};

function $(id) { return document.getElementById(id); }

function parseCt(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text || /^(nd|no detectado|no)$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatNumber(value, digits = 2) {
  const safeDigits = Number.isFinite(Number(digits)) ? Math.max(0, Math.min(6, Math.trunc(Number(digits)))) : 2;
  return new Intl.NumberFormat("es-VE", { maximumFractionDigits: safeDigits, minimumFractionDigits: 0 }).format(value);
}

function scientific(value) {
  if (!Number.isFinite(value) || value <= 0) return "No detectado";
  const exponent = Math.floor(Math.log10(value));
  const base = value / (10 ** exponent);
  return `${formatNumber(base, Number(settings.report.concentrationDecimals))} x 10<sup>${exponent}</sup>`;
}

function calculateMarker(marker) {
  const ct = parseCt(state.values[marker.id]);
  const curve = state.curves[marker.id] || marker;
  const m = Number(String(curve.m).replace(",", "."));
  const b = Number(String(curve.b).replace(",", "."));
  if (ct === null || !Number.isFinite(m) || !Number.isFinite(b) || m === 0) return { ...marker, ct, log: null, copies: 0 };
  const log = (ct - b) / m;
  const factor = Number(String(curve.factor ?? 1).replace(",", "."));
  const base = Number(settings.formula.logBase);
  const copies = ((Number.isFinite(base) && base > 0 && base !== 1 ? base : 10) ** log) * (Number.isFinite(factor) && factor > 0 ? factor : 1);
  return { ...marker, ct, log, copies: Number.isFinite(copies) && copies > 0 ? copies : 0 };
}

function results() {
  const rows = Object.fromEntries(MARKERS.map((marker) => [marker.id, calculateMarker(marker)]));
  const total = rows.total.copies;
  const lacto = rows.lacto.copies;
  const gardnerella = rows.gardnerella.copies;
  const atopobium = rows.atopobium.copies;
  const anaerobes = gardnerella + atopobium;
  const other = Math.max(0, total - lacto - gardnerella - atopobium);
  const percent = (value) => total > 0 ? (value / total) * 100 : 0;
  const kc1 = lacto > 0 && anaerobes > 0 ? Math.log10(lacto) - Math.log10(anaerobes) : null;
  const kc2 = total > 0 && lacto > 0 ? Math.log10(total) - Math.log10(lacto) : null;
  const kc3 = total > 0 && anaerobes > 0 ? Math.log10(total) - Math.log10(anaerobes) : null;
  return { rows, total, lacto, gardnerella, atopobium, anaerobes, other, percent, kc1, kc2, kc3 };
}

function classify(data) {
  const t = settings.thresholds;
  if (!data.total) return { title: "Pendiente de análisis", detail: "Introduzca el Ct de bacterias totales (Cy5) para calcular el perfil.", tone: "neutral" };
  if (data.total < t.totalInsufficient) return { title: "Carga bacteriana insuficiente", detail: `La masa bacteriana es inferior a ${scientific(t.totalInsufficient)} copias/mL. Se recomienda repetir la toma según el protocolo.`, tone: "rose" };
  if (data.total < t.totalAdequate) return { title: "Carga bacteriana disminuida", detail: `La carga total es menor a ${scientific(t.totalAdequate)} copias/mL.`, tone: "amber" };
  if (data.kc2 !== null && data.kc3 !== null && data.kc2 > t.kc2Altered && data.kc3 > t.kc3Altered) return { title: "Flora alterada, etiología no especificada", detail: "Hay reducción relativa de Lactobacillus respecto a la carga total.", tone: "amber" };
  if (data.kc1 !== null && data.kc1 < t.kc1Vaginosis) return { title: "Compatible con vaginosis bacteriana", detail: "La relación entre Lactobacillus y anaerobios corresponde a un perfil de vaginosis bacteriana.", tone: "rose" };
  if (data.kc1 !== null && data.kc1 <= t.kc1Normal) return { title: "Flora intermedia", detail: "La relación entre Lactobacillus y anaerobios es intermedia.", tone: "amber" };
  return { title: "No compatible con vaginosis bacteriana", detail: "Predomina la microbiota protectora o no se detectan anaerobios relevantes.", tone: "green" };
}

function totalLabel(total) {
  const t = settings.thresholds;
  if (!total) return "Pendiente";
  if (total < t.totalAdequate) return "Masa total disminuida";
  if (total < t.totalIncreased) return "Cantidad apropiada";
  if (total <= t.totalOverload) return "Carga aumentada";
  return "Sobrecarga bacteriana";
}

function lactoLabel(percent) {
  if (percent >= settings.thresholds.lactoOptimal) return { label: "Protección adecuada", tone: "green" };
  if (percent >= settings.thresholds.lactoWarning) return { label: "Protección intermedia", tone: "amber" };
  return { label: "Protección reducida", tone: "rose" };
}

function syncForm() {
  document.querySelectorAll("[data-component]").forEach((input) => { input.checked = state.components[input.dataset.component]; });
  document.querySelectorAll("[data-editor-component]").forEach((section) => section.classList.toggle("hidden", !state.components[section.dataset.editorComponent]));
  const molecularInputs = MolecularPanels.inputs(state.molecular);
  $("fungiInputs").innerHTML = molecularInputs.fungi;
  $("vphInputs").innerHTML = molecularInputs.vph;
  ["patientName", "patientId", "evalDate", "sampleType", "history", "dna", "purity", "fungiHigh", "fungiMedium", "fungiLow", "interpretation", "conclusions", "recommendations", "signatureText"].forEach((id) => {
    const element = $(id);
    if (element) element.value = state[id] || "";
  });
  document.querySelectorAll("[data-state]").forEach((element) => {
    const [group, key] = element.dataset.state.split(".");
    const value = group === "values" ? state.values[key] : group === "curves" ? state.curves[key]?.[element.dataset.field] : state.additional[key];
    element.value = value ?? "";
  });
}

function renderInputs() {
  $("ctInputs").innerHTML = MARKERS.map((marker) => `
    <label class="ct-row"><span><b>${marker.label}</b><small>${marker.channel}</small></span><input data-state="values.${marker.id}" inputmode="decimal" placeholder="Ct o ND"></label>`).join("");
  $("additionalInputs").innerHTML = ADDITIONAL.map((name) => `<label>${name}<select data-state="additional.${name}"><option>No detectado</option><option>Detectado en baja cantidad</option><option>Detectado</option><option>Detectado en cantidad significativa</option></select></label>`).join("");
  syncForm();
}

function settingInput(label, path, value, options = {}) {
  const type = options.type || "number";
  const attrs = type === "number" ? `type="number" step="${options.step || "any"}" ${options.min === null ? "" : `min="${options.min ?? 0}"`}` : "type=\"text\"";
  return `<label>${label}${options.help ? `<small>${options.help}</small>` : ""}<input ${attrs} data-setting="${path}" value="${String(value).replace(/"/g, "&quot;")}"></label>`;
}

function renderSettings() {
  $("vphSettings").innerHTML = Object.entries(settings.vphGroups).map(([group, curve]) => `<fieldset><legend>Grupo ${group}</legend>${settingInput("Pendiente", `vphGroups.${group}.m`, curve.m, { min: -100000 })}${settingInput("Intercepto", `vphGroups.${group}.b`, curve.b, { min: -100000 })}${settingInput("Fin de carga baja", `vphGroups.${group}.low`, curve.low)}${settingInput("Fin de carga media", `vphGroups.${group}.medium`, curve.medium)}${settingInput("Texto de referencia", `vphGroups.${group}.label`, curve.label, { type: "text" })}</fieldset>`).join("");
  $("settingsCurves").innerHTML = `<div class="formula-variable">${settingInput("Base logarítmica (N)", "formula.logBase", settings.formula.logBase, { min: 0.000001 })}<p><b>Resultado:</b> copias/mL = N<sup>(Ct - b) / m</sup> × factor</p></div>` + MARKERS.map((marker) => {
    const curve = settings.curves[marker.id];
    return `<div class="settings-curve-row"><div><b>${marker.label}</b><small>${marker.channel}</small></div>${settingInput("Pendiente (m)", `curves.${marker.id}.m`, curve.m, { min: null })}${settingInput("Intercepto (b)", `curves.${marker.id}.b`, curve.b, { min: 0.000001 })}${settingInput("Factor final", `curves.${marker.id}.factor`, curve.factor, { min: 0.000001 })}</div>`;
  }).join("");
  const t = settings.thresholds;
  $("settingsThresholds").innerHTML = [
    settingInput("Lactobacillus: inicio de ámbar (%)", "thresholds.lactoWarning", t.lactoWarning),
    settingInput("Lactobacillus: inicio de verde (%)", "thresholds.lactoOptimal", t.lactoOptimal),
    settingInput("Lactobacillus: mínimo absoluto", "thresholds.lactoAbsoluteMinimum", t.lactoAbsoluteMinimum),
    settingInput("Carga insuficiente: límite", "thresholds.totalInsufficient", t.totalInsufficient),
    settingInput("Carga adecuada: desde", "thresholds.totalAdequate", t.totalAdequate),
    settingInput("Carga aumentada: desde", "thresholds.totalIncreased", t.totalIncreased),
    settingInput("Sobrecarga: mayor a", "thresholds.totalOverload", t.totalOverload),
    settingInput("KC1 compatible con BV: menor a", "thresholds.kc1Vaginosis", t.kc1Vaginosis, { step: 0.1 }),
    settingInput("KC1 flora normal: mayor a", "thresholds.kc1Normal", t.kc1Normal, { step: 0.1 }),
    settingInput("Flora alterada: KC2 mayor a", "thresholds.kc2Altered", t.kc2Altered, { step: 0.1 }),
    settingInput("Flora alterada: KC3 mayor a", "thresholds.kc3Altered", t.kc3Altered, { step: 0.1 }),
  ].join("");
  const r = settings.report;
  $("settingsDefaults").innerHTML = [
    settingInput("Decimales en concentraciones", "report.concentrationDecimals", r.concentrationDecimals, { step: 1 }),
    settingInput("Decimales en porcentajes", "report.percentageDecimals", r.percentageDecimals, { step: 1 }),
    settingInput("Tipo de muestra predeterminado", "report.defaultSampleType", r.defaultSampleType, { type: "text" }),
    settingInput("Pureza predeterminada", "report.defaultPurity", r.defaultPurity, { type: "text" }),
    settingInput("Texto predeterminado bajo la firma", "report.defaultSignature", r.defaultSignature, { type: "text" }),
    settingInput("Texto del pie de página", "report.footerText", r.footerText, { type: "text" }),
  ].join("");
}

function updateSetting(path, rawValue) {
  const keys = path.split(".");
  let target = settings;
  keys.slice(0, -1).forEach((key) => { target = target[key]; });
  const key = keys.at(-1);
  const current = target[key];
  target[key] = typeof current === "number" ? (String(rawValue).trim() === "" ? NaN : Number(String(rawValue).replace(",", "."))) : rawValue;
  state.curves = settings.curves;
}

function showSettings() {
  $("editorView").classList.add("hidden");
  $("settingsView").classList.remove("hidden");
  renderSettings();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showReport() {
  $("settingsView").classList.add("hidden");
  $("editorView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function persistSettings(message) {
  localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings));
  const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
  if (!response.ok) throw new Error("No se pudo guardar en el servidor");
  $("settingsStatus").textContent = message;
  $("settingsStatus").classList.remove("error");
}

async function saveSettings() {
  const error = validateSettings();
  if (error) {
    $("settingsStatus").textContent = error;
    $("settingsStatus").classList.add("error");
    return;
  }
  try {
    await persistSettings(`Guardado: ${new Date().toLocaleString("es-VE")}`);
    renderReport();
  } catch {
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings));
    $("settingsStatus").textContent = "Guardado en este navegador; el servidor no respondió.";
    $("settingsStatus").classList.add("error");
  }
}

function validateSettings() {
  for (const curve of Object.values(settings.vphGroups)) {
    if (![curve.m, curve.b, curve.low, curve.medium].every(Number.isFinite) || curve.m === 0 || curve.low < 0 || curve.medium < curve.low) return "Revisa las curvas y los umbrales de VPH.";
  }
  if (!(Number.isFinite(settings.formula.logBase) && settings.formula.logBase > 1)) return "La base logarítmica debe ser mayor que 1.";
  for (const marker of MARKERS) {
    const curve = settings.curves[marker.id];
    if (![curve.m, curve.b, curve.factor].every(Number.isFinite) || curve.m >= 0 || curve.b <= 0 || curve.factor <= 0) return `Revisa la curva de ${marker.label}: la pendiente debe ser negativa; el intercepto y el factor deben ser mayores que cero.`;
  }
  const t = settings.thresholds;
  if (!(t.lactoWarning >= 0 && t.lactoWarning < t.lactoOptimal && t.lactoOptimal <= 100)) return "Los umbrales de Lactobacillus deben estar ordenados entre 0% y 100%.";
  if (!(t.totalInsufficient > 0 && t.totalInsufficient < t.totalAdequate && t.totalAdequate < t.totalIncreased && t.totalIncreased < t.totalOverload)) return "Los límites de carga bacteriana deben estar ordenados de menor a mayor.";
  if (!(t.kc1Vaginosis < t.kc1Normal)) return "El límite KC1 de vaginosis debe ser menor que el límite de flora normal.";
  if (![settings.report.percentageDecimals, settings.report.concentrationDecimals].every((value) => Number.isInteger(value) && value >= 0 && value <= 6)) return "Los decimales deben ser números enteros entre 0 y 6.";
  return "";
}

async function restoreSettings() {
  settings = clone(DEFAULT_SETTINGS);
  state.curves = settings.curves;
  renderSettings();
  try { await persistSettings("Valores originales restaurados y guardados"); }
  catch { localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings)); }
  renderReport();
}

function tableRow(name, result, reference, note = "") {
  const shown = result.copies ? scientific(result.copies) : "No detectado";
  return `<tr><td><b>${name}</b>${note ? `<small>${note}</small>` : ""}</td><td>${shown}</td><td>${reference}</td></tr>`;
}

function distributionChart(data) {
  const groups = [
    ["Lactobacillus", data.percent(data.lacto), "green"], ["Gardnerella", data.percent(data.gardnerella), "rose"],
    ["Atopobium", data.percent(data.atopobium), "amber"], ["Otros", data.percent(data.other), "slate"],
  ];
  return `<div class="distribution">${groups.map(([name, value, tone]) => `<div class="distribution-row"><span>${name}</span><div class="track"><i class="${tone}" style="width:${Math.max(value, value ? 2 : 0)}%"></i></div><b>${formatNumber(value, Number(settings.report.percentageDecimals))}%</b></div>`).join("")}</div>`;
}

function safeText(text) { return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }

function renderReport() {
  delete $("report").dataset.paginated;
  delete $("report").dataset.layoutError;
  const calibrationError = validateSettings();
  if (calibrationError) {
    $("report").innerHTML = `<section class="disclaimer" role="alert">${safeText(calibrationError)}</section>`;
    $("report").dataset.layoutError = calibrationError;
    return;
  }
  const data = results();
  const diagnosis = classify(data);
  const lacto = lactoLabel(data.percent(data.lacto));
  const date = state.evalDate ? new Date(`${state.evalDate}T12:00:00`).toLocaleDateString("es-VE") : "-";
  const detectedAdditional = Object.entries(state.additional).filter(([, value]) => value && value !== "No detectado");
  const quote = (value) => value ? safeText(value) : "<span class=\"muted\">No registrado.</span>";
  $("report").innerHTML = `
    <article class="page cover-page" data-report-component="microbiota">
      <header class="report-header"><img src="/assets/logo_genoma.png" alt="Genoma"><div><h1>REPORTE DE MICROBIOTA VAGINAL</h1><p>Perfil molecular cuantitativo por PCR en tiempo real</p></div></header>
      <section class="patient-strip"><div><small>FECHA</small><b>${date}</b></div><div><small>PACIENTE</small><b>${state.patientName || "Pendiente"}</b></div><div><small>DOCUMENTO</small><b>${state.patientId || "-"}</b></div><div><small>MUESTRA</small><b>${state.sampleType || "-"}</b></div></section>
      <section class="metrics"><div><small>ESTADO DEL PERFIL</small><b class="${diagnosis.tone}">${diagnosis.title}</b></div><div><small>CARGA BACTERIANA TOTAL</small><b>${data.total ? scientific(data.total) : "Pendiente"}</b></div><div><small>LACTOBACILLUS</small><b class="${lacto.tone}">${formatNumber(data.percent(data.lacto), Number(settings.report.percentageDecimals))}%</b></div><div><small>PUREZA</small><b>${state.purity || "-"}</b></div></section>
      <section class="clinical-card ${diagnosis.tone}"><span>Perfil molecular</span><h2>${diagnosis.title}</h2><p>${diagnosis.detail}</p></section>
      <section class="report-section"><div class="section-kicker"><span>1</span><h2>Resultados analíticos</h2></div>
        <table><thead><tr><th>PARÁMETRO</th><th>CONCENTRACIÓN</th><th>VALOR DE REFERENCIA</th></tr></thead><tbody>
        ${tableRow("Bacterias totales", data.rows.total, `≥ ${scientific(settings.thresholds.totalAdequate)} copias/mL`, totalLabel(data.total))}
        ${tableRow("Lactobacillus spp.", data.rows.lacto, `≥ ${scientific(settings.thresholds.lactoAbsoluteMinimum)} copias/mL`, `${lacto.label} (${formatNumber(data.percent(data.lacto), Number(settings.report.percentageDecimals))}%)`)}
        ${tableRow("Gardnerella vaginalis", data.rows.gardnerella, "No detectado", data.gardnerella ? "Presencia cuantificada" : "")}
        ${tableRow("Atopobium vaginae", data.rows.atopobium, "No detectado", data.atopobium ? "Presencia cuantificada" : "")}
        </tbody></table>
      </section>
      <section class="calculation-grid"><div><small>KC1 - Lactobacillus vs anaerobios</small><b>${data.kc1 === null ? "No aplica" : formatNumber(data.kc1, 2)}</b></div><div><small>KC2 - Total vs Lactobacillus</small><b>${data.kc2 === null ? "No aplica" : formatNumber(data.kc2, 2)}</b></div><div><small>KC3 - Total vs anaerobios</small><b>${data.kc3 === null ? "No aplica" : formatNumber(data.kc3, 2)}</b></div></section>
      <footer>${safeText(settings.report.footerText)}</footer>
    </article>
    <article class="page" data-report-component="microbiota">
      <section class="report-section"><div class="section-kicker"><span>2</span><h2>Equilibrio de la microbiota</h2></div>
        <div class="visual-grid"><div class="chart-card"><h3>Distribución porcentual</h3>${distributionChart(data)}<p class="caption">Otros corresponde a la diferencia entre bacterias totales y los marcadores cuantificados.</p></div>
        <div class="traffic-card ${lacto.tone}"><small>SEMÁFORO DE LACTOBACILLUS</small><strong>${formatNumber(data.percent(data.lacto), Number(settings.report.percentageDecimals))}%</strong><b>${lacto.label}</b><p>Verde: ≥ ${formatNumber(settings.thresholds.lactoOptimal, 2)}% · Ámbar: ${formatNumber(settings.thresholds.lactoWarning, 2)} - ${formatNumber(settings.thresholds.lactoOptimal, 2)}% · Rojo: &lt; ${formatNumber(settings.thresholds.lactoWarning, 2)}%</p></div></div>
      </section>
      <section class="report-section"><div class="section-kicker"><span>3</span><h2>Marcadores complementarios</h2></div>
        <div class="additional-report">${ADDITIONAL.map((name) => `<div><span>${name}</span><b class="${state.additional[name] === "No detectado" ? "green" : "rose"}">${state.additional[name] || "No detectado"}</b></div>`).join("")}</div>
      </section>
      <section class="reference-card"><h3>Valores de referencia</h3><p><b>Bacterias totales:</b> &lt;${scientific(settings.thresholds.totalInsufficient)} insuficiente; ${scientific(settings.thresholds.totalInsufficient)} - &lt;${scientific(settings.thresholds.totalAdequate)} disminuida; ${scientific(settings.thresholds.totalAdequate)} - &lt;${scientific(settings.thresholds.totalIncreased)} apropiada; ${scientific(settings.thresholds.totalIncreased)} - ${scientific(settings.thresholds.totalOverload)} aumentada; &gt;${scientific(settings.thresholds.totalOverload)} sobrecarga.</p><p><b>Interpretación BV:</b> KC1 &lt;${formatNumber(settings.thresholds.kc1Vaginosis, 2)} compatible; ${formatNumber(settings.thresholds.kc1Vaginosis, 2)} - ${formatNumber(settings.thresholds.kc1Normal, 2)} flora intermedia; KC1 &gt;${formatNumber(settings.thresholds.kc1Normal, 2)} no compatible.</p></section>
      <footer>${safeText(settings.report.footerText)}</footer>
    </article>
    <article class="page">
      <section class="report-section"><div class="section-kicker"><span>4</span><h2>Interpretación clínica</h2></div><div class="text-box">${quote(state.interpretation)}</div></section>
      <section class="report-section"><div class="section-kicker"><span>6</span><h2>Conclusiones generales</h2></div><div class="text-box">${quote(state.conclusions)}</div></section>
      <section class="report-section"><div class="section-kicker"><span>7</span><h2>Recomendaciones</h2></div><div class="text-box recommendations">${quote(state.recommendations)}</div></section>
      <section class="disclaimer">Este informe se basa en resultados moleculares. La correlación clínica, diagnóstico y tratamiento corresponden al médico tratante.</section>
      <div class="signature"><img src="/assets/firma_genoma.png" alt="Firma"><span>${safeText(state.signatureText || "Laboratorio Genoma")}</span></div>
      <footer>${safeText(settings.report.footerText)}</footer>
    </article>`;
  assembleSelectedReport();
}

function assembleSelectedReport() {
  const report = $("report");
  const header = report.querySelector(".report-header").cloneNode(true);
  const patient = report.querySelector(".patient-strip").cloneNode(true);
  const labels = { microbiota: "Microbiota vaginal", fungi: "Hongos", vph: "VPH" };
  const names = Object.keys(labels).filter((key) => state.components[key]).map((key) => labels[key]);
  header.querySelector("h1").textContent = "REPORTE MOLECULAR: " + names.join(" / ").toUpperCase();
  header.querySelector("p").textContent = "Componentes evaluados: " + names.join(", ");
  report.querySelectorAll("[data-report-component]").forEach((page) => { if (!state.components[page.dataset.reportComponent]) page.remove(); });
  const finalPage = report.lastElementChild;
  for (const group of ["fungi", "vph"]) {
    if (!state.components[group]) continue;
    const page = document.createElement("article");
    page.className = "page";
    page.dataset.reportComponent = group;
    const title = group === "fungi" ? "Hongos y levaduras" : "Carga viral y tipificación de VPH";
    const content = group === "fungi" ? MolecularPanels.fungiReport(state.molecular, settings.vphGroups) : MolecularPanels.vphReport(state.molecular, settings.vphGroups);
    page.innerHTML = `<div class="section-kicker"><span></span><h2>${title}</h2></div>${content}<footer>${safeText(settings.report.footerText)}</footer>`;
    finalPage.before(page);
  }
  report.querySelectorAll(".page").forEach((page, index) => {
    page.classList.add("report-page");
    page.querySelector(".report-header")?.remove();
    page.prepend(header.cloneNode(true));
    if (index === 0 && !page.querySelector(".patient-strip")) page.querySelector(".report-header").after(patient);
    const footer = page.querySelector("footer");
    footer.className = "report-footer";
    const counter = document.createElement("b");
    counter.textContent = index + 1;
    footer.append(counter);
    // Keep headings attached to their contents and let long tables/text flow across A4 pages.
    page.querySelectorAll(".report-section").forEach((section) => section.replaceWith(...section.childNodes));
    page.querySelectorAll(".section-kicker").forEach((node) => node.classList.add("report-section-title"));
    page.querySelectorAll(".text-box").forEach((node) => node.classList.add("text-panel"));
  });
  report.querySelectorAll(".section-kicker > span").forEach((badge, index) => { badge.textContent = index + 1; });
  requestAnimationFrame(() => ReportLayout.paginate(report));
}

function renderAll() { syncForm(); renderReport(); }

function setDefaults() {
  state.curves = settings.curves;
  ADDITIONAL.forEach((name) => { state.additional[name] = "No detectado"; });
}

function example() {
  Object.assign(state, {
    components: { microbiota: true, fungi: true, vph: true },
    molecular: { fungi: { ...MolecularPanels.newState().fungi, candida_albicans: "high", candida_glabrata: "low", kluyveromyces: "medium", candida_parapsilosis: "medium" }, vph: { "16": "18" } },
    patientName: "Paciente de ejemplo", patientId: "V-00.000.000", evalDate: "2026-06-19",
    sampleType: "Hisopado vaginal", history: "Infección vaginal recurrente.", dna: "625,9 ng/ul", purity: "Óptimo",
    values: { total: "8,18", lacto: "12,72", gardnerella: "14,00", atopobium: "ND" },
    fungiHigh: "Candida albicans", fungiMedium: "Candida kefyr\nCandida parapsilosis", fungiLow: "Candida glabrata",
    interpretation: "El perfil molecular muestra una reducción marcada de la microbiota protectora y una carga bacteriana total elevada. La relación cuantitativa debe correlacionarse con los síntomas y la evaluación médica.",
    conclusions: "Perfil compatible con disbiosis vaginal. Se recomienda integrar los marcadores bacterianos, micóticos y antecedentes clínicos para definir la conducta médica.",
    recommendations: "1. Correlacionar con síntomas, examen físico y estudios complementarios.\n2. Considerar control posterior por PCR según criterio médico.\n3. Evitar automedicación y usar antimicrobianos solo bajo prescripción.\n4. Valorar medidas de restauración de microbiota según evaluación profesional.", signatureText: settings.report.defaultSignature,
  });
  state.additional["Ureaplasma parvum"] = "Detectado en baja cantidad";
  renderAll();
}

function clearAll() {
  state.components = { microbiota: true, fungi: false, vph: false };
  state.molecular = MolecularPanels.newState();
  Object.assign(state, { patientName: "", patientId: "", evalDate: new Date().toISOString().slice(0, 10), sampleType: settings.report.defaultSampleType, history: "", dna: "", purity: settings.report.defaultPurity, values: {}, fungiHigh: "", fungiMedium: "", fungiLow: "", interpretation: "", conclusions: "", recommendations: "", signatureText: settings.report.defaultSignature });
  ADDITIONAL.forEach((name) => { state.additional[name] = "No detectado"; });
  renderAll();
}

function bind() {
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.component) return;
    if (target.dataset.molecularFungus) state.molecular.fungi[target.dataset.molecularFungus] = target.value;
    if (target.dataset.molecularVph) state.molecular.vph[target.dataset.molecularVph] = target.value;
    if (target.id && Object.hasOwn(state, target.id)) state[target.id] = target.value;
    if (target.dataset.state) {
      const [group, key] = target.dataset.state.split(".");
      if (group === "values") state.values[key] = target.value;
      if (group === "curves") state.curves[key][target.dataset.field] = target.value;
      if (group === "additional") state.additional[key] = target.value;
    }
    if (target.dataset.setting) updateSetting(target.dataset.setting, target.value);
    renderReport();
  });
  document.addEventListener("change", (event) => {
    const component = event.target.closest("[data-component]");
    if (component) {
      if (!component.checked && Object.values(state.components).filter(Boolean).length === 1) {
        component.checked = true;
        $("componentStatus").textContent = "Selecciona al menos un componente.";
        return;
      }
      state.components[component.dataset.component] = component.checked;
      $("componentStatus").textContent = "";
      syncForm(); renderReport();
      return;
    }
    if (event.target.dataset.molecularFungus) { state.molecular.fungi[event.target.dataset.molecularFungus] = event.target.value; renderReport(); }
    if (event.target.dataset.state?.startsWith("additional.")) { state.additional[event.target.dataset.state.slice(11)] = event.target.value; renderReport(); }
  });
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "example") example();
    if (action === "clear") clearAll();
    if (action === "settings") showSettings();
    if (action === "back-report") showReport();
    if (action === "save-settings") void saveSettings();
    if (action === "restore-settings") void restoreSettings();
    if (action === "print") { showReport(); void ReportExport.download($("report"), `Informe molecular ${state.patientName || "Paciente"}`); }
  });
}

setDefaults();
renderInputs();
renderSettings();
bind();
renderAll();
void hydrateSettings();
