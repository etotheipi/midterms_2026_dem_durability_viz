import {YEARS, SCALES, DEFAULT_ENABLED_YEARS, APPROX_2024_SHIFT, countSeats, election, scenario, majorityLabel} from './model.js';

const $ = id => document.getElementById(id);
let data;
let mode = 'additive';
let enabledYears = DEFAULT_ENABLED_YEARS.slice();
const savedValues = {additive: [null, null, null], interpolation: [null, null, null]};
let tennesseeSpecial = true;
let panels = [];
let drag = null;
let toastTimer;

const signed = n => n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
const formatSetting = n => mode === 'additive' ? `${signed(n)} pts` : `${n}%`;
const marginLabel = n => Math.abs(n) < 0.00001 ? 'Even' : `${n > 0 ? 'D' : 'R'}+${Math.abs(n).toFixed(1)}`;
const seatTotals = result => `${result.D} D / ${result.R} R${result.T ? ` / ${result.T} tied` : ''}`;
const percentY = n => (SCALES[mode].max - n) / (SCALES[mode].max - SCALES[mode].min) * 100;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const values = () => savedValues[mode];
const clamp = v => Math.max(SCALES[mode].min, Math.min(SCALES[mode].max, Math.round(v)));
const signClass = v => v > 0 ? 'positive' : v < 0 ? 'negative' : 'zero';
const enabledPrefix = () => enabledYears.map((on,i) => on && enabledYears.slice(0,i).every(Boolean));

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
  const customYears = enabledYears.some((on,i) => on !== DEFAULT_ENABLED_YEARS[i]);
  if (values().some(v => v !== null) || mode !== 'additive' || !tennesseeSpecial || customYears) {
    url.searchParams.set('mode', mode);
    values().forEach((v, i) => {if (v !== null) url.searchParams.set(String(YEARS[i]), String(v));});
    // Explicit flags preserve disabled years even when their settings are retained.
    url.searchParams.set('years', YEARS.filter((_,i) => enabledYears[i]).join(','));
    if (!tennesseeSpecial) url.searchParams.set('tn', '0');
  }
  history.replaceState(null, '', url);
}

function readURL() {
  const params = new URL(location.href).searchParams;
  if (params.get('mode') === 'interpolation') mode = 'interpolation';
  enabledYears = DEFAULT_ENABLED_YEARS.slice();
  if (params.has('years')) {
    const included = params.get('years').split(',');
    enabledYears = YEARS.map((year,i) => i === 0 || included.includes(String(year)));
  } else if (params.has('2032')) {
    // Scenario links created before year toggles retain their original behavior.
    enabledYears[2] = true;
  }
  let priorSet = true;
  YEARS.forEach((year, i) => {
    const val = params.get(String(year));
    if (priorSet && val !== null && val.trim() !== '' && Number.isFinite(Number(val))) values()[i] = clamp(Number(val));
    else priorSet = false;
  });
  tennesseeSpecial = params.get('tn') !== '0';
  $('tennessee-special').checked = tennesseeSpecial;
}

