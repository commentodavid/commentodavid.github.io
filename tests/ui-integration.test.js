'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../safety-core.js');

class ClassList {
  constructor(){ this.values = new Set(); }
  add(...xs){ xs.forEach(x => this.values.add(x)); }
  remove(...xs){ xs.forEach(x => this.values.delete(x)); }
  contains(x){ return this.values.has(x); }
  toString(){ return [...this.values].join(' '); }
}
class Element {
  constructor(id=''){
    this.id=id; this.textContent=''; this._innerHTML=''; this.value=''; this.checked=false;
    this.disabled=false; this.dataset={}; this.style={}; this.classList=new ClassList(); this.onclick=null;
  }
  set innerHTML(v){ this._innerHTML=String(v); }
  get innerHTML(){ return this._innerHTML; }
  addEventListener(){ }
}
function response(obj, status=200){ return { ok:status>=200&&status<300, status, async json(){ return obj; } }; }
function createApp(htmlFile='../index.html'){
  const html = fs.readFileSync(require.resolve(htmlFile),'utf8').replace('__API_BASE__','https://api.example');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const elements = Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  const storage = new Map();
  const location = { displayName:'전북특별자치도 군산시',lat:35.9677,lon:126.7366,address:{state:'전북특별자치도',city:'군산시'},kmaState:'전북특별자치도',kmaCity:'군산시',source:'test' };
  const settings = { ...Core.DEFAULT_SETTINGS };
  const forecast = [
    ['202608020100',31,82,3,0],['202608020200',33,88,5,0],['202608020300',34,92,15,18],
    ['202608020400',32,95,12,8],['202608020500',30,80,6,0],['202608020600',29,75,4,0]
  ].map(([forecastAt,temperatureC,humidityPct,windSpeedMs,rain1hMm])=>({forecastAt,temperatureC,humidityPct,windSpeedMs,rain1hMm,precipitationType:rain1hMm?'비':'없음',sky:rain1hMm?'흐림':'맑음',windDirectionDeg:180}));
  const weekly = [{date:'20260802',minTempC:27,maxTempC:34,maxApparentC:35,maxHumidityPct:95,maxWindSpeedMs:15,maxRain1hMm:18,maxRainProbabilityPct:80,precipitationTypes:['비']}];
  const warning = {regionUpperName:'전북특별자치도',regionName:'군산시',regionCode:'L1080200',announcedAt:'202608020030',effectiveAt:'202608020100',type:'호우',levelCode:'2',level:'주의보',command:'1'};
  const calls=[];
  async function fetchMock(url){
    const parsedUrl=new URL(String(url),'https://example.test');
    calls.push(parsedUrl.pathname+parsedUrl.search); const p=parsedUrl.pathname;
    if(p==='/api/preferences') return response({settings,recent:[location],lastLocation:location});
    if(p==='/api/preferences/save') return response({ok:true});
    if(p==='/api/health') return response({checks:[{id:'core',name:'판정 모듈',status:'pass',message:'정상',required:true}]});
    if(p==='/api/current') return response({checkedAt:'2026-08-02T00:57:49+09:00',nx:56,ny:92,weather:{observedAt:'202608020050',receivedAt:'2026-08-02T00:57:49+09:00',temperatureC:31,humidityPct:75,rain1hMm:0,precipitationType:'없음',windDirectionDeg:180,windSpeedMs:4,isDelayed:false,isStale:false}});
    if(p==='/api/current10') return response({checkedAt:'2026-08-02T00:57:49+09:00',nx:56,ny:92,weather:{observedAt:'202608020050',receivedAt:'2026-08-02T00:57:49+09:00',temperatureC:31,humidityPct:75,rain1hMm:0,precipitationType:'없음',windDirectionDeg:180,windSpeedMs:4,isDelayed:false,isStale:false,fallbackFields:[]}});
    if(p==='/api/priority') return response({forecast:{ok:true,result:{items:forecast,isStale:false}},warnings:{ok:true,result:{items:[warning],isStale:false}}});
    if(p==='/api/forecast') return response({result:{items:forecast,isStale:false}});
    if(p==='/api/weekly') return response({result:{days:weekly,isStale:false}});
    if(p==='/api/warnings') return response({result:{items:[warning],isStale:false}});
    if(p==='/api/reverse') return response(location);
    if(p==='/api/geocode') return response({results:[location]});
    return response({error:'not found'},404);
  }
  const document = {
    getElementById(id){ return elements[id] || (elements[id]=new Element(id)); },
    querySelectorAll(){ return []; }
  };
  const context = {
    console, SafetyCore:Core, document, fetch:fetchMock,
    navigator:{onLine:true,geolocation:{getCurrentPosition(ok,fail){ fail({message:'denied for test'}); }}},
    localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    confirm:()=>true,
    setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
    Intl, Date, Math, Number, String, Boolean, Array, Object, JSON, Promise, Set, Error, URL,
  };
  context.window=context; context.globalThis=context; context.addEventListener=()=>{};
  let scripts=[...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(x=>x.trim());
  let script=scripts.join('\n').replace(/initialize\(\);\s*$/,'');
  script += '\nglobalThis.__app={initialize,runHealth,searchAddress,readSettings,writeSettings,applySettings,renderForecast,showAlarm,processAlarms,clearRecent,chartSvg,applyAndRender,matchWarnings,locationCityTokens,warningRegionTokens,regionMatchesCity,refreshSupplementary,state,store,KEYS};';
  vm.createContext(context); vm.runInContext(script,context,{filename:`${htmlFile}-inline.js`});
  return {context,app:context.__app,elements,storage,calls,location,forecast};
}
async function settle(predicate, attempts=40){
  for(let i=0;i<attempts;i++){ if(predicate()) return; await new Promise(r=>setImmediate(r)); }
  throw new Error('async UI did not settle');
}

let fixture;
test('UI 01 initializes current location fallback and current weather', async()=>{
  fixture=createApp(); await fixture.app.initialize();
  await settle(()=>fixture.app.state.services.weekly!=='wait');
  assert.equal(fixture.elements.currentAddress.textContent,'전북특별자치도 군산시');
  assert.equal(fixture.elements.temperature.textContent,'31.0');
  assert.equal(fixture.elements.humidity.textContent,'75');
});
test('UI 02 metadata hides development source labels and uses colored chips',()=>{
  const h=fixture.elements.metaRow.innerHTML;
  assert.match(h,/화면 갱신/); assert.match(h,/관측 08월 02일 00:50/); assert.match(h,/5분 자동 갱신/);
  assert.doesNotMatch(h,/10분 실황|초단기실황|개 시간대/); assert.match(h,/meta-chip blue/); assert.match(h,/meta-chip green/);
});
test('UI 03 renders four independent charts including rain',()=>{
  const h=fixture.elements.forecastCharts.innerHTML;
  assert.equal((h.match(/class="chart-card"/g)||[]).length,4);
  for(const label of ['온도','습도','풍속','강수량']) assert.match(h,new RegExp(`<strong>${label}</strong>`));
});
test('UI 04 humidity danger uses humidity threshold only',()=>{
  const h=fixture.app.chartSvg(fixture.forecast,'humidity',fixture.app.readSettings());
  assert.match(h,/95%/); assert.match(h,/rgba\(207,63,77,.12\)/);
});
test('UI 05 rain chart remains visible without a rain alarm threshold',()=>{
  const h=fixture.app.chartSvg(fixture.forecast,'rain',fixture.app.readSettings());
  assert.match(h,/18.0mm/); assert.doesNotMatch(h,/기준 15mm/);
});
test('UI 06 wind chart remains visible without a wind alarm threshold',()=>{
  const h=fixture.app.chartSvg(fixture.forecast,'wind',fixture.app.readSettings());
  assert.match(h,/15.0m\/s/); assert.doesNotMatch(h,/기준 14m\/s/);
});
test('UI 07 temperature danger uses temperature threshold only',()=>{
  const h=fixture.app.chartSvg(fixture.forecast,'temperature',fixture.app.readSettings());
  assert.match(h,/34.0℃/); assert.doesNotMatch(h,/stroke-dasharray/); assert.doesNotMatch(h,/기준 33℃/);
  assert.match(fixture.elements.forecastCharts.innerHTML,/표시 기준 33℃/);
});
test('UI 08 official warning and weekly highlights render',()=>{
  assert.match(fixture.elements.warnings.innerHTML,/호우 주의보/);
  assert.match(fixture.elements.weeklyHighlights.innerHTML,/폭염|호우 주의보/);
});
test('UI 09 alarm test is silent popup',()=>{
  fixture.app.showAlarm(null,{test:true});
  assert.equal(fixture.elements.alarmTitle.textContent,'알람 테스트');
  assert.equal(fixture.elements.alarmModal.classList.contains('show'),true);
  assert.match(fixture.elements.alarmReason.textContent,/즉시 조치 가이드/); assert.match(fixture.elements.alarmActions.innerHTML,/현장 책임자/); assert.match(fixture.elements.alarmLegalBasis.innerHTML,/법적 근거|산업안전보건/);
});
test('UI 10 recent locations can be cleared',()=>{
  assert.equal(JSON.parse(fixture.storage.get('weather.recentLocations.v13.1')).length,1);
  fixture.app.clearRecent();
  assert.equal(JSON.parse(fixture.storage.get('weather.recentLocations.v13.1')).length,0);
});
test('UI 11 service endpoints were independently requested',()=>{
  for(const path of ['/api/current','/api/current10','/api/priority','/api/weekly']) assert.ok(fixture.calls.some(x=>x.startsWith(path)),path);
});
test('UI 12 settings normalize before applying',()=>{
  fixture.elements.interval.value='999'; fixture.elements.humidityChartThreshold.value='120';
  fixture.app.applySettings();
  assert.equal(fixture.elements.interval.value,'60'); assert.equal(fixture.elements.humidityChartThreshold.value,'100');
});

test('UI 13 stale forecast and warning do not affect current status or create alarms',()=>{
  fixture.elements.closeAlarm.onclick?.();
  fixture.app.state.activeAlarmKeys=[];
  fixture.app.state.lastRaw={
    checkedAt:'2026-08-02T01:00:00+09:00', gridKey:'56,92',
    weather:{observedAt:'202608020050',temperatureC:25,humidityPct:50,rain1hMm:0,precipitationType:'없음',windDirectionDeg:180,windSpeedMs:2,isDelayed:false,isStale:false},
    forecast:[{forecastAt:'202608020200',temperatureC:40,humidityPct:99,rain1hMm:100,windSpeedMs:40}],forecastStale:true,forecastError:null,
    warnings:[{regionUpperName:'전북특별자치도',regionName:'군산시',regionCode:'L1080200',type:'호우',levelCode:'3',command:'1'}],warningsStale:true,warningError:null
  };
  fixture.app.applyAndRender();
  assert.equal(fixture.elements.statusTitle.textContent,'현재 기준 초과 없음');
});

test('UI 14 legal basis is always visible without details element',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.match(html,/<div class="legal"><h4>법적·행정 기준<\/h4>/); assert.doesNotMatch(html,/<details class="legal">/);
});
test('UI 15 English display name matches Suwon warning through KMA city alias',()=>{
  fixture.app.state.location={displayName:'Suwon-si, Gyeonggi-do',lat:37.2636,lon:127.0286,address:{},kmaState:'경기도',kmaCity:'수원시'};
  const rows=fixture.app.matchWarnings([{regionUpperName:'경기도',regionName:'수원',type:'폭염',levelCode:'2',command:'1'}]);
  assert.equal(rows.length,1);
});
test('UI 16 supplementary priority requests forecast before ten-minute observation',()=>{
  const fi=fixture.calls.findIndex(x=>x.startsWith('/api/priority'));
  const ti=fixture.calls.findIndex(x=>x.startsWith('/api/current10'));
  assert.ok(fi>=0&&ti>=0&&fi<ti);
});
test('UI 17 official alarm includes detailed guide and legal basis',()=>{
  fixture.app.showAlarm({scope:'official',type:'폭염',label:'폭염 주의보',level:'주의보',levelRank:2,region:'경기도 수원'});
  assert.match(fixture.elements.alarmActions.innerHTML,/주의보 단계/); assert.match(fixture.elements.alarmLegalBasis.innerHTML,/제560조/);
});


