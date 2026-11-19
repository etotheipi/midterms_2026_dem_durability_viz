export const YEARS = [2028, 2030, 2032];
export const DEFAULT_ENABLED_YEARS = [true, true, false];
// Illustrative national reference supplied in the brief, not a state baseline.
export const APPROX_2024_SHIFT = -14;
export const SCALES = {
  additive: {min: -25, max: 10, step: 1, tick: 1, baseline: 0, suggested: [-7, -15, -15]},
  interpolation: {min: -50, max: 150, step: 1, tick: 5, baseline: 100, suggested: [50, 0, 0]}
};

export function projectedMargin(state, mode, value) {
  return mode === 'additive'
    ? state.y2026.margin + value
    : state.y2024.margin + (value / 100) * (state.y2026.margin - state.y2024.margin);
}

export function isUp(seat, year, tennesseeSpecial = true) {
  return seat.class === ({2028: 3, 2030: 1, 2032: 2})[year]
    || (year === 2028 && tennesseeSpecial && seat.id === 'TN-1');
}

export function countSeats(seats) {
  return seats.reduce((n, s) => { n[s.party]++; return n; }, {D: 0, R: 0, T: 0});
}

export function election(data, previousSeats, year, mode, value, tennesseeSpecial = true) {
  const states = new Map(data.states.map(s => [s.code, s]));
  let contestedD = 0, contestedR = 0, contestedT = 0, flipsD = 0, flipsR = 0;
  const races = [];
  const seats = previousSeats.map(seat => {
    if (!isUp(seat, year, tennesseeSpecial)) return {...seat};
    const locked = year === 2028 && seat.id === 'AK-3';
    const margin = projectedMargin(states.get(seat.state), mode, value);
    const party = locked ? 'R' : Math.abs(margin) < 1e-9 ? 'T' : margin > 0 ? 'D' : 'R';
    if (party === 'D') { contestedD++; if (seat.party !== 'D') flipsD++; }
    if (party === 'R') { contestedR++; if (seat.party === 'D') flipsR++; }
    if (party === 'T') contestedT++;
    races.push({...seat, party, before: seat.party, margin, locked, special: year === 2028 && seat.id === 'TN-1'});
    return {...seat, party};
  });
  const counts = countSeats(seats);
  return {seats, ...counts, races, contestedD, contestedR, contestedT, flipsD, flipsR,
    heldD: counts.D - contestedD, heldR: counts.R - contestedR,
    heldT: counts.T - contestedT, up: races.length};
}

export function scenario(data, mode, values, tennesseeSpecial = true, enabledYears = [true, true, true]) {
  let previous = data.seats;
  let unlocked = true;
  return YEARS.map((year, i) => {
    const base = previous;
    const enabled = i === 0 || enabledYears[i] !== false;
    const active = unlocked && enabled;
    const selected = active && values[i] !== null;
    const result = selected ? election(data, base, year, mode, values[i], tennesseeSpecial) : null;
    if (result) previous = result.seats;
    if (!selected) unlocked = false;
    return {year, enabled, active, selected, base, result};
  });
}

export function majorityLabel(result) {
  if (result.D >= 51) return 'Democratic majority';
  if (result.R >= 51) return 'Republican majority';
  if (result.T) return 'Majority unresolved';
  return '50–50 Senate';
}