function renderPartyTotals(result, extraClass = '') {
  const emphasis = party => !result ? '' : result[party] > 50 ? 'is-majority' : result[party] < 50 ? 'is-minority' : '';
  return `<div class="panel-total ${extraClass}" role="group" aria-label="${result ? `${result.D} Democratic caucus seats, ${result.R} Republican seats${result.T ? `, ${result.T} tied` : ''}` : 'Seat totals not selected'}">
    <span class="party-total party-total-d ${emphasis('D')}"><span class="d-total">${result ? result.D : '—'}</span><small>D</small></span>
    <span class="total-separator" aria-hidden="true">/</span>
    <span class="party-total party-total-r ${emphasis('R')}"><span class="r-total">${result ? result.R : '—'}</span><small>R</small></span>
    ${result?.T ? `<small class="tied-total">+ ${result.T} tied</small>` : ''}
  </div>`;
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
    const line24 = mode === 'interpolation' ? value === 0 : value === APPROX_2024_SHIFT;
    const color = row ? (row.D >= 51 ? 'd' : row.R >= 51 ? 'r' : 't') : 't';
    const width = row ? Math.max(8,Math.min(100,(row.D - 25)/45*100)) : 40 + (value - scale.min)/(scale.max - scale.min)*40;
    const text = mode === 'additive' ? signed(value) : `${signed(value)}%`;
    const waterline = line26 ? 'Same as 2026' : mode === 'additive' ? '2024 (approx)' : 'Same as 2024';
    const unavailable = panel.enabled ? 'choose the previous election first' : 'year switched off';
    rows.push(`<button class="scenario-row ${color} ${value % (mode === 'additive' ? 5 : 25) === 0 ? 'major-tick' : ''} ${line26 || line24 ? 'waterline' : ''} ${line26 ? 'waterline-2026' : ''} ${line24 ? 'waterline-2024' : ''}" style="top:${percentY(value)}%;height:${640/((scale.max-scale.min)/scale.tick)}px" data-row-index="${index}" data-value="${value}" tabindex="-1" ${panel.active ? '' : 'disabled'} aria-label="${panel.year}, ${mode === 'additive' ? signed(value)+' percentage points from 2026' : value+' percent of the state shift'}, ${row ? row.D+' Democratic seats'+(row.T ? ', '+row.T+' tied' : '') : unavailable}"><span class="tick-value ${signClass(value)}">${text}</span><span class="row-bar"><i style="width:${width}%"></i></span><span class="tick-seats">${row ? row.D : '—'}${row?.T ? '*' : ''}</span>${line26 || line24 ? `<span class="waterline-label">${waterline}</span>` : ''}</button>`);
  }
  const marker = panel.active ? `<div class="selection-marker ${panel.selected ? '' : 'preview-marker'}" style="top:${percentY(setting)}%"><span class="selection-value ${signClass(setting)}">${signed(setting)}${mode === 'interpolation' ? '%' : ''}</span><span class="selection-grip" aria-hidden="true"><i></i><i></i></span><span class="selection-seat">${result ? result.D : election(data,panel.base,panel.year,mode,setting,tennesseeSpecial).D}</span></div>` : '';
  const threshold = panel.active ? findThreshold(panel) : null;
  let foot = panel.active ? `<strong>Carried forward: ${baseline.heldD} D / ${baseline.heldR} R${baseline.heldT ? ` / ${baseline.heldT} tied` : ''}</strong> · ${baseline.up} seats contested.<br>` : `${baseline.up} seats contested.<br>`;
  foot += panel.active ? threshold !== null ? `51+ D seats at ${formatSetting(threshold)}${mode === 'additive' ? ' or higher.' : ' (lowest qualifying setting).'} ` : 'No D majority within this range.' : panel.enabled ? `Waiting for the ${YEARS[index-1]} selection.` : 'Not included in this scenario.';
  const previousEnabled = index < 2 || enabledYears[index-1];
  const blockedMessage = !panel.enabled
    ? `<strong>${panel.year} is off.</strong>Use the toggle above to include it.`
    : !previousEnabled
      ? `<strong>First, turn on ${YEARS[index-1]}.</strong>Its election must be included<br>before choosing ${panel.year}.`
      : `<strong>First, choose ${YEARS[index-1]}.</strong>That seat composition is used<br>for this election.`;
  return `<article class="election-panel ${panel.active ? '' : 'locked'} ${panel.enabled ? '' : 'omitted'}" aria-labelledby="year-${panel.year}">
    <div class="panel-top">
    <div class="panel-year"><div class="panel-year-title"><h3 id="year-${panel.year}">${panel.year}</h3><span class="class-label">Class ${{2028:'III',2030:'I',2032:'II'}[panel.year]}${panel.year === 2028 && tennesseeSpecial ? ' + TN special' : ''}</span></div>${index > 0 ? `<button type="button" class="year-toggle" role="switch" aria-checked="${panel.enabled}" aria-label="Include ${panel.year} election" data-year-toggle="${index}"><span class="switch-track" aria-hidden="true"><i></i></span><span>${panel.enabled ? 'On' : 'Off'}</span></button>` : ''}</div>
    ${renderPartyTotals(result)}
    <div class="panel-status ${result?.D >= 51 ? 'has-majority' : result?.R >= 51 ? 'has-republican' : ''}">${result ? majorityLabel(result) : !panel.enabled ? 'Excluded from this scenario' : panel.active ? 'Select a margin setting' : !previousEnabled ? `Turn on ${YEARS[index-1]} first` : `Set ${YEARS[index-1]} to unlock`}</div>
    <div class="panel-input"><label class="input-wrap"><span class="sr-only">${panel.year} D-minus-R margin setting ${mode === 'additive' ? 'in points relative to 2026' : 'in percent of the state shift'}</span><input type="number" inputmode="numeric" min="${scale.min}" max="${scale.max}" step="1" value="${panel.selected ? setting : ''}" placeholder="${scale.suggested[index]}" data-number="${index}" ${panel.active ? '' : 'disabled'}><span>${mode === 'additive' ? 'pts' : '%'}</span></label>${panel.selected ? `<span class="selected-label">${formatSetting(setting)} selected</span>` : `<button class="choose-button" data-choose="${index}" ${panel.active ? '' : 'disabled'}>Set ${formatSetting(scale.suggested[index])}</button>`}</div>
    <div class="axis-heading"><span>${mode === 'additive' ? 'Shift vs. 2026' : 'Interpolation level'}</span><span>D seats</span></div>
    </div>
    <div class="chart-body"><div class="row-field">${rows.join('')}${panel.active ? `<div class="slider-rail" data-slider="${index}" role="slider" tabindex="0" aria-label="${panel.year} vote-margin setting" aria-orientation="vertical" aria-valuemin="${scale.min}" aria-valuemax="${scale.max}" aria-valuenow="${setting}" aria-valuetext="${panel.selected ? formatSetting(setting) : 'Not selected. Press Enter to use '+formatSetting(setting)}"></div>` : ''}${marker}</div>${panel.active ? '' : `<div class="locked-overlay ${panel.enabled ? '' : 'off-overlay'}">${blockedMessage}</div>`}</div>
    <div class="panel-foot">${foot}</div>
  </article>`;
}

