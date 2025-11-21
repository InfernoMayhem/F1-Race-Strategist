import { renderStrategyCharts } from './charts.js';

export function updateViewingLabel(stops) {
  const el = document.getElementById('recommendedLabel');
  if (!el) return;
  if (stops == null) {
    el.textContent = '(none)';
  } else if (stops === 1) {
    el.textContent = '1 stop';
  } else {
    el.textContent = `${stops} stops`;
  }
}

export function formatTime(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return '—';
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const secs = Math.floor(totalSeconds) % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hrs = Math.floor(totalSeconds / 3600);
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  return `${hrs > 0 ? pad(hrs) + ':' : ''}${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

export function buildStintSchedule(strategy) {
  if (!strategy || !Array.isArray(strategy.stints)) return [];
  const schedule = [];
  let lapStart = 1;
  strategy.stints.forEach((st) => {
    const len = st.laps || (Array.isArray(st.lapTimes) ? st.lapTimes.length : 0);
    if (!len) return;
    const lapEnd = lapStart + len - 1;
    const compound = st.compound || st.tyre || 'Tyre';
    schedule.push(`Lap ${lapStart}–${lapEnd}: ${compound}`);
    lapStart = lapEnd + 1;
  });
  return schedule;
}

export function setStrategyStatus(msg) {
  const el = document.getElementById('strategyStatus');
  if (el) el.textContent = msg || '';
}

export function renderStrategyCards(bestByStops, overallBest, currentStops, onSelect) {
  const container = document.getElementById('strategyCards');
  if (!container) return;
  container.innerHTML = '';
  const order = [1, 2, 3].filter((n) => bestByStops && bestByStops[n]);
  if (!order.length) {
    setStrategyStatus('No strategies found. Try adjusting inputs.');
    return;
  }
  setStrategyStatus('');
  order.forEach((stops) => {
    const s = bestByStops[stops];
    const isSelected = currentStops === stops;
    const isOptimal = overallBest && (overallBest.targetStops === stops || overallBest.actualStops === stops);
    const pitLaps = s.pitLaps || [];
    const totalTime = s.totalTime;
    const schedule = buildStintSchedule(s);
    const actualStopsInfo = (s.actualStops != null && s.actualStops !== stops) ? `<span class="pill">Actual: ${s.actualStops} stop${s.actualStops===1?'':'s'}</span>` : '';

    const card = document.createElement('div');
    card.className = `strategy-card${isSelected ? ' selected' : ''}`;
    card.innerHTML = `
      <div class="title">
        <div>${stops} stop${stops === 1 ? '' : 's'}</div>
        <div>
          <span class="pill">Pit laps: ${pitLaps.length ? pitLaps.join(', ') : '—'}</span>
          ${actualStopsInfo}
          ${isSelected ? '<span class="pill viewing">Viewing</span>' : ''}
          ${isOptimal ? '<span class="pill opt">Optimal</span>' : ''}
        </div>
      </div>
      <div class="meta"><div>Total time: <strong>${formatTime(totalTime)}</strong></div></div>
      <div class="schedule">${schedule.map((seg) => `<span class=\"seg\">${seg}</span>`).join('')}</div>
    `;
    card.addEventListener('click', () => onSelect(stops, s, card));
    container.appendChild(card);
  });
}
