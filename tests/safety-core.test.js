'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Core = require('../safety-core.js');

const defaults = Core.DEFAULT_SETTINGS;
const basePoint = { temperatureC: 30, humidityPct: 60, rain1hMm: 0, windSpeedMs: 2, forecastAt: '202608021200' };

// UMD browser export path
test('01 browser export path', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'safety-core.js'), 'utf8');
  const sandbox = { globalThis: {} };
  vm.runInNewContext(code, sandbox);
  assert.equal(typeof sandbox.globalThis.SafetyCore.normalizeSettings, 'function');
});

test('02 defaults are normalized from null', () => assert.deepEqual(Core.normalizeSettings(null), defaults));
test('03 non-object settings use defaults', () => assert.deepEqual(Core.normalizeSettings('bad'), defaults));
test('04 boolean true is retained', () => assert.equal(Core.normalizeSettings({ heatEnabled: true }).heatEnabled, true));
test('05 boolean false is retained', () => assert.equal(Core.normalizeSettings({ heatEnabled: false }).heatEnabled, false));
test('06 invalid boolean falls back', () => assert.equal(Core.normalizeSettings({ heatEnabled: 'no' }).heatEnabled, true));
test('07 invalid number falls back', () => assert.equal(Core.normalizeSettings({ heatTempThreshold: 'x' }).heatTempThreshold, 33));
test('08 number lower bound', () => assert.equal(Core.normalizeSettings({ heatTempThreshold: -999 }).heatTempThreshold, -50));
test('09 number upper bound', () => assert.equal(Core.normalizeSettings({ heatTempThreshold: 999 }).heatTempThreshold, 60));
test('10 interval rounds', () => assert.equal(Core.normalizeSettings({ interval: 4.6 }).interval, 5));
test('11 interval lower bound', () => assert.equal(Core.normalizeSettings({ interval: 0 }).interval, 1));
test('12 interval upper bound', () => assert.equal(Core.normalizeSettings({ interval: 99 }).interval, 60));
test('13 humidity lower bound', () => assert.equal(Core.normalizeSettings({ humidityChartThreshold: -1 }).humidityChartThreshold, 0));
test('14 humidity upper bound', () => assert.equal(Core.normalizeSettings({ humidityChartThreshold: 101 }).humidityChartThreshold, 100));

test('15 apparent invalid temperature', () => assert.equal(Core.apparentTemperature('x', 50), null));
test('16 apparent invalid humidity', () => assert.equal(Core.apparentTemperature(30, 'x'), null));
test('17 apparent humidity clamps low', () => assert.equal(Core.apparentTemperature(30, -10), Core.apparentTemperature(30, 0)));
test('18 apparent humidity clamps high', () => assert.equal(Core.apparentTemperature(30, 120), Core.apparentTemperature(30, 100)));
test('19 apparent official regression 31/75', () => assert.equal(Core.apparentTemperature(31, 75), 32.7));
test('20 apparent official regression 33/60', () => assert.equal(Core.apparentTemperature(33, 60), 33.5));

test('21 isExceeded true', () => assert.equal(Core.isExceeded(10, 10, true), true));
test('22 isExceeded below', () => assert.equal(Core.isExceeded(9.9, 10, true), false));
test('23 isExceeded disabled', () => assert.equal(Core.isExceeded(20, 10, false), false));
test('24 isExceeded invalid value', () => assert.equal(Core.isExceeded('x', 10, true), false));
test('25 isExceeded invalid threshold', () => assert.equal(Core.isExceeded(10, 'x', true), false));