function renderBaseline() {
  const totals = countSeats(data.seats);
  const baseline = SCALES[mode].baseline;
  return `<article class="election-panel baseline-panel" aria-labelledby="year-2026">
    <div class="panel-top">
      <div class="panel-year"><div class="panel-year-title"><h3 id="year-2026">2026</h3><span class="class-label">Starting point</span></div></div>
      ${renderPartyTotals(totals)}
      <div class="panel-status">Starting seat composition</div>
    </div>
    <div class="chart-body"><div class="row-field">
      <div class="baseline-waterline waterline-2026" style="top:${percentY(baseline)}%" data-baseline-value="${baseline}">
        <div class="baseline-results-heading">Final 2026 Results</div>
        <span class="waterline-label">Dem 2026 Line</span>
        ${renderPartyTotals(totals, 'baseline-result-pair')}
      </div>
    </div></div>
  </article>`;
}

function directionColumn() {
  return `<aside class="direction-column" aria-label="Up: higher D-minus-R margin. Down: lower D-minus-R margin."><div class="direction-spacer"></div><div class="chart-body"><div class="direction-field"><div class="direction-dem"><span class="direction-arrow" aria-hidden="true">↑</span><span class="direction-label">+Democrat</span></div><div class="direction-rep"><span class="direction-label">+Republican</span><span class="direction-arrow" aria-hidden="true">↓</span></div></div></div></aside>`;
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
    $('summary-text').innerHTML = 'Select a <strong>2028</strong> margin setting to see the modeled Democratic and Republican seat totals. Include later elections to compare how the seat composition changes over time.';
  } else {
    const assumptions = selected.map((p,i) => {
      const v = values()[i];
      if (mode === 'interpolation') return `<strong>${v}%</strong> in ${p.year}`;
      return `<strong>${signed(v)} points</strong> in ${p.year}`;
    });
    const join = list => list.length < 2 ? list[0] : list.slice(0,-1).join(', ')+(list.length > 2 ? ', and ' : ' and ')+list.at(-1);
    const outcomes = selected.map(p => `<strong>${seatTotals(p.result)} in ${p.year}</strong>`);
    $('summary-text').innerHTML = `With ${mode === 'additive' ? 'margin shifts of ' : 'state interpolation levels of '}${join(assumptions)}${mode === 'additive' ? ' relative to 2026' : ''}, the modeled Senate totals are ${join(outcomes)}.`;
  }
  $('summary-cards').style.setProperty('--summary-years',panels.filter(p => p.enabled).length);
  $('summary-cards').innerHTML = panels.filter(p => p.enabled).map(p => `<div class="summary-card ${p.result ? '' : 'empty'}"><div class="summary-card-top"><b>${p.year}</b><span>${p.result ? formatSetting(values()[YEARS.indexOf(p.year)]) : 'No selection'}</span></div><div class="summary-seat-number"><span>${p.result ? p.result.D : '—'} <small>D</small></span><span class="summary-seat-r">${p.result ? p.result.R : '—'} <small>R</small></span>${p.result?.T ? `<small>${p.result.T} tied</small>` : ''}</div><div class="seat-strip">${p.result ? `<i style="width:${p.result.D}%"></i><i class="r" style="width:${p.result.R}%"></i>` : ''}</div></div>`).join('');
  const last = selected.at(-1);
  if (!last) $('durability-note').textContent = 'The 2026 Class II winners are not up for regular election again until 2032. Ohio and Florida’s 2026 special elections filled Class III seats, which return to the ballot in 2028.';
  else {
    $('durability-note').textContent = `${last.year}: ${last.result.heldD} D seats carried forward + ${last.result.contestedD} D seats assigned by the model = ${last.result.D} D; ${last.result.heldR} R seats carried forward + ${last.result.contestedR} R seats assigned by the model = ${last.result.R} R${last.result.T ? '; '+last.result.T+' unresolved ties' : ''}. An outright majority requires 51 seats. Control of a 50–50 chamber depends on the vice president.`;
  }
}

