// parsing helper, converting messy inputs into usable integers
export const integer = (v) => {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
};

// parsing helper, converting messy inputs into usable floats
export const decimal = (v) => {
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};

// ui helper, appends or updates a visual error message below a form field
export const showError = (el, msg) => {
  el.classList.add('input-error');
  
  // check if an error message element already exists nearby
  let span = el.nextElementSibling;
  
  // if not, create one
  if (!(span && span.classList && span.classList.contains('error-text'))) {
    span = document.createElement('div');
    span.className = 'error-text';
    el.insertAdjacentElement('afterend', span);
  }
  
  // cleanup any accidental duplicates
  let dup = span.nextElementSibling;
  while (dup && dup && dup.classList && dup.classList.contains('error-text')) {
    const toRemove = dup;
    dup = dup.nextElementSibling;
    toRemove.remove();
  }
  
  span.textContent = msg || '';
};

// ui helper, removes the error styling and message when input becomes valid
export const clearError = (el) => {
  el.classList.remove('input-error');
  
  // remove all adjacent error message elements
  let span = el.nextElementSibling;
  while (span && span.classList && span.classList.contains('error-text')) {
    const toRemove = span;
    span = span.nextElementSibling;
    toRemove.remove();
  }
};

// defines the validation rules for every single form input
// returns a map of field ids to validation functions
export function getFieldValidators() {
  return {
    totalLaps: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Total Laps is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Total Laps must be an integer';
      if (n < 10 || n > 100) return 'Total Laps must be 10-100';
      return '';
    },
    trackLength: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Track Length is required';
      const n = decimal(raw);
      if (Number.isNaN(n)) return 'Track Length must be a number';
      if (n < 1.0 || n > 50.0) return 'Track Length must be 1.0-50.0 km';
      return '';
    },
    fuelLoad: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Fuel Load is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Fuel Load must be an integer';
      if (n < 10 || n > 150) return 'Fuel Load must be 10-150';
      return '';
    },
    degradation: (el) => {
      const v = el.value;
      if (!v) return 'Degradation is required';
      if (!['Low', 'Medium', 'High'].includes(v)) return 'Invalid Degradation';
      return '';
    },
    totalRainfall: (el) => {
      const raw = el.value.trim();
      if (!raw) return ''; // optional field
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
      if (n < -10 || n > 50) return 'Temperature must be -10 to 50°C';
      return '';
    },
    baseLapTime: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Base Lap Time is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Base Lap Time must be an integer';
      if (n < 30 || n > 150) return 'Base Lap Time must be 30-150s';
      return '';
    },
    pitStopLoss: (el) => {
      const raw = el.value;
      if (!raw.trim()) return 'Pit Stop Loss is required';
      const n = integer(raw);
      if (Number.isNaN(n)) return 'Pit Stop Loss must be an integer';
      if (n < 10 || n > 60) return 'Pit Stop Loss must be 10-60s';
      return '';
    },
  };
}

// triggers validation for a single field by its html id
export function validateField(id) {
  const el = document.getElementById(id);
  const fields = getFieldValidators();
  if (!el || !fields[id]) return '';
  
  const msg = fields[id](el);
  if (msg) showError(el, msg); else clearError(el);
  return msg;
}

// triggers validation for the entire form at once
// returns an object containing any errors found
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
