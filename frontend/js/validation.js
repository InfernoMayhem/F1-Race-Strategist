// input validation helpers and field validators

export const integer = (v) => {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
};

export const decimal = (v) => {
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};

export const showError = (el, msg) => {
  el.classList.add('input-error');
  let span = el.nextElementSibling;
  if (!(span && span.classList && span.classList.contains('error-text'))) {
    span = document.createElement('div');
    span.className = 'error-text';
    el.insertAdjacentElement('afterend', span);
  }
  let dup = span.nextElementSibling;
  while (dup && dup.classList && dup.classList.contains('error-text')) {
    const toRemove = dup;
    dup = dup.nextElementSibling;
    toRemove.remove();
  }
  span.textContent = msg || '';
};

export const clearError = (el) => {
  el.classList.remove('input-error');
  let span = el.nextElementSibling;
  while (span && span.classList && span.classList.contains('error-text')) {
    const toRemove = span;
    span = span.nextElementSibling;
    toRemove.remove();
  }
};

export function getFieldValidators() {
  return {
    totalLaps: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Total Laps is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Total Laps must be an integer';
      if (n < 1 || n > 100) return 'Total Laps must be 1-100';
      return '';
    },
    trackLength: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Track Length is required';
      const n = decimal(raw);
      if (Number.isNaN(n)) return 'Track Length must be a number';
      if (n < 0.1 || n > 99.9) return 'Track Length must be 0.1-99.9';
      return '';
    },
    fuelLoad: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Fuel Load is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Fuel Load must be an integer';
      if (n < 1 || n > 150) return 'Fuel Load must be 1-150';
      return '';
    },
    trackType: (el) => {
      const v = el.value;
      if (!v) return 'Track Type is required';
      if (!['Permanent', 'Hybrid', 'Street'].includes(v)) return 'Invalid Track Type';
      return '';
    },
    totalRainfall: (el) => {
      const raw = el.value.trim();
      if (!raw) return '';
      const n = decimal(raw);
      if (Number.isNaN(n)) return 'Total Rainfall must be a number';
      if (n < 0) return 'Total Rainfall cannot be negative';
      if (n > 1000) return 'Total Rainfall is unrealistically high';
      return '';
    },
    temperature: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Temperature is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Temperature must be an integer';
      if (n < -10 || n > 50) return 'Temperature must be -10 to 50';
      return '';
    },
    baseLapTime: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Base Lap Time is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Base Lap Time must be an integer';
      if (n < 1 || n > 300) return 'Base Lap Time must be 1-300';
      return '';
    },
    pitStopLoss: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Pit Stop Loss is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Pit Stop Loss must be an integer';
      if (n < 1 || n > 60) return 'Pit Stop Loss must be 1-60';
      return '';
    },
  };
}

export function validateField(id) {
  const el = document.getElementById(id);
  const fields = getFieldValidators();
  if (!el || !fields[id]) return '';
  const msg = fields[id](el);
  if (msg) showError(el, msg); else clearError(el);
  return msg;
}

export function validateAll() {
  const fields = getFieldValidators();
  const ids = Object.keys(fields);
  const errors = {};
  ids.forEach((id) => {
    const msg = validateField(id);
    if (msg) errors[id] = msg;
  });
  return errors;
}
