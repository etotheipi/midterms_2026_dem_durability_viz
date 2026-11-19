import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {YEARS, projectedMargin, election, scenario, isUp, countSeats, majorityLabel} from '../dist/model.js';

const data = JSON.parse(fs.readFileSync(new URL('../dist/election-data.json', import.meta.url)));

test('starting roster has two seats per state, correct election classes and a 56-seat D caucus', () => {
  assert.equal(data.states.length,50);
  assert.equal(data.seats.length,100);
  assert.equal(new Set(data.seats.map(s=>s.id)).size,100);
  for(const st of data.states) {
    assert.equal(data.seats.filter(s=>s.state===st.code).length,2,st.code);
    assert.ok(Number.isFinite(st.y2024.margin));
    assert.ok(Number.isFinite(st.y2026.margin));
    assert.ok(st.y2024.dVotes+st.y2024.rVotes>0);
    assert.ok(st.y2026.dVotes+st.y2026.rVotes>0);
  }
  assert.deepEqual(countSeats(data.seats),{D:56,R:44,T:0});
  assert.deepEqual([1,2,3].map(c=>data.seats.filter(s=>s.class===c).length),[33,33,34]);
});

test('interpolation exactly reproduces both state endpoints and extrapolates per state', () => {
  for(const st of data.states) {
    assert.equal(projectedMargin(st,'interpolation',0),st.y2024.margin);
    assert.ok(Math.abs(projectedMargin(st,'interpolation',100)-st.y2026.margin)<1e-10);
    assert.ok(Math.abs(projectedMargin(st,'interpolation',150)-(1.5*st.y2026.margin-.5*st.y2024.margin))<1e-10);
    assert.ok(Math.abs(projectedMargin(st,'interpolation',-50)-(1.5*st.y2024.margin-.5*st.y2026.margin))<1e-10);
  }
});

test('the requested illustrative path is calculated as 57, 52, then 42', () => {
  assert.deepEqual(scenario(data,'additive',[-7,-15,-15]).map(p=>p.result.D),[57,52,42]);
});

test('later panels unlock sequentially and an earlier edit changes their holdovers', () => {
  assert.deepEqual(scenario(data,'additive',[null,null,null]).map(p=>p.active),[true,false,false]);
  assert.deepEqual(scenario(data,'additive',[-7,null,null]).map(p=>p.active),[true,true,false]);
  const low=scenario(data,'additive',[-25,-15,-15]);
  const high=scenario(data,'additive',[10,-15,-15]);
  assert.notEqual(low[1].result.heldD,high[1].result.heldD);
  // The 2030 margin setting itself always refers to 2026.
  assert.deepEqual(low[1].result.races.map(r=>r.margin),high[1].result.races.map(r=>r.margin));
});

test('switched-off years do not contribute results or allow later elections to bypass them', () => {
  const values=[-7,-15,-15];
  const no2032=scenario(data,'additive',values,true,[true,true,false]);
  assert.deepEqual(no2032.map(p=>p.enabled),[true,true,false]);
  assert.deepEqual(no2032.map(p=>p.result?.D??null),[57,52,null]);
  const no2030=scenario(data,'additive',values,true,[true,false,true]);
  assert.deepEqual(no2030.map(p=>p.active),[true,false,false]);
  assert.deepEqual(no2030.map(p=>p.result?.D??null),[57,null,null]);
  assert.deepEqual(values,[-7,-15,-15]);
  assert.deepEqual(scenario(data,'additive',values,true,[true,true,true]).map(p=>p.result.D),[57,52,42]);
});

test('only contested seats change; every cycle keeps all 100 seats', () => {
  for(const mode of ['additive','interpolation']) {
    const settings=mode==='additive'?[-25,-7,0,10]:[-50,0,50,100,150];
    for(const n of settings) {
      const panels=scenario(data,mode,[n,n,n]);
      for(const p of panels) {
        assert.equal(p.result.D+p.result.R+p.result.T,100);
        for(const seat of p.base.filter(s=>!isUp(s,p.year))) {
          assert.equal(p.result.seats.find(s=>s.id===seat.id).party,seat.party,seat.id);
        }
      }
    }
  }
});

test('Alaska exception affects Murkowski in 2028, and Peltola is contested in 2032', () => {
  const p=scenario(data,'additive',[10,10,-25]);
  assert.equal(p[0].result.races.find(r=>r.id==='AK-3').party,'R');
  assert.ok(!p[0].result.races.some(r=>r.id==='AK-2'));
  assert.ok(!p[1].result.races.some(r=>r.id==='AK-2'));
  assert.equal(p[2].result.races.find(r=>r.id==='AK-2').party,'R');
});

test('Ohio and Florida 2026 special winners return in 2028; expected TN special is optional', () => {
  for(const state of ['OH','FL']) assert.ok(isUp(data.seats.find(s=>s.id===state+'-3'),2028));
  const tn=data.seats.find(s=>s.id==='TN-1');
  assert.ok(isUp(tn,2028,true));
  assert.ok(!isUp(tn,2028,false));
  assert.ok(isUp(tn,2030,true));
  assert.equal(election(data,data.seats,2028,'additive',0,true).up,35);
  assert.equal(election(data,data.seats,2028,'additive',0,false).up,34);
});

test('100% interpolation and zero uniform shift produce identical seat paths', () => {
  const a=scenario(data,'additive',[0,0,0]);
  const b=scenario(data,'interpolation',[100,100,100]);
  assert.deepEqual(a.map(p=>p.result.seats),b.map(p=>p.result.seats));
});

test('an exact zero is unresolved and is not silently assigned to Republicans', () => {
  const clone=structuredClone(data);
  clone.states.find(s=>s.code==='AZ').y2026.margin=7;
  const p=scenario(clone,'additive',[-7,-15,-15]);
  assert.equal(p[0].result.races.find(r=>r.id==='AZ-3').party,'T');
  assert.equal(p[0].result.T,1);
  assert.equal(p[1].result.T,1);
  assert.equal(p[2].result.T,1);
  assert.equal(majorityLabel({D:50,R:49,T:1}),'Majority unresolved');
  assert.equal(majorityLabel({D:50,R:50,T:0}),'50–50 Senate');
});

test('uniform-shift seat totals are monotone across the full slider range', () => {
  for(const previous of [-25,-7,0,10]) {
    const bases=scenario(data,'additive',[previous,previous,previous]);
    for(let i=0;i<3;i++) {
      let prior=-1;
      for(let shift=-25;shift<=10;shift++) {
        const result=election(data,bases[i].base,YEARS[i],'additive',shift);
        assert.ok(result.D>=prior);
        prior=result.D;
      }
    }
  }
});