test('26 no user events', () => assert.equal(Core.userThresholdEvents(basePoint, defaults, 'current').events.length, 0));
test('27 temperature event', () => assert.equal(Core.userThresholdEvents({ ...basePoint, temperatureC: 33 }, defaults, 'current').events[0].id, 'temperature'));
test('28 apparent event', () => {
  const s = { ...defaults, heatTempEnabled: false, heatAppThreshold: 30 };
  assert.equal(Core.userThresholdEvents(basePoint, s, 'current').events[0].id, 'apparent');
});
test('29 rain event', () => assert.equal(Core.userThresholdEvents({ ...basePoint, rain1hMm: 15 }, defaults, 'current').events[0].id, 'rain'));
test('30 wind event', () => assert.equal(Core.userThresholdEvents({ ...basePoint, windSpeedMs: 14 }, defaults, 'current').events[0].id, 'wind'));
test('31 forecast event carries time', () => assert.equal(Core.userThresholdEvents({ ...basePoint, rain1hMm: 20 }, defaults, 'forecast').events[0].forecastAt, '202608021200'));
test('32 disabled heat creates no heat event', () => assert.equal(Core.userThresholdEvents({ ...basePoint, temperatureC: 50 }, { ...defaults, heatEnabled: false }, 'current').events.length, 0));
test('33 missing point is safe', () => assert.equal(Core.userThresholdEvents(null, defaults, 'current').events.length, 0));
test('34 multiple user events', () => assert.equal(Core.userThresholdEvents({ temperatureC: 40, humidityPct: 100, rain1hMm: 30, windSpeedMs: 20 }, defaults, 'current').events.length, 4));

test('35 temperature chart normal', () => assert.equal(Core.chartMetricState(basePoint, 'temperature', defaults).color, 'normal'));
test('36 temperature chart danger', () => assert.equal(Core.chartMetricState({ ...basePoint, temperatureC: 33 }, 'temperature', defaults).color, 'danger'));
test('37 temperature chart disabled', () => assert.equal(Core.chartMetricState({ ...basePoint, temperatureC: 50 }, 'temperature', { ...defaults, heatEnabled: false }).exceeded, false));
test('38 humidity chart normal', () => assert.equal(Core.chartMetricState({ ...basePoint, humidityPct: 84 }, 'humidity', defaults).exceeded, false));
test('39 humidity chart danger', () => assert.equal(Core.chartMetricState({ ...basePoint, humidityPct: 85 }, 'humidity', defaults).exceeded, true));
test('40 wind chart normal', () => assert.equal(Core.chartMetricState(basePoint, 'wind', defaults).exceeded, false));
test('41 wind chart danger', () => assert.equal(Core.chartMetricState({ ...basePoint, windSpeedMs: 14 }, 'wind', defaults).exceeded, true));
test('42 wind chart disabled', () => assert.equal(Core.chartMetricState({ ...basePoint, windSpeedMs: 50 }, 'wind', { ...defaults, windEnabled: false }).exceeded, false));
test('43 rain chart normal', () => assert.equal(Core.chartMetricState(basePoint, 'rain', defaults).exceeded, false));
test('44 rain chart danger', () => assert.equal(Core.chartMetricState({ ...basePoint, rain1hMm: 15 }, 'rain', defaults).exceeded, true));
test('45 rain chart disabled', () => assert.equal(Core.chartMetricState({ ...basePoint, rain1hMm: 100 }, 'rain', { ...defaults, rainEnabled: false }).exceeded, false));
test('46 chart invalid metric throws', () => assert.throws(() => Core.chartMetricState(basePoint, 'bad', defaults)));
test('47 chart missing value is null', () => assert.equal(Core.chartMetricState({}, 'rain', defaults).value, null));

test('48 chartSlots empty', () => assert.deepEqual(Core.chartSlots(null, 'rain', defaults), []));
test('49 chartSlots one point spans full', () => assert.deepEqual(Core.chartSlots([basePoint], 'rain', defaults).map(x => [x.start, x.end]), [[0, 1]]));
test('50 chartSlots first point half slot', () => assert.equal(Core.chartSlots([basePoint, basePoint, basePoint], 'rain', defaults)[0].end, 0.25));
test('51 chartSlots middle slot', () => assert.deepEqual(Core.chartSlots([basePoint, basePoint, basePoint], 'rain', defaults).slice(1, 2).map(x => [x.start, x.end]), [[0.25, 0.75]]));
test('52 chartSlots last slot', () => assert.deepEqual(Core.chartSlots([basePoint, basePoint, basePoint], 'rain', defaults).slice(2).map(x => [x.start, x.end]), [[0.75, 1]]));

const warningLevelCases = [
  ['53 preliminary numeric', '1', '예비특보'], ['54 preliminary text', 'PRELIMINARY', '예비특보'], ['55 preliminary korean', '예비특보', '예비특보'],
  ['56 advisory numeric', '2', '주의보'], ['57 advisory letter', 'A', '주의보'], ['58 advisory korean', '주의보', '주의보'],
  ['59 warning numeric', '3', '경보'], ['60 warning letter', 'W', '경보'], ['61 warning korean', '경보', '경보'],
  ['62 warning unknown', '9', '수준 미상']
];
for (const [name, input, expected] of warningLevelCases) test(name, () => assert.equal(Core.warningLevel(input).label, expected));

