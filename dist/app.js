import {YEARS, SCALES, projectedMargin, election, scenario, majorityLabel, isUp} from './model.js';

const $ = id => document.getElementById(id);
let data;
let mode = 'additive';
const savedValues = {additive: [null, null, null], interpolation: [null, null, null]};
let tennesseeSpecial = true;
let panels = [];
let drag = null;
let toastTimer;

const signed = n => n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
const formatSetting = n => mode === 'additive' ? `${signed(n)} pts` : `${n}%`;
const marginLabel = n => Math.abs(n) < 0.00001 ? 'Even' : `${n > 0 ? 'D' : 'R'}+${Math.abs(n).toFixed(1)}`;
const percentY = n => (SCALES[mode].max - n) / (SCALES[mode].max - SCALES[mode].min) * 100;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const values = () => savedValues[mode];
const clamp = v => Math.max(SCALES[mode].min, Math.min(SCALES[mode].max, Math.round(v)));

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

function setValue(index, raw, focusSlider = false) {
  if (!panels[index]?.active || !Number.isFinite(Number(raw))) return;
  values()[index] = clamp(Number(raw));
  render();
  if (focusSlider) document.querySelector(`[data-slider="${index}"]`)?.focus({preventScroll:true});
}

function updateURL() {
  const url = new URL(location.href);
  url.search = '';
  if (values().some(v => v !== null) || mode !== 'additive' || !tennesseeSpecial) {
    url.searchParams.set('mode', mode);
    values().forEach((v, i) => {if (v !== null) url.searchParams.set(String(YEARS[i]), String(v));});
    if (!tennesseeSpecial) url.searchParams.set('tn', '0');
  }
  history.replaceState(null, '', url);
}

function readURL() {
  const params = new URL(location.href).searchParams;
  if (params.get('mode') === 'interpolation') mode = 'interpolation';
  let priorSet = true;
  YEARS.forEach((year, i) => {
    const val = params.get(String(year));
    if (priorSet && val !== null && val.trim() !== '' && Number.isFinite(Number(val))) values()[i] = clamp(Number(val));
    else priorSet = false;
  });
  tennesseeSpecial = params.get('tn') !== '0';
  $('tennessee-special').checked = tennesseeSpecial;
}

