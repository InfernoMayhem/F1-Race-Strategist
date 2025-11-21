export const DEFAULT_RACE_SETUP_TITLE = 'Race Setup';
export let currentLoadedConfigName = null; // name of the currently loaded saved config
export let isPopulatingForm = false;

export function setCurrentLoadedConfigName(name) {
  currentLoadedConfigName = name;
}

export function setIsPopulatingForm(flag) {
  isPopulatingForm = !!flag;
}

export function setRaceSetupTitle(name) {
  const h = document.getElementById('raceSetupTitle');
  if (!h) return;
  if (name && String(name).trim()) {
    h.textContent = String(name).trim();
  } else {
    h.textContent = DEFAULT_RACE_SETUP_TITLE;
  }
}
