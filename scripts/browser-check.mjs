// Browser QA with Chrome's DevTools protocol; no application dependencies.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=new URL(process.env.BASE_URL ?? 'http://127.0.0.1:4173/').href;
const port=9347;
const chrome=spawn('/usr/bin/google-chrome',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`,'--user-data-dir=/tmp/senate-durability-chrome',
  '--window-size=1440,1200','--no-first-run','--no-default-browser-check','about:blank'
],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try {
  let target;
  for(let i=0;i<50;i++) {
    try {const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=pages.find(p=>p.type==='page');if(target)break;}catch{}
    await sleep(100);
  }
  assert.ok(target,'Chrome started');
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let seq=0;
  const pending=new Map();
  const errors=[];
  ws.addEventListener('message',e=>{
    const message=JSON.parse(e.data);
    if(message.id){const promise=pending.get(message.id);pending.delete(message.id);if(message.error)promise.reject(message.error);else promise.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
    const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const check=(expr,message)=>evaluate(expr).then(value=>assert.ok(value,message));
  const seats=()=>evaluate(`[...document.querySelectorAll('.election-panel:not(.baseline-panel) .panel-total .d-total')].map(e=>e.textContent)`);
  const screenshot=async path=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(path,Buffer.from(r.data,'base64'));};
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1200,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:base});
  for(let i=0;i<50;i++){if(await evaluate(`document.querySelectorAll('.scenario-row').length>0`))break;await sleep(100);}
  await evaluate('document.fonts.ready.then(()=>true)');
  await check(`document.querySelectorAll('.election-panel.locked').length===2`,'sequential initial locks');
  await check(`document.querySelectorAll('.scenario-row').length===108`,'36 rows per election');
  await check(`document.querySelectorAll('.seat-dots i').length===100`,'starting 100 seat graphic');
  await check(`document.querySelector('[data-year-toggle="1"]').getAttribute('aria-checked')==='true'`,'2030 defaults on');
  await check(`document.querySelector('[data-year-toggle="2"]').getAttribute('aria-checked')==='false'`,'2032 defaults off');
  await check(`document.querySelectorAll('.election-panel:not(.baseline-panel) .waterline-2026 .waterline-label').length===3 && [...document.querySelectorAll('.election-panel:not(.baseline-panel) .waterline-2026 .waterline-label')].every(e=>e.textContent==='Same as 2026')`,'scenario waterline text');
  await check(`[...document.querySelectorAll('.waterline-2024')].every(e=>e.dataset.value==='-14'&&e.textContent.includes('2024 (approx)'))`,'approximate 2024 line at minus 14');
  await check(`document.querySelectorAll('.direction-column').length===1`,'one shared direction key');
  await check(`document.querySelector('.intro-copy').textContent.includes('not a prediction engine')`,'intro explains the simplified model');
  await check(`getComputedStyle(document.querySelector('[data-row-index="0"][data-value="5"] .tick-value')).color==='rgb(25, 73, 125)' && getComputedStyle(document.querySelector('[data-row-index="0"][data-value="-5"] .tick-value')).color==='rgb(150, 63, 62)'`,'positive and negative tick colors');
  await mkdir('/tmp/senate-durability-qa',{recursive:true});
  await screenshot('/tmp/senate-durability-qa/desktop-initial.png');

  await click('[data-row-index="0"][data-value="-7"]');
  await check(`document.querySelectorAll('.election-panel.locked').length===1`,'2028 unlocks 2030');
  assert.equal((await seats())[0],'57');
  await click('[data-row-index="1"][data-value="-15"]');
  assert.deepEqual(await seats(),['57','52','—']);
  await check(`document.querySelector('[data-year-toggle="2"]').getAttribute('aria-checked')==='false' && !document.querySelector('[data-slider="2"]')`,'2032 remains off after 2030 is selected');
  await check(`!document.getElementById('summary-text').textContent.includes('2032') && document.querySelectorAll('.summary-card').length===2`,'off years are excluded from summary');
  await click('[data-year-toggle="2"]');
  await click('[data-row-index="2"][data-value="-15"]');
  assert.deepEqual(await seats(),['57','52','42']);
  await check(`document.getElementById('summary-text').textContent.includes('52 D / 48 R in 2030')`,'summary reports both parties for the selected path');
  await check(`new URL(location.href).searchParams.get('2030')==='-15'`,'share URL contains scenario');
  await check(`document.querySelectorAll('#race-table tr').length===35`,'2028 includes expected TN special');
  await click('[data-year-toggle="1"]');
  assert.deepEqual(await seats(),['57','—','—']);
  await check(`document.querySelectorAll('[data-slider]').length===1`,'turning off 2030 also blocks 2032');
  await check(`!document.getElementById('summary-text').textContent.includes('2030') && !document.getElementById('summary-text').textContent.includes('2032')`,'disabled scenarios do not leak into summary');
  await click('[data-year-toggle="1"]');
  assert.deepEqual(await seats(),['57','52','42']);
  await click('[data-year-toggle="2"]');
  assert.deepEqual(await seats(),['57','52','—']);
  await click('[data-year-toggle="2"]');
  assert.deepEqual(await seats(),['57','52','42']);
  await screenshot('/tmp/senate-durability-qa/desktop-scenario.png');

  await evaluate(`document.querySelector('[data-slider="0"]').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp'});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp'});
  await check(`document.querySelector('[data-slider="0"]').getAttribute('aria-valuenow')==='-6'`,'keyboard increments');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home'});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home'});
  await check(`document.querySelector('[data-slider="0"]').getAttribute('aria-valuenow')==='-25'`,'keyboard lower endpoint');

  await evaluate(`document.querySelector('[data-slider="0"]').scrollIntoView({block:'center',behavior:'instant'})`);
  const rect=await evaluate(`(()=>{const r=document.querySelector('[data-slider="0"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y,h:r.height}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y+rect.h*.4,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y+rect.h*.2,button:'left',buttons:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y+rect.h*.2,button:'left',clickCount:1});
  await check(`document.querySelector('[data-slider="0"]').getAttribute('aria-valuenow')==='3'`,'drag selects the expected value');

  await click('#mode-interpolation');
  await check(`document.querySelectorAll('.waterline-2024').length===3`,'2024 waterlines appear');
  await check(`document.querySelectorAll('.election-panel.locked').length===2`,'each mode has independent selections');
  await click('[data-row-index="0"][data-value="100"]');
  await click('[data-row-index="1"][data-value="100"]');
  await click('[data-row-index="2"][data-value="100"]');
  assert.deepEqual(await seats(),['63','69','69']);
  await click('#example');
  await check(`document.querySelector('[data-slider="0"]').getAttribute('aria-valuenow')==='50'`,'interpolation example applies');
  await evaluate(`document.getElementById('audit-year').value='2030';document.getElementById('audit-year').dispatchEvent(new Event('change'))`);
  await check(`document.querySelectorAll('#race-table tr').length===33`,'2030 has 33 elections');
  await click('#flips-only');
  await check(`![...document.querySelectorAll('#race-table .result-flip')].some(e=>e.textContent==='Hold')`,'flips filter');

  await click('#mode-additive');await click('#example');
  await call('Page.navigate',{url:base+'?mode=additive&2028=-7&2030=-15&2032=-15'});
  for(let i=0;i<50;i++){if(await evaluate(`document.querySelectorAll('.selection-marker:not(.preview-marker)').length===3`))break;await sleep(100);}
  assert.deepEqual(await seats(),['57','52','42']);
  await call('Page.navigate',{url:base+'?mode=additive&2028=-7&2030=-15&2032=-15&years=2028'});
  for(let i=0;i<50;i++){if(await evaluate(`document.querySelectorAll('.selection-marker:not(.preview-marker)').length===1`))break;await sleep(100);}
  assert.deepEqual(await seats(),['57','—','—']);
  await check(`document.querySelectorAll('.summary-card').length===1`,'URL restores disabled years and focused summary');
  await screenshot('/tmp/senate-durability-qa/desktop-2028-only.png');
  await click('[data-year-toggle="1"]');
  await click('[data-year-toggle="2"]');
  assert.deepEqual(await seats(),['57','52','42']);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`window.scrollTo(0,0)`);
  await check(`document.documentElement.scrollWidth<=390`,'mobile viewport has no page overflow');
  await check(`document.querySelector('.timeline-scroll').scrollWidth>document.querySelector('.timeline-scroll').clientWidth`,'sliders scroll horizontally on mobile');
  await screenshot('/tmp/senate-durability-qa/mobile-scenario.png');
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  await evaluate(`document.querySelector('[data-slider="0"]').scrollIntoView({block:'center',behavior:'instant'})`);
  const touch=await evaluate(`(()=>{const r=document.querySelector('[data-slider="0"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y,h:r.height}})()`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y+touch.h*.6}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x,y:touch.y+touch.h*.1}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await check(`document.querySelector('[data-slider="0"]').getAttribute('aria-valuenow')==='7'`,'touch dragging');
  await click('#reset');
  await check(`document.querySelectorAll('.election-panel.locked').length===2`,'reset relocks later elections');
  assert.deepEqual(errors,[],'no uncaught browser exceptions');
  console.log('Browser checks passed: year toggle defaults and restoration, rollover, waterline labels, tick colors, shared direction key, summary, keyboard, dragging, interpolation, filters, reset, mobile layout and touch. Base URL:',base);
  console.log('Screenshots: /tmp/senate-durability-qa/');
} finally {
  ws?.close();chrome.kill('SIGTERM');
}