test('63 warning level null unknown', () => assert.equal(Core.warningLevel(null).rank, 0));
const commandCases = [
  ['64 command announce', '1', true, '발표'], ['65 command replace', '2', true, '대치'], ['66 command clear', '3', false, '해제'],
  ['67 command replace clear', '4', false, '대치해제'], ['68 command extend', '5', true, '연장'], ['69 command change', '6', true, '변경'],
  ['70 command change clear', '7', false, '변경해제'], ['71 command unknown', '9', false, '명령 미상']
];
for (const [name, input, active, label] of commandCases) test(name, () => assert.deepEqual({ active: Core.warningCommand(input).active, label: Core.warningCommand(input).label }, { active, label }));

test('72 official warnings disabled', () => assert.deepEqual(Core.officialWarningEvents([{ type: '폭염', command: '1' }], { ...defaults, warningEnabled: false }), []));
test('73 official warning type disabled', () => assert.deepEqual(Core.officialWarningEvents([{ type: '폭염', command: '1' }], { ...defaults, warningHeat: false }), []));
test('74 cleared official warning filtered', () => assert.deepEqual(Core.officialWarningEvents([{ type: '호우', command: '3' }], defaults), []));
test('75 official warning mapped', () => {
  const rows = Core.officialWarningEvents([{ type: '태풍', command: '1', levelCode: '2', regionCode: 'X', regionUpperName: '전국', regionName: '테스트', announcedAt: '202608020100', effectiveAt: '202608020200' }], defaults);
  assert.equal(rows[0].label, '태풍 주의보');
});
test('76 official warning uses level fallback', () => assert.equal(Core.officialWarningEvents([{ type: '폭염', command: '1', level: '경보' }], defaults)[0].level, '경보'));
test('77 official warnings sort by level', () => {
  const rows = Core.officialWarningEvents([{ type: '폭염', command: '1', levelCode: '1' }, { type: '태풍', command: '1', levelCode: '3' }], defaults);
  assert.equal(rows[0].type, '태풍');
});
test('78 official warnings non-array safe', () => assert.deepEqual(Core.officialWarningEvents(null, defaults), []));
test('78a official warning with unknown level is filtered', () => assert.deepEqual(Core.officialWarningEvents([{ type:'폭염', levelCode:'9', command:'1' }], defaults), []));

test('79 assessment normal', () => assert.equal(Core.buildAssessment({ weather: basePoint, forecast: [], warnings: [] }, defaults).statusKind, 'normal'));
test('80 assessment delayed', () => assert.equal(Core.buildAssessment({ weather: { ...basePoint, isDelayed: true }, forecast: [], warnings: [] }, defaults).statusKind, 'delayed'));
test('81 assessment stale blocks current', () => {
  const a = Core.buildAssessment({ weather: { ...basePoint, temperatureC: 50, isStale: true }, forecast: [], warnings: [] }, defaults);
  assert.equal(a.currentEvents.length, 0); assert.equal(a.status, '기상 자료 갱신 지연');
});
test('82 assessment official warning', () => assert.equal(Core.buildAssessment({ weather: basePoint, warnings: [{ type: '폭염', command: '1', levelCode: '3' }] }, defaults).statusKind, 'danger'));
test('83 assessment official advisory', () => assert.equal(Core.buildAssessment({ weather: basePoint, warnings: [{ type: '호우', command: '1', levelCode: '2' }] }, defaults).statusKind, 'warning'));
test('84 assessment current threshold', () => assert.equal(Core.buildAssessment({ weather: { ...basePoint, windSpeedMs: 20 } }, defaults).status, '풍속 기준 초과'));
test('85 assessment forecast threshold', () => assert.match(Core.buildAssessment({ weather: basePoint, forecast: [{ ...basePoint, rain1hMm: 20 }] }, defaults, Date.parse('2026-08-02T11:30:00+09:00')).status, /12:00 예보에서/));
test('86 assessment missing data safe', () => assert.equal(Core.buildAssessment(null, defaults).statusKind, 'normal'));

