// Catalogs and VPH calculations mirror the existing male molecular panel.
(function (root) {
const FUNGI_MARKERS = [
  { id: "meyerozyma", label: "Meyerozyma guilliermondii (C. guilliermondii)" },
  { id: "candida_albicans", label: "Candida albicans" },
  { id: "saccharomyces", label: "Saccharomyces cerevisiae" },
  { id: "candida_tropicalis", label: "Candida tropicalis" },
  { id: "debaryomyces", label: "Debaryomyces hansenii (C. famata)" },
  { id: "candida_glabrata", label: "Candida glabrata" },
  { id: "malassezia_spp", label: "Malassezia spp." },
  { id: "kluyveromyces", label: "Kluyveromyces marxianus (C. kefyr)" },
  { id: "pichia", label: "Pichia kudriavzevii (C. krusei)" },
  { id: "candida_auris", label: "Candida auris" },
  { id: "clavispora", label: "Clavispora lusitaniae (Candida lusitaniae)" },
  { id: "candida_dubliniensis", label: "Candida dubliniensis" },
  { id: "candida_parapsilosis", label: "Candida parapsilosis" },
  { id: "malassezia_furfur", label: "Malassezia furfur" },
];

const GENOTYPES = [
  ["6", "Bajo riesgo", "A"], ["16", "Alto riesgo", "A"], ["26", "Alto riesgo", "A"],
  ["40", "Bajo riesgo", "A"], ["53", "Alto riesgo", "A"], ["56", "Riesgo intermedio", "A"],
  ["58", "Riesgo intermedio", "A"], ["73", "Alto riesgo", "A"], ["11", "Bajo riesgo", "B"],
  ["18", "Alto riesgo", "B"], ["33", "Riesgo intermedio", "B"], ["43", "Bajo riesgo", "B"],
  ["44", "Bajo riesgo", "B"], ["51", "Riesgo intermedio", "B"], ["59", "Riesgo intermedio", "B"],
  ["35", "Riesgo intermedio", "C"], ["45", "Alto riesgo", "C"], ["54", "Bajo riesgo", "C"],
  ["68", "Riesgo intermedio", "C"], ["81", "Bajo riesgo", "C"], ["82", "Alto riesgo", "C"],
  ["31", "Alto riesgo", "D"], ["39", "Riesgo intermedio", "D"], ["42", "Bajo riesgo", "D"],
  ["52", "Riesgo intermedio", "D"], ["61", "Bajo riesgo", "D"], ["66", "Alto riesgo", "D"],
  ["83", "Alto riesgo", "D"],
].map(([id, risk, group]) => ({ id, risk, group }));


const DEFAULT_GROUPS = {
    A: { m: 1.886, b: -19.801, low: 0.079, medium: 104.9, max: 157294, label: "Baja: 0,0-0,079 · Media: 0,08-104,9 · Alta: 105-157.294" },
    B: { m: 9.569, b: -67.149, low: 52270, medium: 221453, max: 938224, label: "Baja: 7.625-52.270 · Media: 52.271-221.453 · Alta: 221.454-938.224" },
    C: { m: 4.788, b: -38.048, low: 2248, medium: 40257, max: 721071, label: "Baja: 47,9-2.248 · Media: 2.249-40.257 · Alta: 40.258-721.071" },
    D: { m: 1.882, b: -18.447, low: 0.019, medium: 20.9, max: 30782, label: "Baja: 0,0-0,019 · Media: 0,02-20,9 · Alta: 21,0-30.782" },
  };
const RESULT_OPTIONS = [
  ["none", "No detectado"],
  ["low", "Detectado bajo"],
  ["medium", "Detectado medio"],
  ["high", "Detectado alto"],
];


let state;
let settings;
function configure(data, groups) {
  state = { results: { fungi: data.fungi }, vph: data.vph };
  settings = { vphGroups: groups };
}
function cleanCt(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text || /^(nd|no|n\/a|0)$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function vphLoad(meta, rawCt) {
  const ct = cleanCt(rawCt);
  if (ct === null) return null;
  const curve = settings.vphGroups[meta.group];
  return Math.pow(10, -((Number(curve.b) + ct) / Number(curve.m)));
}

function classifyVph(meta, load) {
  if (load === null) return { value: "none", label: "NO DETECTADO" };
  const range = settings.vphGroups[meta.group];
  if (load <= Number(range.low)) return { value: "low", label: "BAJA" };
  if (load <= Number(range.medium)) return { value: "medium", label: "MEDIA" };
  return { value: "high", label: "ALTA" };
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  const number = Number(value) > 0 && Number(value) < 0.01 ? 0.01 : Number(value);
  return number.toLocaleString("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function statusLabel(value) {
  return Object.fromEntries(RESULT_OPTIONS)[value] || "No detectado";
}

function resultTable(markers, group) {
  return `<table class="clinical-table result-table"><thead><tr><th>Agente estudiado</th><th>Resultado</th></tr></thead><tbody>${markers.map((marker) => {
    const value = state.results[group][marker.id] || "none";
    return `<tr><td><i>${escapeHtml(marker.label)}</i></td><td><span class="result-pill ${value}">${statusLabel(value)}</span></td></tr>`;
  }).join("")}</tbody></table>`;
}

function vphRiskClass(risk) {
  if (risk === "Alto riesgo") return "risk-high";
  if (risk === "Riesgo intermedio") return "risk-medium";
  return "risk-low";
}

function vphTable(rows) {
  const detected = rows.filter((row) => row.load !== null);
  if (!detected.length) return `<div class="empty-result"><b>No se detectaron genotipos de VPH.</b><span>Los 28 genotipos fueron estudiados.</span></div>`;
  return `<table class="clinical-table vph-report-table"><thead><tr><th>Genotipo</th><th>Riesgo del genotipo</th><th>Carga viral<br><small>copias/reacción</small></th><th>Clasificación de la carga</th><th>Rangos de referencia</th></tr></thead><tbody>${detected.map((row) => `<tr><td><b>G${row.id}</b></td><td><span class="risk-pill ${vphRiskClass(row.risk)}">${row.risk}</span></td><td>${formatNumber(row.load, 2)}</td><td><span class="result-pill ${row.status.value}">${row.status.label}</span></td><td>${escapeHtml(settings.vphGroups[row.group].label)}</td></tr>`).join("")}</tbody></table>`;
}

function vphChart(rows) {
  const detected = rows.filter((row) => row.load !== null);
  if (!detected.length) return "";
  const max = Math.max(...detected.map((row) => row.load), 1);
  const width = 560, height = 205, left = 46, bottom = 35, plot = width - left - 18;
  const charts = [];
  for (let start = 0; start < detected.length; start += 7) {
    const group = detected.slice(start, start + 7);
    const slot = plot / group.length;
    const bars = group.map((row, index) => {
      const normalized = Math.log10(row.load + 1) / Math.log10(max + 1);
      const barHeight = Math.max(normalized * 125, 4);
      const x = left + index * slot + slot * 0.22;
      const y = height - bottom - barHeight;
      const barWidth = Math.max(slot * 0.56, 8);
      return `<g><rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" class="chart-${row.status.value}"/><text x="${x + barWidth / 2}" y="${height - 14}" text-anchor="middle">${row.id}</text><text x="${x + barWidth / 2}" y="${Math.max(y - 5, 14)}" text-anchor="middle" class="chart-value">${formatNumber(row.load, row.load < 1 ? 2 : 0)}</text></g>`;
    }).join("");
    charts.push(`<div class="chart-frame"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Carga viral por genotipo"><line x1="${left}" y1="10" x2="${left}" y2="${height - bottom}"/><line x1="${left}" y1="${height - bottom}" x2="${width - 10}" y2="${height - bottom}"/>${bars}<text x="${width / 2}" y="${height - 1}" text-anchor="middle" class="chart-axis">Genotipo</text></svg></div>`);
  }
  return charts.join("");
}
function newState() {
  return { fungi: Object.fromEntries(FUNGI_MARKERS.map(item => [item.id, "none"])), vph: {} };
}
function inputs(data) {
  const fungi = FUNGI_MARKERS.map(item => `<label>${escapeHtml(item.label)}<select data-molecular-fungus="${item.id}">${RESULT_OPTIONS.map(([value, label]) => `<option value="${value}" ${data.fungi[item.id] === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`).join("");
  const vph = GENOTYPES.map(item => `<label>G${item.id}<input aria-label="CT G${item.id}" data-molecular-vph="${item.id}" inputmode="decimal" placeholder="CT o ND" value="${escapeHtml(data.vph[item.id] || "")}"></label>`).join("");
  return { fungi, vph };
}
function fungiReport(data, groups) {
  configure(data, groups);
  return resultTable(FUNGI_MARKERS, "fungi");
}
function vphReport(data, groups) {
  configure(data, groups);
  const rows = GENOTYPES.map(meta => {
    const load = vphLoad(meta, state.vph[meta.id]);
    return { ...meta, load, status: classifyVph(meta, load) };
  });
  const undetected = rows.filter(item => item.load === null).map(item => "G" + item.id);
  return vphTable(rows) + `<p class="not-detected-vph"><b>Otros genotipos estudiados no detectados:</b> ${undetected.join(", ") || "Ninguno"}</p>` + vphChart(rows);
}
root.MolecularPanels = { newState, inputs, fungiReport, vphReport, defaultGroups: DEFAULT_GROUPS };
})(window);

