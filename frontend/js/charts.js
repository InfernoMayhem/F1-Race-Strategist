  let chartLap, chartFuel, chartTyre;

function registerAnnotation() {
  try {
    if (window.ChartAnnotation) window.Chart.register(window.ChartAnnotation);
    else if (window['chartjs-plugin-annotation']) window.Chart.register(window['chartjs-plugin-annotation']);
  } catch (e) {}
}

function baseOptions(yTitle, chartTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      title: { 
        display: !!chartTitle, 
        text: chartTitle,
        color: '#e9e9e9',
        font: { size: 14, weight: 'bold' },
        padding: { bottom: 10 }
      },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}` } },
      annotation: { annotations: {} }
    },
    scales: {
      x: { title: { display: true, text: 'Lap' } },
      y: { title: { display: true, text: yTitle } }
    }
  };
}

export function ensureCharts() {
  registerAnnotation();
  if (!chartLap) {
    const c1 = document.getElementById('lapChart');
    if (c1) chartLap = new window.Chart(c1, { type: 'line', data: { labels: [], datasets: [] }, options: baseOptions('Lap Time (s)', 'Lap Time Evolution') });
  }
  if (!chartFuel) {
    const c2 = document.getElementById('fuelChart');
    if (c2) chartFuel = new window.Chart(c2, { type: 'line', data: { labels: [], datasets: [] }, options: baseOptions('Fuel Load (kg)', 'Fuel Mass') });
  }
  if (!chartTyre) {
    const c3 = document.getElementById('tyreChart');
    if (c3) chartTyre = new window.Chart(c3, { type: 'line', data: { labels: [], datasets: [] }, options: baseOptions('Tyre Wear (s penalty)', 'Tyre Degradation') });
  }
}

export function renderStrategyCharts(strategy) {
  ensureCharts();
  if (!strategy || !chartLap || !chartFuel || !chartTyre) return;

  const series = strategy.lapSeries || [];
  const labels = series.map(p => p.lap);
  const lapTimes = series.map(p => p.time);
  const fuelLoads = series.map(p => p.fuelLoad);
  const tyreWear = series.map(p => p.tyrePenalty);
  const pitSet = new Set((strategy.pitLaps || []).map(Number));
  const fastLapNum = strategy.fastestLap ? strategy.fastestLap.lapNumber : -1;

  const pointRadiusFunc = (ctx) => {
    const l = labels[ctx.dataIndex];
    if (l === fastLapNum) return 5;
    if (pitSet.has(l)) return 3;
    return 0;
  };
  const pointColorFunc = (ctx) => {
    const l = labels[ctx.dataIndex];
    if (l === fastLapNum) return '#d8b4fe';
    return '#ff9a3c';
  };

  const buildAnnotations = () => {
    const anns = {};
    (strategy.pitLaps || []).forEach((lap, i) => {
      const key = `pit_${i}_${lap}`;
      anns[key] = {
        type: 'line',
        xMin: lap,
        xMax: lap,
        borderColor: 'rgba(255,154,60,0.9)',
        borderWidth: 2,
        label: { enabled: true, content: 'Pit', position: 'start', backgroundColor: 'rgba(255,154,60,0.15)', color: '#111' },
        scaleID: 'x'
      };
    });
    return anns;
  };

  chartLap.data.labels = labels;
  chartLap.data.datasets = [{
    label: 'Lap Time (s)',
    data: lapTimes,
    borderColor: '#1976d2',
    backgroundColor: 'rgba(25,118,210,0.2)',
    tension: 0.3,
    fill: false,
    pointRadius: pointRadiusFunc,
    pointBackgroundColor: pointColorFunc,
    pointBorderColor: pointColorFunc,
    pointHoverRadius: 6
  }];
  if (chartLap.options.plugins.annotation) {
    chartLap.options.plugins.annotation.annotations = buildAnnotations();
  }
  chartLap.update();

  chartFuel.data.labels = labels;
  chartFuel.data.datasets = [{
    label: 'Fuel Load (kg)',
    data: fuelLoads,
    borderColor: '#2e7d32',
    backgroundColor: 'rgba(46,125,50,0.2)',
    tension: 0.3,
    fill: false,
    pointRadius: pointRadiusFunc,
    pointBackgroundColor: pointColorFunc,
    pointBorderColor: pointColorFunc,
    pointHoverRadius: 6
  }];
  if (chartFuel.options.plugins.annotation) {
    chartFuel.options.plugins.annotation.annotations = buildAnnotations();
  }
  chartFuel.update();

  chartTyre.data.labels = labels;
  chartTyre.data.datasets = [{
    label: 'Tyre Wear (s penalty)',
    data: tyreWear,
    borderColor: '#c62828',
    backgroundColor: 'rgba(198,40,40,0.2)',
    tension: 0.3,
    fill: false,
    pointRadius: pointRadiusFunc,
    pointBackgroundColor: pointColorFunc,
    pointBorderColor: pointColorFunc,
    pointHoverRadius: 6
  }];
  if (chartTyre.options.plugins.annotation) {
    chartTyre.options.plugins.annotation.annotations = buildAnnotations();
  }
  chartTyre.update();
}