test('87 safety guidance default', () => assert.equal(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [], official: [] }).actions.length, 2));
test('88 safety guidance heat 31', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 31 }, currentEvents: [], official: [] }).legalBasis.some(x => x.includes('제560조제2항'))));
test('89 safety guidance heat event', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 30 }, currentEvents: [{ type: '폭염' }], official: [] }).actions.some(x => x.includes('온·습도계'))));
test('90 safety guidance heat 33', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 33 }, currentEvents: [{ type: '폭염' }], official: [] }).actions.some(x => x.includes('20분'))));
test('91 safety guidance heat 35', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 35 }, currentEvents: [{ type: '폭염' }], official: [] }).actions.some(x => x.includes('14~17시'))));
test('92 safety guidance heat 38', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 38 }, currentEvents: [{ type: '폭염' }], official: [] }).actions.some(x => x.includes('긴급조치'))));
test('93 safety guidance rain', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [{ type: '강수' }], official: [] }).actions.some(x => x.includes('배수펌프'))));
test('94 safety guidance official rain', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [], official: [{ type: '호우' }] }).actions.some(x => x.includes('침수'))));
test('95 safety guidance wind', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [{ type: '풍속' }], official: [] }).actions.some(x => x.includes('크레인'))));
test('96 safety guidance typhoon combines', () => {
  const a = Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [], official: [{ type: '태풍' }] });
  assert.ok(a.actions.some(x => x.includes('화학물질'))); assert.ok(a.actions.some(x => x.includes('가설울타리')));
});
test('97 safety legal basis deduplicated', () => {
  const a = Core.buildSafetyGuidance({ current: { apparent: 40 }, currentEvents: [{ type: '폭염' }], official: [{ type: '폭염' }] });
  assert.equal(a.legalBasis.length, new Set(a.legalBasis).size);
});

test('98 alarm key official', () => assert.match(Core.alarmKey({ scope: 'official', id: 'x', level: '경보' }, 'loc'), /official/));
test('99 alarm key user current', () => assert.equal(Core.alarmKey({ scope: 'current', id: 'wind' }, 'loc'), 'loc|current|wind|'));
test('100 alarm key fallback event', () => assert.equal(Core.alarmKey({ criterion: 'x' }, ''), '|current|x|'));
test('101 reconcile new event', () => assert.equal(Core.reconcileAlarmState([], [{ scope: 'current', id: 'wind' }], 'loc').newEvents.length, 1));
test('102 reconcile existing event', () => {
  const key = Core.alarmKey({ scope: 'current', id: 'wind' }, 'loc');
  assert.equal(Core.reconcileAlarmState([key], [{ scope: 'current', id: 'wind' }], 'loc').newEvents.length, 0);
});
test('103 reconcile cleared event', () => assert.deepEqual(Core.reconcileAlarmState(['old'], [], 'loc').activeKeys, []));
test('104 reconcile invalid previous/events', () => assert.deepEqual(Core.reconcileAlarmState(null, null, 'loc'), { activeKeys: [], newEvents: [] }));

test('105 weekly no data', () => assert.deepEqual(Core.weeklyHighlights(null, defaults, null), []));
test('106 weekly temperature highlight', () => assert.equal(Core.weeklyHighlights([{ date: '20260802', maxTempC: 33 }], defaults, [])[0].type, 'heat'));
test('107 weekly humidity alone is omitted', () => assert.deepEqual(Core.weeklyHighlights([{ date: '20260802', maxHumidityPct: 99 }], { ...defaults, heatEnabled: false }, []), []));
test('108 weekly wind alone is omitted', () => assert.deepEqual(Core.weeklyHighlights([{ date: '20260802', maxWindSpeedMs: 30 }], { ...defaults, heatEnabled: false }, []), []));
test('109 weekly rain alone is omitted', () => assert.deepEqual(Core.weeklyHighlights([{ date: '20260802', maxRain1hMm: 100 }], { ...defaults, heatEnabled: false }, []), []));
test('110 weekly official highlight', () => assert.equal(Core.weeklyHighlights([], defaults, [{ type: '태풍', command: '1', levelCode: '3', effectiveAt: '202608020100' }])[0].type, 'official'));
test('111 weekly disabled heat no highlight', () => assert.deepEqual(Core.weeklyHighlights([{ date: '20260802', maxTempC: 50, maxApparentC: 55 }], { ...defaults, heatEnabled: false }, []), []));