function renderPanel(panel, index) {
  const scale = SCALES[mode];
  const result = panel.result;
  const setting = values()[index] ?? scale.suggested[index];
  const baseline = election(data, panel.base, panel.year, mode, scale.baseline, tennesseeSpecial);
  const rows = [];
  for (let value = scale.max; value >= scale.min; value -= scale.tick) {
    const row = panel.active ? election(data, panel.base, panel.year, mode, value, tennesseeSpecial) : null;
    const line26 = value === scale.baseline;
    const line24 = mode === 'interpolation' && value === 0;
    const color = row ? (row.D >= 51 ? 'd' : row.R >= 51 ? 'r' : 't') : 't';
    const width = row ? Math.max(8,Math.min(100,(row.D - 25)/45*100)) : 40 + (value - scale.min)/(scale.max - scale.min)*40;
    const text = mode === 'additive' ? signed(value) : `${value}%`;
    rows.push(`<button class="scenario-row ${color} ${value % (mode === 'additive' ? 5 : 25) === 0 ? 'major-tick' : ''} ${line26 || line24 ? 'waterline' : ''} ${line24 ? 'waterline-2024' : ''}" style="top:${percentY(value)}%;height:${640/((scale.max-scale.min)/scale.tick)}px" data-row-index="${index}" data-value="${value}" tabindex="-1" ${panel.active ? '' : 'disabled'} aria-label="${panel.year}, ${mode === 'additive' ? signed(value)+' percentage points from 2026' : value+' percent of the state shift'}, ${row ? row.D+' Democratic seats'+(row.T ? ', '+row.T+' tied' : '') : 'choose the previous election first'}"><span class="tick-value">${text}</span><span class="row-bar"><i style="width:${width}%"></i></span><span class="tick-seats">${row ? row.D : '—'}${row?.T ? '*' : ''}</span>${line26 || line24 ? `<span class="waterline-label">${line26 ? '2026' : '2024'}</span>` : ''}</button>`);
  }
  const marker = panel.active ? `<div class="selection-marker ${panel.selected ? '' : 'preview-marker'}" style="top:${percentY(setting)}%"><span>${mode === 'additive' ? signed(setting) : setting+'%'}</span><span class="selection-grip" aria-hidden="true"><i></i><i></i></span><span class="selection-seat">${result ? result.D : election(data,panel.base,panel.year,mode,setting,tennesseeSpecial).D}${!panel.selected ? ' ?' : ''}</span></div>` : '';
  const threshold = panel.active ? findThreshold(panel) : null;
  let foot = panel.active ? `<strong>${baseline.heldD} Democratic holdovers</strong> · ${baseline.up} seats on the ballot.<br>` : `${baseline.up} seats on the ballot.<br>`;
  foot += panel.active ? threshold !== null ? `51+ D seats at ${formatSetting(threshold)}${mode === 'additive' ? ' or better.' : ' (lowest shown setting).'} ` : 'No outright D majority in this range.' : `Waiting for your ${YEARS[index-1]} selection.`;
  return `<article class="election-panel ${panel.active ? '' : 'locked'}" aria-labelledby="year-${panel.year}">
    <div class="panel-year"><h3 id="year-${panel.year}">${panel.year}</h3><span class="class-label">Class ${{2028:'III',2030:'I',2032:'II'}[panel.year]}${panel.year === 2028 && tennesseeSpecial ? ' + TN special' : ''}</span></div>
    <div class="panel-total"><span class="d-total">${result ? result.D : '—'}</span><small>D</small><span class="r-total">${result ? result.R+' R' : ''}</span>${result?.T ? `<small>+ ${result.T} tied</small>` : ''}</div>
    <div class="panel-status ${result?.D >= 51 ? 'has-majority' : result?.R >= 51 ? 'has-republican' : ''}">${result ? majorityLabel(result) : panel.active ? 'Choose your performance below' : `Set ${YEARS[index-1]} to unlock`}</div>
    <div class="panel-input"><label class="input-wrap"><span class="sr-only">${panel.year} performance ${mode === 'additive' ? 'in points relative to 2026' : 'in percent of the state shift'}</span><input type="number" inputmode="numeric" min="${scale.min}" max="${scale.max}" step="1" value="${panel.selected ? setting : ''}" placeholder="${scale.suggested[index]}" data-number="${index}" ${panel.active ? '' : 'disabled'}><span>${mode === 'additive' ? 'pts' : '%'}</span></label>${panel.selected ? `<span class="selected-label">${formatSetting(setting)} selected</span>` : `<button class="choose-button" data-choose="${index}" ${panel.active ? '' : 'disabled'}>Set ${formatSetting(scale.suggested[index])}</button>`}</div>
    <div class="axis-heading"><span>${mode === 'additive' ? 'Shift vs. 2026' : 'State shift retained'}</span><span>D seats</span></div>
    <div class="chart-body"><div class="row-field">${rows.join('')}${panel.active ? `<div class="slider-rail" data-slider="${index}" role="slider" tabindex="0" aria-label="${panel.year} Democratic performance" aria-orientation="vertical" aria-valuemin="${scale.min}" aria-valuemax="${scale.max}" aria-valuenow="${setting}" aria-valuetext="${panel.selected ? formatSetting(setting) : 'Not selected. Press Enter to use '+formatSetting(setting)}"></div>` : ''}${marker}</div>${panel.active ? '' : `<div class="locked-overlay"><span class="lock-icon" aria-hidden="true"><svg width="17" height="19" viewBox="0 0 17 19" fill="none"><rect x="2.5" y="8.5" width="12" height="8" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 8.5V5a3.5 3.5 0 0 1 7 0v3.5" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 12v2" stroke="currentColor" stroke-width="1.4"/></svg></span><strong>First, choose ${YEARS[index-1]}.</strong>Those winners carry forward<br>into this election.</div>`}</div>
    <div class="panel-foot">${foot}</div>
  </article>`;
}

