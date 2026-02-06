// default title used when no specific configuration is loaded
export const DEFAULT_RACE_SETUP_TITLE = 'Race Setup';

// tracks the currently loaded configuration name
export let currentLoadedConfigName = null;

// flag to prevent validation triggers during form entry
export let isPopulatingForm = false;

// updates the current config name state variable
export function setCurrentLoadedConfigName(name) {
  currentLoadedConfigName = name;
}

// updates the form population state flag
export function setIsPopulatingForm(flag) {
  isPopulatingForm = !!flag;
}

// updates the visible title on the race setup card
export function setRaceSetupTitle(name) {
  const h = document.getElementById('raceSetupTitle');
  if (!h) return;
  
  if (name && String(name).trim()) {
    h.textContent = String(name).trim();
  } else {
    h.textContent = DEFAULT_RACE_SETUP_TITLE;
  }
}