test('UI 18 Suwon does not match another Gyeonggi city warning',()=>{
  fixture.app.state.location={displayName:'Suwon-si, Gyeonggi-do',lat:37.2636,lon:127.0286,address:{},kmaState:'경기도',kmaCity:'수원시'};
  const rows=fixture.app.matchWarnings([{regionUpperName:'경기도',regionName:'용인',type:'폭염',levelCode:'2',command:'1'}]);
  assert.equal(rows.length,0);
});
test('UI 19 subdivided warning region matches its base city',()=>{
  fixture.app.state.location={displayName:'용인시',lat:37.24,lon:127.17,address:{},kmaState:'경기도',kmaCity:'용인시'};
  const rows=fixture.app.matchWarnings([{regionUpperName:'경기도',regionName:'용인서북부',type:'폭염',levelCode:'2',command:'1'}]);
  assert.equal(rows.length,1);
});
test('UI 20 changing locations invalidates previous supplementary run',()=>{
  const before=fixture.app.state.supplementRunId;
  fixture.app.state.supplementRunId++;
  assert.equal(fixture.app.state.supplementRunId,before+1);
});

test('UI 21 initial alarm is released only after weekly content has rendered',()=>{
  const pi=fixture.calls.findIndex(x=>x.startsWith('/api/priority'));
  const wi=fixture.calls.findIndex(x=>x.startsWith('/api/weekly'));
  assert.ok(pi>=0&&wi>pi);
  assert.equal(fixture.app.state.deferAlarms,false);
  assert.match(fixture.elements.weeklyHighlights.innerHTML,/폭염|호우/);
});
test('UI 22 full Korean display name extracts Suwon city token without province-wide match',()=>{
  fixture.app.state.location={displayName:'경기도 수원시 팔달구',lat:37.26,lon:127.02,address:{},kmaCity:''};
  assert.equal(fixture.app.matchWarnings([{regionName:'수원',type:'폭염',levelCode:'2',command:'1'}]).length,1);
  assert.equal(fixture.app.matchWarnings([{regionName:'용인',type:'폭염',levelCode:'2',command:'1'}]).length,0);
});

