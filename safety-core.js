/* node:coverage disable */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SafetyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
/* node:coverage enable */
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    heatEnabled: true,
    heatTempEnabled: true,
    heatTempThreshold: 33,
    heatAppEnabled: true,
    heatAppThreshold: 33,
    rainEnabled: true,
    rainThreshold: 15,
    windEnabled: true,
    windThreshold: 14,
    humidityChartThreshold: 85,
    warningEnabled: true,
    warningHeat: true,
    warningRain: true,
    warningTyphoon: true,
    interval: 5
  });

  const METRICS = Object.freeze({
    temperature: { key: 'temperatureC', label: '온도', unit: '℃' },
    humidity: { key: 'humidityPct', label: '습도', unit: '%' },
    wind: { key: 'windSpeedMs', label: '풍속', unit: 'm/s' },
    rain: { key: 'rain1hMm', label: '강수량', unit: 'mm' }
  });

  function asBool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function boundedNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      heatEnabled: asBool(r.heatEnabled, DEFAULT_SETTINGS.heatEnabled),
      heatTempEnabled: asBool(r.heatTempEnabled, DEFAULT_SETTINGS.heatTempEnabled),
      heatTempThreshold: boundedNumber(r.heatTempThreshold, DEFAULT_SETTINGS.heatTempThreshold, -50, 60),
      heatAppEnabled: asBool(r.heatAppEnabled, DEFAULT_SETTINGS.heatAppEnabled),
      heatAppThreshold: boundedNumber(r.heatAppThreshold, DEFAULT_SETTINGS.heatAppThreshold, -50, 70),
      rainEnabled: asBool(r.rainEnabled, DEFAULT_SETTINGS.rainEnabled),
      rainThreshold: boundedNumber(r.rainThreshold, DEFAULT_SETTINGS.rainThreshold, 0, 200),
      windEnabled: asBool(r.windEnabled, DEFAULT_SETTINGS.windEnabled),
      windThreshold: boundedNumber(r.windThreshold, DEFAULT_SETTINGS.windThreshold, 0, 80),
      humidityChartThreshold: boundedNumber(r.humidityChartThreshold, DEFAULT_SETTINGS.humidityChartThreshold, 0, 100),
      warningEnabled: asBool(r.warningEnabled, DEFAULT_SETTINGS.warningEnabled),
      warningHeat: asBool(r.warningHeat, DEFAULT_SETTINGS.warningHeat),
      warningRain: asBool(r.warningRain, DEFAULT_SETTINGS.warningRain),
      warningTyphoon: asBool(r.warningTyphoon, DEFAULT_SETTINGS.warningTyphoon),
      interval: Math.round(boundedNumber(r.interval, DEFAULT_SETTINGS.interval, 1, 60))
    };
  }

  // 기상청 여름철 체감온도: Stull 습구온도 추정식 + 기상청 산식.
  function apparentTemperature(temperatureC, humidityPct) {
    const ta = Number(temperatureC);
    let rh = Number(humidityPct);
    if (!Number.isFinite(ta) || !Number.isFinite(rh)) return null;
    rh = Math.min(100, Math.max(0, rh));
    const tw = ta * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
      + Math.atan(ta + rh)
      - Math.atan(rh - 1.67633)
      + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
      - 4.686035;
    const at = -0.2442 + 0.55399 * tw + 0.45535 * ta - 0.0022 * tw * tw + 0.00278 * tw * ta + 3.0;
    return Math.round(at * 10) / 10;
  }

  function isExceeded(value, threshold, enabled) {
    const v = Number(value);
    const t = Number(threshold);
    return Boolean(enabled && Number.isFinite(v) && Number.isFinite(t) && v >= t);
  }

  function userThresholdEvents(point, settingsInput, scope) {
    const settings = normalizeSettings(settingsInput);
    const p = point || {};
    const events = [];
    const apparent = apparentTemperature(p.temperatureC, p.humidityPct);
    const at = scope === 'forecast' ? String(p.forecastAt || '') : '';
    if (isExceeded(p.temperatureC, settings.heatTempThreshold, settings.heatEnabled && settings.heatTempEnabled)) {
      events.push({ id: 'temperature', type: '폭염', criterion: '기온', value: Number(p.temperatureC), threshold: settings.heatTempThreshold, unit: '℃', scope, forecastAt: at, label: '기온 기준 초과' });
    }
    if (isExceeded(apparent, settings.heatAppThreshold, settings.heatEnabled && settings.heatAppEnabled)) {
      events.push({ id: 'apparent', type: '폭염', criterion: '체감온도', value: apparent, threshold: settings.heatAppThreshold, unit: '℃', scope, forecastAt: at, label: '체감온도 기준 초과' });
    }
    if (isExceeded(p.rain1hMm, settings.rainThreshold, settings.rainEnabled)) {
      events.push({ id: 'rain', type: '강수', criterion: '1시간 강수량', value: Number(p.rain1hMm), threshold: settings.rainThreshold, unit: 'mm', scope, forecastAt: at, label: '강수 기준 초과' });
    }
    if (isExceeded(p.windSpeedMs, settings.windThreshold, settings.windEnabled)) {
      events.push({ id: 'wind', type: '풍속', criterion: '풍속', value: Number(p.windSpeedMs), threshold: settings.windThreshold, unit: 'm/s', scope, forecastAt: at, label: '풍속 기준 초과' });
    }
    return { events, apparent };
  }

  function chartMetricState(point, metric, settingsInput) {
    const settings = normalizeSettings(settingsInput);
    const config = METRICS[metric];
    if (!config) throw new Error('지원하지 않는 차트 항목입니다.');
    const p = point || {};
    let enabled = true;
    let threshold;
    if (metric === 'temperature') {
      enabled = settings.heatEnabled && settings.heatTempEnabled;
      threshold = settings.heatTempThreshold;
    } else if (metric === 'humidity') {
      threshold = settings.humidityChartThreshold;
    } else if (metric === 'wind') {
      enabled = settings.windEnabled;
      threshold = settings.windThreshold;
    } else {
      enabled = settings.rainEnabled;
      threshold = settings.rainThreshold;
    }
    const value = Number(p[config.key]);
    const exceeded = isExceeded(value, threshold, enabled);
    return { metric, key: config.key, label: config.label, unit: config.unit, value: Number.isFinite(value) ? value : null, threshold, enabled, exceeded, color: exceeded ? 'danger' : 'normal' };
  }

  function chartSlots(points, metric, settingsInput) {
    const rows = Array.isArray(points) ? points : [];
    const count = rows.length;
    return rows.map((point, index) => {
      const state = chartMetricState(point, metric, settingsInput);
      const start = count <= 1 ? 0 : (index === 0 ? 0 : (index - 0.5) / (count - 1));
      const end = count <= 1 ? 1 : (index === count - 1 ? 1 : (index + 0.5) / (count - 1));
      return { ...state, index, start, end, forecastAt: String(point.forecastAt || '') };
    });
  }

  function warningLevel(code) {
    const c = String(code == null ? '' : code).trim().toUpperCase();
    if (c === '1' || c === 'P' || c === 'PRELIMINARY' || c === '예비특보') return { code: '1', label: '예비특보', rank: 1 };
    if (c === '2' || c === 'A' || c === 'ADVISORY' || c === '주의보') return { code: '2', label: '주의보', rank: 2 };
    if (c === '3' || c === 'W' || c === 'WARNING' || c === '경보') return { code: '3', label: '경보', rank: 3 };
    if (c === '4' || c === 'M' || c === 'CRITICAL' || c === '중대경보') return { code: '4', label: '중대경보', rank: 4 };
    return { code: c, label: '수준 미상', rank: 0 };
  }

  function warningCommand(code) {
    const c = String(code == null ? '' : code).trim();
    const map = { '1': '발표', '2': '대치', '3': '해제', '4': '대치해제', '5': '연장', '6': '변경', '7': '변경해제' };
    return { code: c, label: map[c] || '명령 미상', active: ['1', '2', '5', '6'].includes(c) };
  }

  function officialWarningEvents(warnings, settingsInput) {
    const settings = normalizeSettings(settingsInput);
    if (!settings.warningEnabled) return [];
    const allowed = { 폭염: settings.warningHeat, 호우: settings.warningRain, 태풍: settings.warningTyphoon };
    return (Array.isArray(warnings) ? warnings : [])
      .filter(w => allowed[w && w.type] && warningCommand(w.command).active)
      .map(w => {
        const level = warningLevel(w.levelCode != null ? w.levelCode : w.level);
        return {
          id: `warning:${w.type}:${w.regionCode || w.regionName || ''}`,
          type: w.type,
          criterion: '기상청 특보',
          scope: 'official',
          level: level.label,
          levelRank: level.rank,
          announcedAt: String(w.announcedAt || ''),
          effectiveAt: String(w.effectiveAt || ''),
          region: [w.regionUpperName, w.regionName].filter(Boolean).join(' '),
          label: `${w.type} ${level.label}`
        };
      })
      .filter(event => event.levelRank > 0)
      .sort((a, b) => b.levelRank - a.levelRank);
  }

  function parseCompactKst(value) {
    const s = String(value || '');
    if (!/^\d{12}$/.test(s)) return null;
    const year = Number(s.slice(0, 4));
    const month = Number(s.slice(4, 6));
    const day = Number(s.slice(6, 8));
    const hour = Number(s.slice(8, 10));
    const minute = Number(s.slice(10, 12));
    const ms = Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0);
    return ms;
  }

  function isFutureForecastAt(value, nowInput) {
    const forecastMs = parseCompactKst(value);
    const nowMs = nowInput instanceof Date ? nowInput.getTime() : (nowInput == null ? Date.now() : Number(nowInput));
    return forecastMs !== null && Number.isFinite(nowMs) && forecastMs > nowMs;
  }

  function forecastEventPhrase(event, nowInput) {
    const e = event || {};
    const s = String(e.forecastAt || '');
    const time = s.length >= 12 ? `${s.slice(8, 10)}:${s.slice(10, 12)}` : '예보 시각';
    return isFutureForecastAt(s, nowInput) ? `${time} 예보에서 ${e.label || '기준 초과'} 예상` : `${time} 예보 기준 ${e.label || '기준 초과'}`;
  }

  function buildAssessment(data, settingsInput, nowInput) {
    const settings = normalizeSettings(settingsInput);
    const source = data || {};
    const currentResult = userThresholdEvents(source.weather || {}, settings, 'current');
    const forecast = (Array.isArray(source.forecast) ? source.forecast : []).map(point => ({ point, ...userThresholdEvents(point, settings, 'forecast') }));
    const official = officialWarningEvents(source.warnings, settings);
    const stale = Boolean(source.weather && source.weather.isStale);
    const delayed = Boolean(source.weather && source.weather.isDelayed);
    const currentEvents = stale ? [] : currentResult.events;
    const forecastEvents = forecast
      .filter(row => isFutureForecastAt(row.point && row.point.forecastAt, nowInput))
      .flatMap(row => row.events);
    const allEvents = [...official, ...currentEvents, ...forecastEvents];
    let status = '현재 기준 초과 없음';
    let statusKind = 'normal';
    if (stale) {
      status = '기상 자료 갱신 지연';
      statusKind = 'delayed';
    } else if (official.length) {
      status = official[0].label;
      statusKind = official[0].levelRank >= 3 ? 'danger' : 'warning';
    } else if (currentEvents.length) {
      status = currentEvents[0].label;
      statusKind = 'warning';
    } else if (delayed) {
      status = '최신 관측 반영 지연';
      statusKind = 'delayed';
    }
    return { settings, current: currentResult, currentEvents, forecast, forecastEvents, official, allEvents, status, statusKind, stale, delayed };
  }

  function buildSafetyGuidance(assessment) {
    const a = assessment || { current: { apparent: null }, currentEvents: [], official: [] };
    const actions = [];
    const legal = [];
    const apparent = Number(a.current && a.current.apparent);
    const currentEvents = Array.isArray(a.currentEvents) ? a.currentEvents : [];
    const official = Array.isArray(a.official) ? a.official : [];
    const hasHeat = currentEvents.some(e => e.type === '폭염') || official.some(e => e.type === '폭염');
    const hasRain = currentEvents.some(e => e.type === '강수') || official.some(e => e.type === '호우');
    const hasWind = currentEvents.some(e => e.type === '풍속');
    const hasTyphoon = official.some(e => e.type === '태풍');
    const highestOfficialRank = official.reduce((max, e) => Math.max(max, Number(e.levelRank) || 0), 0);

    if (highestOfficialRank === 1) {
      actions.push('예비특보 단계입니다. 취약 작업 목록, 작업중지 판단 기준, 대피 장소, 비상연락망을 확인하고 작업자에게 사전 공유합니다.');
    } else if (highestOfficialRank === 2) {
      actions.push('주의보 단계입니다. 고소·굴착·양중·옥외작업의 착수 여부를 다시 판단하고, 관리감독자 순찰과 비상대기를 강화합니다.');
    } else if (highestOfficialRank >= 3) {
      actions.push('경보 이상 단계입니다. 현장 위험성평가 결과에 따라 취약 작업을 즉시 중지하고 작업자를 안전한 장소로 이동시킵니다.');
    }

    if (hasHeat || (Number.isFinite(apparent) && apparent >= 31)) {
      actions.push('시원한 물을 작업장 가까이에 충분히 비치하고, 그늘 또는 냉방이 되는 휴식공간과 온·습도계를 확보합니다.');
      actions.push('작업시간대 조정, 작업 강도·시간 단축, 교대작업, 냉방·통풍장치 가동 중 현장에 적합한 조치를 즉시 시행합니다.');
      actions.push('어지럼, 두통, 메스꺼움, 근육경련, 의식저하가 나타나면 작업을 중지하고 시원한 장소로 이동시킨 뒤 119 신고와 응급조치를 실시합니다.');
      legal.push('산업안전보건기준에 관한 규칙 제560조제2항: 폭염작업 시 냉방·통풍, 작업시간대 조정 또는 적절한 휴식시간 부여');
      legal.push('같은 규칙 제562조제2항·제3항: 온·습도계 비치, 예방·응급조치 사전 고지, 체감온도와 조치사항 기록, 온열질환 의심 시 119 신고 등');
      if (Number.isFinite(apparent) && apparent >= 33) {
        actions.push('체감온도 33℃ 이상 폭염작업은 매 2시간 이내에 20분 이상 실제 작업을 멈추고 체온을 낮출 수 있는 휴식을 부여합니다.');
        legal.push('산업안전보건기준에 관한 규칙 제560조제3항: 체감온도 33℃ 이상 폭염작업 시 매 2시간 이내 20분 이상 휴식');
      }
      if (Number.isFinite(apparent) && apparent >= 35) {
        actions.push('체감온도 35℃ 이상이면 불가피한 경우를 제외하고 14~17시 옥외작업을 중지하거나 작업시간대를 적극 조정합니다.');
        legal.push('고용노동부 2026년 폭염 단계별 조치 권고: 체감온도 35℃ 이상 시 14~17시 옥외작업 중지');
      }
      if ((Number.isFinite(apparent) && apparent >= 38) || highestOfficialRank >= 4) {
        actions.push('체감온도 38℃ 이상 또는 폭염중대경보이면 긴급조치가 필요한 작업 외 모든 옥외작업을 중단하고 중단–이동–확인 절차를 시행합니다.');
        legal.push('고용노동부 2026년 폭염 단계별 조치 권고 및 기상청 폭염중대경보 행동요령: 긴급조치 외 옥외작업 중단');
      }
    }
    if (hasRain || hasTyphoon) {
      actions.push('저지대·지하·맨홀·배수로·굴착부의 침수 가능성을 확인하고 배수펌프, 비상전원, 대피로를 즉시 점검합니다.');
      actions.push('고소·굴착·밀폐공간·전기설비 주변 작업은 위험성평가 후 중지 또는 축소하고 침수·감전 우려 구역의 출입을 통제합니다.');
      actions.push('화학물질·폐기물 저장용기, 옥외 배관, 방유제와 유출 차단 설비를 점검하여 빗물 유입과 월류를 차단합니다.');
      legal.push('산업안전보건기준에 관한 규칙 제37조제1항: 비·눈·바람 등 불안정한 기상으로 근로자가 위험해질 우려가 있으면 작업 중지');
    }
    if (hasWind || hasTyphoon) {
      actions.push('크레인·고소작업대·양중·비계 작업은 장비 사용설명서와 현장 허용풍속을 확인하고 기준 초과 시 즉시 중지합니다.');
      actions.push('가설울타리, 간판, 덮개, 자재, 실린더와 이동식 설비를 고정하고 낙하·전도·비산 위험구역의 출입을 통제합니다.');
      legal.push('산업안전보건기준에 관한 규칙 제37조: 악천후와 강풍으로 위험이 예상되는 작업의 중지 및 안전조치');
    }
    if (!actions.length) {
      actions.push('작업 전 시원한 물·휴식공간·배수시설·비상연락망을 점검하고 현장 온·습도계와 기상특보를 함께 확인합니다.');
      actions.push('기상값이 설정 기준 미만이어도 공정·장비·작업자 상태에 따른 현장 위험성평가 결과를 우선합니다.');
      legal.push('산업안전보건법 제36조: 유해·위험요인을 파악하고 위험성평가 결과에 따라 필요한 조치를 시행');
    }
    return { actions, legalBasis: [...new Set(legal)] };
  }

  function buildAlarmGuidance(event, assessment) {
    const e = event || {};
    const baseApparent = Number(assessment && assessment.current && assessment.current.apparent);
    const eventApparent = e.criterion === '체감온도' ? Number(e.value) : baseApparent;
    const shadow = {
      current: { apparent: Number.isFinite(eventApparent) ? eventApparent : null },
      currentEvents: e.scope === 'official' || !e.type ? [] : [e],
      official: e.scope === 'official' ? [e] : []
    };
    const guide = buildSafetyGuidance(shadow);
    if (e.scope === 'forecast' && guide.actions.length) {
      guide.actions.unshift(`${forecastEventPhrase(e)}입니다. 해당 시각 전에 작업계획과 휴식·중지 기준을 조정하고 작업자에게 미리 알립니다.`);
    }
    return guide;
  }

  function alarmKey(event, locationKey) {
    const e = event || {};
    const location = String(locationKey || '');
    if (e.scope === 'official') return `${location}|official|${e.id || ''}|${e.level || ''}`;
    return `${location}|${e.scope || 'current'}|${e.id || e.criterion || ''}|${e.forecastAt || ''}`;
  }

  function reconcileAlarmState(previousKeys, events, locationKey) {
    const previous = new Set(Array.isArray(previousKeys) ? previousKeys : []);
    const currentKeys = [];
    const newEvents = [];
    for (const event of Array.isArray(events) ? events : []) {
      const key = alarmKey(event, locationKey);
      currentKeys.push(key);
      if (!previous.has(key)) newEvents.push({ ...event, alarmKey: key });
    }
    return { activeKeys: currentKeys, newEvents };
  }

  function weeklyHighlights(days, settingsInput, officialWarnings) {
    const settings = normalizeSettings(settingsInput);
    const grouped = new Map();
    function add(date, type, text) {
      const key = String(date || '');
      if (!grouped.has(key)) grouped.set(key, { date: key, types: new Set(), texts: [] });
      const row = grouped.get(key);
      row.types.add(type);
      if (!row.texts.includes(text)) row.texts.push(text);
    }
    for (const day of Array.isArray(days) ? days : []) {
      const date = String(day.date || '');
      const heatTexts = [];
      if (isExceeded(day.maxTempC, settings.heatTempThreshold, settings.heatEnabled && settings.heatTempEnabled)) {
        heatTexts.push(`최고기온 ${Number(day.maxTempC).toFixed(1)}℃로 기온 기준 초과 예상`);
      }
      if (isExceeded(day.maxApparentC, settings.heatAppThreshold, settings.heatEnabled && settings.heatAppEnabled)) {
        heatTexts.push(`최고체감온도 ${Number(day.maxApparentC).toFixed(1)}℃로 체감온도 기준 초과 예상`);
      }
      if (heatTexts.length) add(date, 'heat', `폭염 · ${heatTexts.join(' · ')}`);
    }
    for (const warning of officialWarningEvents(officialWarnings, settings)) {
      add(warning.effectiveAt.slice(0, 8), 'official', `기상특보 · ${warning.region || '현재 지역'} ${warning.label}`);
    }
    return [...grouped.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(row => ({ date: row.date, type: row.types.has('official') ? 'official' : 'heat', text: row.texts.join(' · ') }));
  }

  return {
    DEFAULT_SETTINGS,
    METRICS,
    normalizeSettings,
    apparentTemperature,
    isExceeded,
    userThresholdEvents,
    chartMetricState,
    chartSlots,
    warningLevel,
    warningCommand,
    officialWarningEvents,
    parseCompactKst,
    isFutureForecastAt,
    forecastEventPhrase,
    buildAssessment,
    buildSafetyGuidance,
    buildAlarmGuidance,
    alarmKey,
    reconcileAlarmState,
    weeklyHighlights
  };
});