function renderAudit() {
  const year = Number($('audit-year').value);
  const panel = panels.find(p => p.year === year);
  if (!panel.result) {
    $('audit-description').textContent = `Select a ${year} margin setting to see the individual races behind the modeled seat totals.`;
    $('race-table').innerHTML = `<tr><td colspan="5" class="empty-table">${panel.active ? 'Choose a margin setting on the '+year+' slider.' : 'Set the earlier election sliders to unlock '+year+'.'}</td></tr>`;
    return;
  }
  const result = panel.result;
  const states = new Map(data.states.map(s => [s.code,s]));
  let races = result.races.slice().sort((a,b) => Math.abs(a.margin)-Math.abs(b.margin));
  if ($('flips-only').checked) races = races.filter(r => r.before !== r.party);
  $('audit-description').textContent = `Modeled races: ${result.contestedD} D / ${result.contestedR} R${result.contestedT ? ' / '+result.contestedT+' tied' : ''}. Seats carried forward: ${result.heldD} D / ${result.heldR} R${result.heldT ? ' / '+result.heldT+' tied' : ''}. Senate total: ${seatTotals(result)}. Party changes: ${result.flipsD} to D; ${result.flipsR} to R. Closest modeled margins first.`;
  $('race-table').innerHTML = races.length ? races.map(r => {
    const st = states.get(r.state);
    const marginCell = (record,year) => `<a class="source-margin ${record.margin < 0 ? 'negative' : ''}" href="${record.url}" target="_blank" rel="noreferrer" aria-label="${st.name} ${year} ${marginLabel(record.margin)}, ${record.type}, open source">${marginLabel(record.margin)}<small>${record.type}${record.note ? ' · independent proxy' : ''}</small></a>`;
    const party = r.party === 'T' ? 'Tied' : r.party === 'D' ? 'Democratic' : 'Republican';
    return `<tr><td class="state-cell">${esc(st.name)}${r.special ? ' <span class="badge tie">Special</span>' : ''}<small>${esc(r.name)} · Class ${{1:'I',2:'II',3:'III'}[r.class]}</small></td><td>${marginCell(st.y2024,2024)}</td><td>${marginCell(st.y2026,2026)}</td><td class="margin ${r.margin < 0 ? 'negative' : ''}">${r.locked ? 'Fixed R' : marginLabel(r.margin)}${r.locked ? '<small class="result-flip">Murkowski exception</small>' : ''}</td><td><span class="badge ${r.party === 'R' ? 'r' : r.party === 'T' ? 'tie' : ''}">${party}</span><span class="result-flip">${r.party === 'T' ? 'Unresolved' : r.before === r.party ? 'Hold' : 'Flip from '+r.before}</span></td></tr>`;
  }).join('') : '<tr><td class="empty-table" colspan="5">No seats flip in this scenario.</td></tr>';
}

function render() {
  panels = scenario(data, mode, values(), tennesseeSpecial, enabledYears);
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.mode === mode)));
  $('mode-description').textContent = mode === 'additive'
    ? 'Apply the same change to every state’s D-minus-R margin from 2026. Each election has its own setting; earlier results determine which seats carry forward.'
    : 'Set a percentage of each state’s D-minus-R margin change from 2024 to 2026. 0% matches 2024, 100% matches 2026; values outside that range extend the change linearly.';
  const examples = SCALES[mode].suggested.filter((_,i) => enabledPrefix()[i]);
  $('example').textContent = 'Example: '+examples.map(v => mode === 'additive' ? signed(v) : v+'%').join(' / ');
  document.querySelector('.chart-heading>span:first-child').innerHTML = `<span class="key-line"></span>${mode === 'additive' ? 'Same as 2026 · 2024 (approx) at −14 pts' : 'Same as 2026 at 100% · Same as 2024 at 0%'}`;
  $('waterline-note').hidden = mode !== 'additive';
  $('timeline').innerHTML = renderBaseline()+directionColumn()+panels.map(renderPanel).join('');
  [...$('audit-year').options].forEach(option => {option.disabled = !panels.find(p => p.year === Number(option.value)).enabled;});
  if ($('audit-year').selectedOptions[0].disabled) $('audit-year').value = '2028';
  renderSummary();
  renderAudit();
  updateURL();
}

document.addEventListener('click', e => {
  const yearToggle = e.target.closest('[data-year-toggle]');
  if (yearToggle) {
    const index = Number(yearToggle.dataset.yearToggle);
    enabledYears[index] = !enabledYears[index];
    render();
    document.querySelector(`[data-year-toggle="${index}"]`)?.focus({preventScroll:true});
    return;
  }
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

$('example').addEventListener('click',() => {const prefix=enabledPrefix();savedValues[mode]=values().map((v,i) => prefix[i] ? SCALES[mode].suggested[i] : v);render();});
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