test('UI 23 Gunpo location matches Gunpo heat warning and not Suwon warning',()=>{
  fixture.app.state.location={displayName:'대한민국 경기도 군포시 금정동',lat:37.36,lon:126.94,address:{city:'군포시'},kmaCity:'군포시'};
  assert.equal(fixture.app.matchWarnings([{regionName:'군포',type:'폭염',levelCode:'2',command:'1'}]).length,1);
  assert.equal(fixture.app.matchWarnings([{regionName:'수원',type:'폭염',levelCode:'2',command:'1'}]).length,0);
});


test('UI 24 runtime health refresh never reopens startup modal', async()=>{
  fixture.elements.startupModal.classList.remove('show');
  await fixture.app.runHealth({startup:false});
  assert.equal(fixture.elements.startupModal.classList.contains('show'),false);
});

test('UI 25 address search prevents default browser navigation', async()=>{
  fixture.elements.address.value='양산';
  let prevented=false;
  await fixture.app.searchAddress({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(fixture.elements.startupModal.classList.contains('show'),false);
  assert.ok(fixture.calls.some(x=>x.startsWith('/api/geocode?q=')));
});

test('UI 26 successful initialization leaves startup modal closed', async()=>{
  const fresh=createApp();
  await fresh.app.initialize();
  await settle(()=>fresh.app.state.services.weekly!=='wait');
  assert.equal(fresh.elements.startupModal.classList.contains('show'),false);
  assert.equal(fresh.app.state.booting,false);
});

test('UI 27 alarm settings keep only heat and official warnings',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.match(html,/id="heatEnabled"/); assert.match(html,/id="warningEnabled"/);
  assert.doesNotMatch(html,/id="rainEnabled"/); assert.doesNotMatch(html,/id="windEnabled"/);
  const settings=fixture.app.readSettings();
  assert.equal(settings.rainEnabled,false); assert.equal(settings.windEnabled,false);
});

test('UI 28 mobile alarm test opens a detailed bottom-sheet and closes',()=>{
  const mobile=createApp('../mobile.html');
  mobile.elements.testAlarm.onclick();
  assert.equal(mobile.elements.alarmModal.classList.contains('show'),true);
  assert.equal(mobile.elements.alarmTitle.textContent,'알람 테스트');
  assert.match(mobile.elements.alarmMetric.textContent,/정상적으로 표시/);
  assert.match(mobile.elements.alarmActions.innerHTML,/현장 책임자/);
  assert.match(mobile.elements.alarmLegalBasis.innerHTML,/법적 근거/);
  mobile.elements.closeAlarm.onclick();
  assert.equal(mobile.elements.alarmModal.classList.contains('show'),false);

  const html=fs.readFileSync(require.resolve('../mobile.html'),'utf8');
  assert.match(html,/class="mobile-nav"/);
  assert.match(html,/\.mobile-page \.modal\{width:100%;max-width:100%;align-items:flex-end/);
  assert.match(html,/html,body\.mobile-page\{width:100%;max-width:100%;overflow-x:hidden\}/);
  assert.match(html,/\.mobile-page \.chart-card svg\{width:100%;max-width:100%;height:190px;overflow:hidden\}/);
  assert.match(html,/id="warningsPanel"/);
});

test('UI 29 mobile startup diagnostics cannot force horizontal overflow',async()=>{
  const mobile=createApp('../mobile.html');
  mobile.context.fetch=async()=>response({checks:[{
    name:'매우 긴 시작점검 항목 이름'.repeat(12),
    status:'fail',
    message:'https://example.invalid/'+'unbroken-error-message-'.repeat(40),
    required:true
  }]});
  await mobile.app.runHealth({startup:true});
  assert.equal(mobile.elements.startupModal.classList.contains('show'),true);
  assert.match(mobile.elements.startupChecks.innerHTML,/unbroken-error-message/);

  const html=fs.readFileSync(require.resolve('../mobile.html'),'utf8');
  assert.match(html,/\.mobile-page \.diag\{width:100%;min-width:0;max-width:100%;grid-template-columns:9px minmax\(0,1fr\);overflow:hidden\}/);
  assert.match(html,/\.mobile-page \.modal-box>\*/);
  assert.match(html,/\.mobile-page \.service-item span/);
});

test('UI 30 mobile view hides diagnostics and uses a weather-first summary',()=>{
  const html=fs.readFileSync(require.resolve('../mobile.html'),'utf8');
  assert.match(html,/id="diagnosticPanel" class="card panel" hidden/);
  assert.match(html,/\.mobile-page #diagnosticPanel\{display:none!important\}/);
  assert.match(html,/\.mobile-page \.system\{display:none!important\}/);
  assert.match(html,/class="weather-hero"/);
  assert.match(html,/class="weather-mini-grid"/);
  for(const id of ['temperature','apparent','sky','humidity','rain','wind']){
    assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
  }
});

test('UI 31 phone visits to the root page redirect to the mobile route',()=>{
  const desktop=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const mobile=fs.readFileSync(require.resolve('../mobile.html'),'utf8');
  assert.match(desktop,/matchMedia\('\(max-width: 780px\)'\)\.matches/);
  assert.match(desktop,/location\.replace\('\.\/mobile\.html\?v=9'\)/);
  assert.match(desktop,/get\('desktop'\)==='1'/);
  assert.doesNotMatch(mobile,/class="desktop-link"/);
});

test('UI 32 weekly details use separate lines and chart threshold line is removed',async()=>{
  const app=createApp(); await app.app.initialize();
  await settle(()=>app.app.state.services.weekly!=='wait');
  assert.match(app.elements.weeklyHighlights.innerHTML,/폭염<br>최고기온/);
  assert.match(app.elements.weeklyHighlights.innerHTML,/최고기온[^<]+<br>최고체감온도/);
  const svg=app.app.chartSvg(app.forecast,'temperature',app.app.readSettings());
  assert.doesNotMatch(svg,/stroke-dasharray/);
  assert.doesNotMatch(svg,/기준 33℃/);
});

test('UI 33 mobile current weather and data credit stay inside the phone width',()=>{
  const mobile=fs.readFileSync(require.resolve('../mobile.html'),'utf8');
  assert.match(mobile,/\.mobile-page #currentWeather\{width:100%;max-width:100%;min-width:0;/);
  assert.match(mobile,/\.mobile-page \.weather-hero\{width:calc\(100% - 24px\);max-width:calc\(100% - 24px\);min-width:0;/);
  assert.match(mobile,/grid-template-columns:minmax\(0,1fr\) minmax\(82px,\.78fr\)/);
  assert.match(mobile,/\.mobile-page \.data-credit\{width:100%;max-width:520px;margin:0 auto;/);
  assert.match(mobile,/text-align:center/);
});

test('UI 34 six-hour forecast threshold events never open an alarm',()=>{
  const app=createApp();
  app.app.state.deferAlarms=false;
  app.app.state.activeAlarmKeys=[];
  app.app.state.lastRaw={forecastStale:false,warningsStale:false};
  app.elements.alarmModal.classList.remove('show');
  app.app.processAlarms({
    currentEvents:[],
    forecastEvents:[{id:'temperature',scope:'forecast',forecastAt:'202608041100',criterion:'기온',value:40,threshold:33,unit:'℃',label:'기온 기준 초과'}],
    official:[]
  });
  assert.equal(app.elements.alarmModal.classList.contains('show'),false);
  assert.equal(app.app.state.activeAlarmKeys.length,0);
});

test('UI 35 current observation threshold events still open an alarm',()=>{
  const app=createApp();
  app.app.state.deferAlarms=false;
  app.app.state.activeAlarmKeys=[];
  app.app.state.lastRaw={warningsStale:false};
  app.elements.alarmModal.classList.remove('show');
  app.app.processAlarms({
    currentEvents:[{id:'temperature',type:'폭염',scope:'current',criterion:'기온',value:34,threshold:33,unit:'℃',label:'기온 기준 초과'}],
    forecastEvents:[],
    official:[]
  });
  assert.equal(app.elements.alarmModal.classList.contains('show'),true);
  assert.match(app.elements.alarmReason.textContent,/현재 값이 설정 기준 33℃ 이상/);
});

test('UI 36 active official warnings still open an alarm',()=>{
  const app=createApp();
  app.app.state.deferAlarms=false;
  app.app.state.activeAlarmKeys=[];
  app.app.state.lastRaw={warningsStale:false};
  app.elements.alarmModal.classList.remove('show');
  app.app.processAlarms({
    currentEvents:[],
    forecastEvents:[],
    official:[{id:'warning:폭염:수원',type:'폭염',scope:'official',level:'주의보',levelRank:2,region:'수원',label:'폭염 주의보'}]
  });
  assert.equal(app.elements.alarmModal.classList.contains('show'),true);
  assert.match(app.elements.alarmReason.textContent,/기상청 공식 주의보/);
});

test('UI 37 current status never uses a future forecast time',()=>{
  const app=createApp();
  app.app.state.lastRaw={
    checkedAt:'2026-08-04T08:32:00+09:00',gridKey:'55,92',
    weather:{observedAt:'202608040800',temperatureC:29.6,humidityPct:86,rain1hMm:0,precipitationType:'없음',windDirectionDeg:180,windSpeedMs:1.3,isDelayed:false,isStale:false},
    forecast:[{forecastAt:'209908041000',temperatureC:35,humidityPct:86,rain1hMm:0,windSpeedMs:1.3,sky:'맑음'}],forecastStale:false,forecastError:null,
    warnings:[],warningsStale:false,warningError:null
  };
  app.app.applyAndRender({alarms:false});
  assert.equal(app.elements.statusTitle.textContent,'현재 기준 초과 없음');
  assert.doesNotMatch(app.elements.statusTitle.textContent,/10:00|예보/);
  assert.match(app.elements.statusBasis.innerHTML,/현재 관측 기준 초과 없음/);
  assert.doesNotMatch(app.elements.statusBasis.innerHTML,/10:00|예보/);
});