test('112 forecast event without time uses empty string', () => assert.equal(Core.userThresholdEvents({ ...basePoint, forecastAt: undefined, rain1hMm: 20 }, defaults, 'forecast').events[0].forecastAt, ''));
test('113 chart null point uses empty object', () => assert.equal(Core.chartMetricState(null, 'humidity', defaults).value, null));
test('114 chart slot missing forecast time', () => assert.equal(Core.chartSlots([{ rain1hMm: 20 }], 'rain', defaults)[0].forecastAt, ''));
test('115 warning command null', () => assert.equal(Core.warningCommand(null).label, '명령 미상'));
test('116 safety guidance null assessment', () => assert.equal(Core.buildSafetyGuidance(null).actions.length, 2));
test('117 safety guidance missing event arrays', () => assert.equal(Core.buildSafetyGuidance({ current: { apparent: 25 } }).actions.length, 2));
test('118 safety guidance missing currentEvents with official heat', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, official: [{ type: '폭염' }] }).actions.some(x => x.includes('온·습도계'))));
test('119 safety guidance missing official with current heat', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [{ type: '폭염' }] }).actions.some(x => x.includes('온·습도계'))));
test('120 safety guidance missing arrays with rain-safe', () => assert.equal(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: undefined, official: undefined }).actions.length, 2));
test('121 alarm key null event and location', () => assert.equal(Core.alarmKey(null, null), '|current||'));
test('122 alarm key official missing id and level', () => assert.equal(Core.alarmKey({ scope: 'official' }, 'loc'), 'loc|official||'));
test('123 alarm key forecast missing forecast time', () => assert.equal(Core.alarmKey({ scope: 'forecast', id: 'rain' }, 'loc'), 'loc|forecast|rain|'));
test('124 weekly missing date uses empty string', () => assert.equal(Core.weeklyHighlights([{ maxTempC: 33 }], defaults, [])[0].date, ''));

test('125 critical warning numeric', () => assert.deepEqual(Core.warningLevel('4'), { code: '4', label: '중대경보', rank: 4 }));
test('126 critical warning korean', () => assert.equal(Core.warningLevel('중대경보').rank, 4));
test('127 critical warning sorts first', () => {
  const events = Core.officialWarningEvents([
    { type: '폭염', command: '1', levelCode: '3' },
    { type: '폭염', command: '1', levelCode: '4' }
  ], defaults);
  assert.equal(events[0].level, '중대경보');
});
test('128 preliminary guidance prepares response', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [], official: [{ type: '호우', levelRank: 1 }] }).actions.some(x => x.includes('예비특보'))));
test('129 advisory guidance strengthens vulnerable work control', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [], official: [{ type: '호우', levelRank: 2 }] }).actions.some(x => x.includes('주의보'))));
test('130 warning guidance stops vulnerable work', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [], official: [{ type: '태풍', levelRank: 3 }] }).actions.some(x => x.includes('경보 이상'))));
test('131 critical heat guidance uses stop move check', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 34 }, currentEvents: [], official: [{ type: '폭염', levelRank: 4 }] }).actions.some(x => x.includes('중단–이동–확인'))));
test('132 rain guidance includes article 37', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [{ type: '강수' }], official: [] }).legalBasis.some(x => x.includes('제37조제1항'))));
test('133 wind guidance includes article 37', () => assert.ok(Core.buildSafetyGuidance({ current: { apparent: 25 }, currentEvents: [{ type: '풍속' }], official: [] }).legalBasis.some(x => x.includes('제37조'))));