function findThreshold(panel) {
  const scale = SCALES[mode];
  for (let n = scale.min; n <= scale.max; n++) {
    if (election(data, panel.base, panel.year, mode, n, tennesseeSpecial).D >= 51) return n;
  }
  return null;
}

function renderSummary() {
  const selected = panels.filter(p => p.result);
  if (!selected.length) {
    $('summary-text').innerHTML = 'Start with <strong>2028</strong>. How far could Democratic performance fall before the majority changes hands?';
  } else {
    const assumptions = selected.map((p,i) => {
      const v = values()[i];
      if (mode === 'interpolation') return `<strong>${v}%</strong> of each state’s 2024–2026 shift in ${p.year}`;
      return v < 0 ? `<strong>${Math.abs(v)} points worse</strong> in ${p.year}` : v > 0 ? `<strong>${v} points better</strong> in ${p.year}` : `<strong>the same</strong> in ${p.year}`;
    });
    const join = list => list.length < 2 ? list[0] : list.slice(0,-1).join(', ')+(list.length > 2 ? ', and ' : ' and ')+list.at(-1);
    const outcomes = selected.map(p => `<strong>${p.result.D} seats in ${p.year}</strong>${p.result.T ? ` (${p.result.T} tied)` : ''}`);
    $('summary-text').innerHTML = `If Democrats perform ${mode === 'interpolation' ? 'at ' : ''}${join(assumptions)}${mode === 'additive' ? ', relative to 2026,' : ','} the Democratic caucus would hold ${join(outcomes)}.`;
  }
  $('summary-cards').innerHTML = panels.map((p,i) => `<div class="summary-card ${p.result ? '' : 'empty'}"><div class="summary-card-top"><b>${p.year}</b><span>${p.result ? formatSetting(values()[i]) : 'No selection'}</span></div><div class="summary-seat-number">${p.result ? p.result.D : '—'} <small>Democratic seats${p.result?.T ? ' · '+p.result.T+' tied' : ''}</small></div><div class="seat-strip">${p.result ? `<i style="width:${p.result.D}%"></i><i class="r" style="width:${p.result.R}%"></i>` : ''}</div></div>`).join('');
  const last = selected.at(-1);
  if (!last) $('durability-note').textContent = 'The 2026 Class II winners are not up for regular election again until 2032. Ohio and Florida’s 2026 special elections filled Class III seats, which return to the ballot in 2028.';
  else {
    const allMajority = selected.every(p => p.result.D >= 51);
    $('durability-note').textContent = allMajority
      ? `Democrats retain an outright majority in every selected election through ${last.year}. ${last.result.heldD} Democratic seats carry into ${last.year} without facing voters that year; ${last.result.contestedD} more are won in this scenario.`
      : `${last.year}: ${last.result.heldD} Democratic holdovers + ${last.result.contestedD} projected victories = ${last.result.D} Democratic caucus seats${last.result.T ? ', with '+last.result.T+' unresolved ties' : ''}. An outright majority requires 51; control of a 50–50 chamber depends on the vice president.`;
  }
}

