const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({window: {}});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/static/molecular-panels.js'), 'utf8'), context);
const panel = context.window.MolecularPanels;
const data = panel.newState();
assert.equal(Object.keys(data.fungi).length, 14);
assert.equal((panel.inputs(data).vph.match(/data-molecular-vph=/g) || []).length, 28);
for (const [status, label] of [['low','Detectado bajo'], ['medium','Detectado medio'], ['high','Detectado alto']]) {
  data.fungi.candida_albicans = status;
  assert.match(panel.fungiReport(data, panel.defaultGroups), new RegExp(label));
}
const groups = {A:['6','16','26','40','53','56','58','73'], B:['11','18','33','43','44','51','59'], C:['35','45','54','68','81','82'], D:['31','39','42','52','61','66','83']};
for (const [group, ids] of Object.entries(groups)) {
  const curve = panel.defaultGroups[group];
  for (const id of ids) {
    data.vph = {[id]: '18,5'};
    const html = panel.vphReport(data, panel.defaultGroups);
    assert.ok(html.includes(curve.label), `${id}: reference group ${group}`);
    const expected = Math.max(0.01, Math.pow(10, -((curve.b + 18.5) / curve.m))).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2});
    assert.ok(html.includes(expected), `${id}: same VPH formula`);
  }
}
data.vph = {16:'ND'};
assert.ok(panel.vphReport(data, panel.defaultGroups).includes('Los 28 genotipos fueron estudiados'));
console.log('14 fungi, full detection labels, 28 VPH genotypes, groups and calculations: OK');