test('134 compact KST parser accepts valid timestamp', () => assert.equal(Core.parseCompactKst('202608021200'), Date.parse('2026-08-02T12:00:00+09:00')));
test('135 compact KST parser rejects invalid timestamp text', () => assert.equal(Core.parseCompactKst('bad'), null));
test('136 future forecast accepts Date input', () => assert.equal(Core.isFutureForecastAt('202608021200', new Date('2026-08-02T11:40:00+09:00')), true));
test('137 elapsed forecast is not future', () => assert.equal(Core.isFutureForecastAt('202608021100', Date.parse('2026-08-02T11:40:00+09:00')), false));
test('138 future forecast rejects invalid now', () => assert.equal(Core.isFutureForecastAt('202608021200', 'bad'), false));
test('139 forecast phrase future wording', () => assert.equal(Core.forecastEventPhrase({ forecastAt:'202608021200', label:'체감온도 기준 초과' }, Date.parse('2026-08-02T11:40:00+09:00')), '12:00 예보에서 체감온도 기준 초과 예상'));
test('140 forecast phrase elapsed wording', () => assert.equal(Core.forecastEventPhrase({ forecastAt:'202608021100', label:'기온 기준 초과' }, Date.parse('2026-08-02T11:40:00+09:00')), '11:00 예보 기준 기온 기준 초과'));
test('141 forecast phrase missing fields', () => assert.equal(Core.forecastEventPhrase(null, Date.parse('2026-08-02T11:40:00+09:00')), '예보 시각 예보 기준 기준 초과'));
test('142 assessment excludes elapsed forecast event', () => {
  const a=Core.buildAssessment({weather:basePoint,forecast:[{...basePoint,forecastAt:'202608021100',rain1hMm:20}]},defaults,Date.parse('2026-08-02T11:40:00+09:00'));
  assert.equal(a.forecastEvents.length,0); assert.equal(a.statusKind,'normal');
});
test('143 weekly apparent-temperature heat highlight', () => assert.match(Core.weeklyHighlights([{date:'20260802',maxApparentC:34}],{...defaults,heatTempEnabled:false},[])[0].text,/최고체감온도/));
test('144 weekly same date groups heat and official warning', () => {
  const rows=Core.weeklyHighlights([{date:'20260802',maxTempC:34}],defaults,[{type:'폭염',command:'1',levelCode:'2',effectiveAt:'202608021100',regionName:'수원'}]);
  assert.equal(rows.length,1); assert.match(rows[0].text,/폭염 ·/); assert.match(rows[0].text,/기상특보/); assert.equal(rows[0].type,'official');
});
test('145 weekly duplicate text is deduplicated', () => {
  const w={type:'폭염',command:'1',levelCode:'2',effectiveAt:'202608021100',regionName:'수원'};
  const rows=Core.weeklyHighlights([],defaults,[w,w]);
  assert.equal(rows.length,1); assert.equal((rows[0].text.match(/기상특보/g)||[]).length,1);
});
test('146 alarm guidance forecast adds advance planning', () => {
  const g=Core.buildAlarmGuidance({scope:'forecast',type:'폭염',criterion:'체감온도',value:35,forecastAt:'209908021200',label:'체감온도 기준 초과'}, {current:{apparent:30}});
  assert.match(g.actions[0],/해당 시각 전에/); assert.ok(g.legalBasis.some(x=>x.includes('35℃')));
});
test('147 alarm guidance official uses official event', () => {
  const g=Core.buildAlarmGuidance({scope:'official',type:'태풍',levelRank:3}, {current:{apparent:25}});
  assert.ok(g.actions.some(x=>x.includes('경보 이상'))); assert.ok(g.legalBasis.some(x=>x.includes('제37조')));
});
test('148 alarm guidance null event falls back safely', () => assert.equal(Core.buildAlarmGuidance(null,null).actions.length,2));


test('149 future phrase missing label uses fallback',()=>{
  const text=Core.forecastEventPhrase({forecastAt:'209901010100'},new Date('2098-12-31T15:00:00Z'));
  assert.match(text,/기준 초과 예상/);
});
test('150 alarm guidance invalid apparent uses null branch',()=>{
  const out=Core.buildAlarmGuidance({type:'강수',scope:'current',criterion:'1시간 강수량',value:20},{current:{apparent:'invalid'}});
  assert.ok(out.actions.some(x=>x.includes('침수')||x.includes('배수')));
});
test('151 weekly multiple dates are sorted',()=>{
  const out=Core.weeklyHighlights([
    {date:'20260804',maxTempC:34,maxApparentC:34},
    {date:'20260803',maxTempC:34,maxApparentC:34}
  ],Core.DEFAULT_SETTINGS,[]);
  assert.deepEqual(out.map(x=>x.date),['20260803','20260804']);
});