function renderAudit() {
  const year = Number($('audit-year').value);
  const panel = panels.find(p => p.year === year);
  if (!panel.result) {
    $('audit-description').textContent = `Select a ${year} performance to see the individual races behind the projected total.`;
    $('race-table').innerHTML = `<tr><td colspan="5" class="empty-table">${panel.active ? 'Choose a performance on the '+year+' slider.' : 'Set the earlier election sliders to unlock '+year+'.'}</td></tr>`;
    return;
  }
  const result = panel.result;
  const states = new Map(data.states.map(s => [s.code,s]));
  let races = result.races.slice().sort((a,b) => Math.abs(a.margin)-Math.abs(b.margin));
  if ($('flips-only').checked) races = races.filter(r => r.before !== r.party);
  $('audit-description').textContent = `${result.contestedD} projected Democratic victories and ${result.heldD} Democratic holdovers make ${result.D} caucus seats. ${result.flipsD} flip${result.flipsD === 1 ? '' : 's'} to D; ${result.flipsR} to R${result.contestedT ? '; '+result.contestedT+' tied' : ''}. Closest modeled races first.`;
  $('race-table').innerHTML = races.length ? races.map(r => {
    const st = states.get(r.state);
    const marginCell = (record,year) => `<a class="source-margin ${record.margin < 0 ? 'negative' : ''}" href="${record.url}" target="_blank" rel="noreferrer" aria-label="${st.name} ${year} ${marginLabel(record.margin)}, ${record.type}, open source">${marginLabel(record.margin)}<small>${record.type}${record.note ? ' · independent proxy' : ''}</small></a>`;
    const party = r.party === 'T' ? 'Tied' : r.party === 'D' ? 'Democratic' : 'Republican';
    return `<tr><td class="state-cell">${esc(st.name)}${r.special ? ' <span class="badge tie">Special</span>' : ''}<small>${esc(r.name)} · Class ${{1:'I',2:'II',3:'III'}[r.class]}</small></td><td>${marginCell(st.y2024,2024)}</td><td>${marginCell(st.y2026,2026)}</td><td class="margin ${r.margin < 0 ? 'negative' : ''}">${r.locked ? 'Fixed R' : marginLabel(r.margin)}${r.locked ? '<small class="result-flip">Murkowski exception</small>' : ''}</td><td><span class="badge ${r.party === 'R' ? 'r' : r.party === 'T' ? 'tie' : ''}">${party}</span><span class="result-flip">${r.party === 'T' ? 'Unresolved' : r.before === r.party ? 'Hold' : 'Flip from '+r.before}</span></td></tr>`;
  }).join('') : '<tr><td class="empty-table" colspan="5">No seats flip in this scenario.</td></tr>';
}

function render() {
  panels = scenario(data, mode, values(), tennesseeSpecial);
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.mode === mode)));
  $('mode-description').textContent = mode === 'additive'
    ? 'Move every state by the same number of margin points from 2026. Each election has its own setting; earlier results determine which seats carry forward.'
    : 'Keep a chosen percentage of each state’s change from 2024 to 2026. 0% matches 2024, 100% matches 2026; outside that range, the state’s trend extends linearly.';
  $('example').textContent = mode === 'additive' ? 'Try −7 / −15 / −15' : 'Try 50% / 0% / 0%';
  document.querySelector('.chart-heading>span:first-child').innerHTML = `<span class="key-line"></span>${mode === 'additive' ? '2026 performance baseline' : 'Waterlines: 2026 at 100% · 2024 at 0%'}`;
  $('timeline').innerHTML = panels.map(renderPanel).join('');
  renderSummary();
  renderAudit();
  updateURL();
}

document.addEventListener('click', e => {
  const row = e.target.closest('[data-row-index]');
  if (row) {setValue(Number(row.dataset.rowIndex),Number(row.dataset.value));return;}
  const choose = e.target.closest('[data-choose]');
  if (choose) {const i = Number(choose.dataset.choose);setValue(i,SCALES[mode].suggested[i]);return;}
  const modeButton = e.target.closest('[data-mode]');
  if (modeButton) {mode=modeButton.dataset.mode;render();}
});

document.addEventListener('change', e => {
  if (e.target.matches('[data-number]')) {
    const index = Number(e.target.dataset.number);
    if (e.target.value === '') {values()[index]=null;for(let i=index+1;i<3;i++)values()[i]=null;render();}
    else setValue(index,Number(e.target.value));
  }
});

