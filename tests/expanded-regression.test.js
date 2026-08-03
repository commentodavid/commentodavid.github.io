'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../safety-core.js');

const defaults = { ...Core.DEFAULT_SETTINGS };

// 30 settings boundary and coercion regressions.
const intervalCases = [
  [-10,1],[0,1],[1,1],[1.4,1],[1.5,2],[5,5],[30.4,30],[59.6,60],[60,60],[99,60]
];
for (const [input, expected] of intervalCases) {
  test(`X settings interval ${input} -> ${expected}`, () => {
    assert.equal(Core.normalizeSettings({ interval: input }).interval, expected);
  });
}

const temperatureSettingCases = [
  [-99,-50],[-50,-50],[-49.5,-49.5],[0,0],[32.5,32.5],[33,33],[45,45],[59.9,59.9],[60,60],[99,60]
];
for (const [input, expected] of temperatureSettingCases) {
  test(`X settings heat temperature ${input} -> ${expected}`, () => {
    assert.equal(Core.normalizeSettings({ heatTempThreshold: input }).heatTempThreshold, expected);
  });
}

const humiditySettingCases = [
  [-1,0],[0,0],[1,1],[50,50],[84,84],[85,85],[99,99],[100,100],[101,100],['bad',85]
];
for (const [input, expected] of humiditySettingCases) {
  test(`X settings humidity ${input} -> ${expected}`, () => {
    assert.equal(Core.normalizeSettings({ humidityChartThreshold: input }).humidityChartThreshold, expected);
  });
}

// 25 golden-value regressions for the official apparent-temperature formula.
const apparentGolden = [
  [20,0,15.5],[20,25,17.7],[20,50,19.8],[20,75,21.5],[20,100,23.2],
  [25,0,19.1],[25,25,22.2],[25,50,24.6],[25,75,26.6],[25,100,28.4],
  [30,0,22.7],[30,25,26.7],[30,50,29.5],[30,75,31.7],[30,100,33.6],
  [35,0,26.4],[35,25,31.3],[35,50,34.5],[35,75,36.8],[35,100,38.9],
  [40,0,30.1],[40,25,35.9],[40,50,39.4],[40,75,42.0],[40,100,44.1]
];
for (const [temperature, humidity, expected] of apparentGolden) {
  test(`X apparent ${temperature}C ${humidity}% -> ${expected}C`, () => {
    assert.equal(Core.apparentTemperature(temperature, humidity), expected);
  });
}

// 30 exact threshold-boundary regressions, including disabled and invalid input.
const exceededCases = [
  [-1,0,true,false],[0,0,true,true],[0.1,0,true,true],[32.9,33,true,false],[33,33,true,true],
  [33.1,33,true,true],[84,85,true,false],[85,85,true,true],[86,85,true,true],[14,15,true,false],
  [15,15,true,true],[16,15,true,true],[13.9,14,true,false],[14,14,true,true],[14.1,14,true,true],
  ['33','33',true,true],['32.9','33',true,false],['85',85,true,true],[0,'0',true,true],[-50,-50,true,true],
  [60,60,true,true],[200,200,true,true],[80,80,true,true],[33,33,false,false],[100,0,false,false],
  [NaN,33,true,false],[undefined,33,true,false],['bad',33,true,false],[33,NaN,true,false],[33,'bad',true,false]
];
exceededCases.forEach(([value, threshold, enabled, expected], index) => {
  test(`X exceeded matrix ${index + 1}`, () => {
    assert.equal(Core.isExceeded(value, threshold, enabled), expected);
  });
});

// 40 chart-state regressions: ten data conditions for each chart metric.
const chartConfigs = [
  ['temperature','temperatureC',33],['humidity','humidityPct',85],['wind','windSpeedMs',14],['rain','rain1hMm',15]
];
const chartOffsets = [
  ['far-below',-10,false],['below',-1,false],['just-below',-0.1,false],['equal',0,true],
  ['just-above',0.1,true],['above',1,true],['far-above',10,true],['numeric-string',0,true],
  ['null',null,false],['undefined',undefined,false]
];
for (const [metric, key, threshold] of chartConfigs) {
  for (const [label, offset, expectedExceeded] of chartOffsets) {
    test(`X chart ${metric} ${label}`, () => {
      let value;
      if (label === 'numeric-string') value = String(threshold);
      else if (label === 'null') value = null;
      else if (label === 'undefined') value = undefined;
      else value = threshold + offset;
      const state = Core.chartMetricState({ [key]: value }, metric, defaults);
      assert.equal(state.metric, metric);
      assert.equal(state.key, key);
      assert.equal(state.exceeded, expectedExceeded);
      assert.equal(state.color, expectedExceeded ? 'danger' : 'normal');
    });
  }
}

// 30 official-warning normalization and filtering regressions.
const warningLevelCases = [
  ['1',1,'예비특보'],['p',1,'예비특보'],['PRELIMINARY',1,'예비특보'],['예비특보',1,'예비특보'],
  ['2',2,'주의보'],['a',2,'주의보'],['ADVISORY',2,'주의보'],['주의보',2,'주의보'],
  ['3',3,'경보'],['w',3,'경보'],['WARNING',3,'경보'],['경보',3,'경보'],
  ['4',4,'중대경보'],['m',4,'중대경보'],['CRITICAL',4,'중대경보'],['중대경보',4,'중대경보']
];
for (const [input, rank, label] of warningLevelCases) {
  test(`X warning level ${input}`, () => {
    const level = Core.warningLevel(input);
    assert.equal(level.rank, rank);
    assert.equal(level.label, label);
  });
}

