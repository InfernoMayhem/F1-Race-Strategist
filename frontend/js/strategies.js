import { renderStrategyCharts } from './charts.js';

// helper function to convert seconds into a readable format
export function formatTime(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return '—';
  
  // breakup the time into components
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const secs = Math.floor(totalSeconds) % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hrs = Math.floor(totalSeconds / 3600);
  
  // ensure everything is double digits if needed
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  
  return `${hrs > 0 ? pad(hrs) + ':' : ''}${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

// analyses a strategy objects' stints array to create readable text ranges
export function buildStintSchedule(strategy) {
  if (!strategy || !Array.isArray(strategy.stints)) return [];
  const schedule = [];
  let lapStart = 1;

  strategy.stints.forEach((st) => {
    // determine stint length either from explicit property or calculation array
    const len = st.laps || (Array.isArray(st.lapTimes) ? st.lapTimes.length : 0);
    if (!len) return;
    
    const lapEnd = lapStart + len - 1;
    const compound = st.compound || st.tyre || 'Tyre';
    
    schedule.push(`Lap ${lapStart}–${lapEnd}: ${compound}`);
    
    // advance the start pointer for the next stint
    lapStart = lapEnd + 1;
  });
  return schedule;
}

// updates the status text shown above the strategy cards
export function setStrategyStatus(msg) {
  const el = document.getElementById('strategyStatus');
  if (el) el.textContent = msg || '';
}

// main function to draw the summary cards
// bestByStops is an object containing the best strategy for that stop count
export function renderStrategyCards(bestByStops, overallBest, currentStops, onSelect) {
  const container = document.getElementById('strategyCards');
  if (!container) return;
  
  container.innerHTML = '';
  
  // filter to only show keys 1, 2, 3 if they exist in the results
  const order = [1, 2, 3].filter((n) => bestByStops && bestByStops[n]);
  
  if (!order.length) {
    setStrategyStatus('No strategies found. Try adjusting inputs.');
    return;
  }
  
  setStrategyStatus('');
  
  order.forEach((stops) => {
    const s = bestByStops[stops];
    
    // determine styling flags
    const isSelected = currentStops === stops;
    // check if this specific strategy is the mathematically optimal one across all counts
    const isOptimal = overallBest && (overallBest.targetStops === stops || overallBest.actualStops === stops);
    
    const pitLaps = s.pitLaps || [];
    const totalTime = s.totalTime;
    const schedule = buildStintSchedule(s);
    
    // if the strategy unexpectedly did a different number of stops than requested then show
    const actualStopsInfo = (s.actualStops != null && s.actualStops !== stops) ? `<span class="pill">Actual: ${s.actualStops} stop${s.actualStops===1?'':'s'}</span>` : '';
    
    // show fastest lap if available
    const fastestLapInfo = s.fastestLap ? `<div class="sub-meta"><span class="fl-icon"></span> Fastest Lap: <strong>${s.fastestLap.time.toFixed(3)}s</strong> (L${s.fastestLap.lapNumber}, ${s.fastestLap.compound})</div>` : '';

    const card = document.createElement('div');
    card.className = `strategy-card${isSelected ? ' selected' : ''}`;
    
    // inject html template for the card
    card.innerHTML = `
      <div class="title">
        <div>${stops} stop${stops === 1 ? '' : 's'}</div>
        <div>
          <span class="pill">Pit laps: ${pitLaps.length ? pitLaps.join(', ') : '—'}</span>
          ${actualStopsInfo}
          ${isOptimal ? '<span class="pill opt">Optimal</span>' : ''}
        </div>
      </div>
      <div class="meta">
          <div>Total time: <strong>${formatTime(totalTime)}</strong></div>
      </div>
      ${fastestLapInfo}
      <div class="schedule">${schedule.map((seg) => `<span class=\"seg\">${seg}</span>`).join('')}</div>
    `;
    
    // make the card actionable
    card.addEventListener('click', () => onSelect(stops, s, card));
    container.appendChild(card);
  });
}