document.addEventListener('pointerdown', e => {
  const rail = e.target.closest('[data-slider]');
  if (!rail) return;
  e.preventDefault();
  drag = {index:Number(rail.dataset.slider),rect:rail.getBoundingClientRect(),pointer:e.pointerId};
  document.documentElement.setPointerCapture(e.pointerId);
  applyDrag(e);
});
function applyDrag(e) {
  if (!drag || drag.pointer !== e.pointerId) return;
  const scale = SCALES[mode];
  const fraction = 1 - (e.clientY-drag.rect.top)/drag.rect.height;
  const v = clamp(scale.min+fraction*(scale.max-scale.min));
  if (values()[drag.index] !== v) setValue(drag.index,v);
}
document.addEventListener('pointermove',applyDrag);
document.addEventListener('pointerup',e => {if (drag && drag.pointer===e.pointerId){const i=drag.index;drag=null;document.querySelector(`[data-slider="${i}"]`)?.focus({preventScroll:true});}});
document.addEventListener('pointercancel',() => {drag=null;});
window.addEventListener('blur',() => {drag=null;});

document.addEventListener('keydown', e => {
  const rail = e.target.closest('[data-slider]');
  if (!rail) return;
  const i = Number(rail.dataset.slider);
  let v = values()[i] ?? SCALES[mode].suggested[i];
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v += e.shiftKey ? 5 : 1;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v -= e.shiftKey ? 5 : 1;
  else if (e.key === 'Home') v = SCALES[mode].min;
  else if (e.key === 'End') v = SCALES[mode].max;
  else if (e.key === 'PageUp') v += 5;
  else if (e.key === 'PageDown') v -= 5;
  else if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  setValue(i,v,true);
});

$('example').addEventListener('click',() => {savedValues[mode]=SCALES[mode].suggested.slice();render();});
$('reset').addEventListener('click',() => {savedValues[mode]=[null,null,null];render();notify('Election selections reset.');});
$('tennessee-special').addEventListener('change',e => {tennesseeSpecial=e.target.checked;render();});
$('audit-year').addEventListener('change',renderAudit);
$('flips-only').addEventListener('change',renderAudit);
$('share').addEventListener('click',async () => {
  try {await navigator.clipboard.writeText(location.href);notify('Scenario link copied.');}
  catch {const input=document.createElement('textarea');input.value=location.href;document.body.append(input);input.select();const success=document.execCommand('copy');input.remove();notify(success ? 'Scenario link copied.' : 'Copy the URL in your address bar to share this scenario.');}
});
$('download-data').addEventListener('click',() => {
  const quote = v => '"'+String(v??'').replaceAll('"','""')+'"';
  const rows = [['state','state_name','2024_margin_D_minus_R','2024_source_type','2024_D_side_votes','2024_R_votes','2024_note','2024_source_url','2026_margin_D_minus_R','2026_source_type','2026_D_side_votes','2026_R_votes','2026_note','2026_source_url']];
  for (const st of data.states) rows.push([st.code,st.name,st.y2024.margin,st.y2024.type,st.y2024.dVotes,st.y2024.rVotes,st.y2024.note,st.y2024.url,st.y2026.margin,st.y2026.type,st.y2026.dVotes,st.y2026.rVotes,st.y2026.note,st.y2026.url]);
  const url=URL.createObjectURL(new Blob([rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download='senate-durability-state-baselines-2026-11-18.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('popstate',() => {savedValues.additive=[null,null,null];savedValues.interpolation=[null,null,null];mode='additive';readURL();render();});

try {
  const response=await fetch('./election-data.json');
  if (!response.ok) throw new Error('Election data could not be loaded.');
  data=await response.json();
  $('starting-dots').innerHTML=Array.from({length:100},(_,i)=>`<i class="${i>=56?'r':''}"></i>`).join('');
  readURL();render();
} catch (error) {
  $('timeline').innerHTML='<p style="padding:30px;grid-column:1/-1">Election data could not be loaded. Please reload the page.</p>';
  $('summary-text').textContent='The model is unavailable until the election data loads.';
  console.error(error);
}