const warningCommandCases = [
  ['1','발표',true],['2','대치',true],['3','해제',false],['4','대치해제',false],
  ['5','연장',true],['6','변경',true],['7','변경해제',false]
];
for (const [input, label, active] of warningCommandCases) {
  test(`X warning command ${input}`, () => {
    const command = Core.warningCommand(input);
    assert.equal(command.label, label);
    assert.equal(command.active, active);
  });
}

const officialCases = [
  ['heat-active',{type:'폭염',command:'1',levelCode:'2'},defaults,1],
  ['rain-active',{type:'호우',command:'2',levelCode:'3'},defaults,1],
  ['typhoon-active',{type:'태풍',command:'5',levelCode:'4'},defaults,1],
  ['cleared',{type:'폭염',command:'3',levelCode:'2'},defaults,0],
  ['unknown-level',{type:'호우',command:'1',levelCode:'9'},defaults,0],
  ['disabled-all',{type:'태풍',command:'1',levelCode:'3'},{...defaults,warningEnabled:false},0],
  ['disabled-type',{type:'호우',command:'1',levelCode:'2'},{...defaults,warningRain:false},0]
];
for (const [name, warning, settings, expectedLength] of officialCases) {
  test(`X official warning ${name}`, () => {
    assert.equal(Core.officialWarningEvents([warning], settings).length, expectedLength);
  });
}

// 20 weekly grouping and alarm-state regressions.
const weeklyCases = [
  ['temp-below',[{date:'20260803',maxTempC:32.9}],[],0],
  ['temp-equal',[{date:'20260803',maxTempC:33}],[],1],
  ['temp-above',[{date:'20260803',maxTempC:34}],[],1],
  ['apparent-below',[{date:'20260803',maxApparentC:32.9}],[],0],
  ['apparent-equal',[{date:'20260803',maxApparentC:33}],[],1],
  ['both-heat',[{date:'20260803',maxTempC:34,maxApparentC:35}],[],1],
  ['official-only',[],[{type:'호우',command:'1',levelCode:'2',effectiveAt:'202608031200'}],1],
  ['same-day-group',[{date:'20260803',maxTempC:34}],[{type:'폭염',command:'1',levelCode:'2',effectiveAt:'202608031200'}],1],
  ['two-days',[{date:'20260803',maxTempC:34},{date:'20260804',maxTempC:35}],[],2],
  ['disabled-heat',[{date:'20260803',maxTempC:40}],[],0,{...defaults,heatEnabled:false}]
];
for (const [name, days, warnings, expectedLength, settings = defaults] of weeklyCases) {
  test(`X weekly ${name}`, () => {
    assert.equal(Core.weeklyHighlights(days, settings, warnings).length, expectedLength);
  });
}

const alarmCases = [
  ['new-current',[],[{id:'temperature',scope:'current'}],'수원',1],
  ['existing-current',['수원|current|temperature|'],[{id:'temperature',scope:'current'}],'수원',0],
  ['new-location',['수원|current|temperature|'],[{id:'temperature',scope:'current'}],'군산',1],
  ['new-forecast-time',[],[{id:'temperature',scope:'forecast',forecastAt:'202608031200'}],'수원',1],
  ['existing-forecast',['수원|forecast|temperature|202608031200'],[{id:'temperature',scope:'forecast',forecastAt:'202608031200'}],'수원',0],
  ['changed-forecast-time',['수원|forecast|temperature|202608031100'],[{id:'temperature',scope:'forecast',forecastAt:'202608031200'}],'수원',1],
  ['new-official',[],[{id:'warning:폭염:1',scope:'official',level:'주의보'}],'수원',1],
  ['existing-official',['수원|official|warning:폭염:1|주의보'],[{id:'warning:폭염:1',scope:'official',level:'주의보'}],'수원',0],
  ['raised-official',['수원|official|warning:폭염:1|주의보'],[{id:'warning:폭염:1',scope:'official',level:'경보'}],'수원',1],
  ['empty-events',['수원|current|temperature|'],[],'수원',0]
];
for (const [name, previous, events, location, expectedNew] of alarmCases) {
  test(`X alarm reconcile ${name}`, () => {
    const result = Core.reconcileAlarmState(previous, events, location);
    assert.equal(result.newEvents.length, expectedNew);
    assert.equal(result.activeKeys.length, events.length);
  });
}

// 10 static mobile-layout contracts that prevent any card from widening the viewport.
const mobile = fs.readFileSync(require.resolve('../mobile.html'), 'utf8');
const mobileLayoutContracts = [
  ['page is capped',/\.mobile-page \.page\{width:100%;max-width:520px;/],
  ['outer cards share width',/\.mobile-page \.page>\.card,\.mobile-page \.layout,\.mobile-page \.layout \.card\{width:100%;min-width:0;max-width:100%;/],
  ['inner cards share width',/\.mobile-page \.location-now,[^{]+\{width:100%;min-width:0;max-width:100%\}/],
  ['current weather is capped',/\.mobile-page #currentWeather\{width:100%;max-width:100%;min-width:0;/],
  ['weather hero subtracts margins',/\.mobile-page \.weather-hero\{width:calc\(100% - 24px\);max-width:calc\(100% - 24px\);min-width:0;/],
  ['weather mini grid is capped',/\.mobile-page \.weather-mini-grid\{width:100%;min-width:0;max-width:100%;/],
  ['chart svg is capped',/\.mobile-page \.chart-card svg\{width:100%;max-width:100%;/],
  ['check grid uses shrinkable columns',/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/],
  ['alarm actions use shrinkable columns',/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/],
  ['horizontal body overflow is blocked',/html,body\.mobile-page\{width:100%;max-width:100%;overflow-x:hidden\}/]
];
for (const [name, pattern] of mobileLayoutContracts) {
  test(`X mobile layout ${name}`, () => assert.match(mobile, pattern));
}
