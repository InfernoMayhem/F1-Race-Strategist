import { apiFetch } from './api.js';
import { validateAll } from './validation.js';
import { setRaceSetupTitle, setCurrentLoadedConfigName, setIsPopulatingForm } from './state.js';

// helper function to get all relevant modal elements to make future function easier
export function getModalEls(){
  return {
    modal: document.getElementById('configModal'),
    modalTitle: document.getElementById('configModalTitle'),
    modalBody: document.getElementById('configModalBody'),
    modalClose: document.getElementById('closeConfigModal'),
  };
}

// general utilities to toggle the modal visibility
export function openModal() { const { modal } = getModalEls(); if (modal) modal.classList.remove('hidden'); }
export function closeModal() { const { modal } = getModalEls(); if (modal) modal.classList.add('hidden'); }

// turns the form values into a config object which can be used by the backend
export function buildCurrentConfigFromForm() {
  const f = document.getElementById('raceForm');
  if (!f) return null;
  const totalLaps = document.getElementById('totalLaps')?.value;
  const trackLength = document.getElementById('trackLength')?.value;
  const fuelLoad = document.getElementById('fuelLoad')?.value;
  const degradation = document.getElementById('degradation')?.value;
  const totalRainfall = document.getElementById('totalRainfall')?.value;
  const temperature = document.getElementById('temperature')?.value;
  const baseLapTime = document.getElementById('baseLapTime')?.value;
  const pitStopLoss = document.getElementById('pitStopLoss')?.value;

  return {
    totalLaps,
    trackLength,
    fuelLoad,
    degradation,
    totalRainfall,
    temperature,
    baseLapTime,
    pitStopLoss,
  };
}

// takes the loaded config object and fills the html form inputs with those values
export function populateFormFromConfig(cfg = {}) {
  // makes sure that simulation isn't triggered when the form is still being entered
  setIsPopulatingForm(true);
  
  // helper to prevent code being repeated
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  
  set('totalLaps', cfg.totalLaps);
  set('trackLength', cfg.trackLength);
  set('fuelLoad', cfg.fuelLoad);
  set('degradation', cfg.degradation);
  set('totalRainfall', cfg.totalRainfall);
  set('temperature', cfg.temperature);
  set('baseLapTime', cfg.baseLapTime);
  set('pitStopLoss', cfg.pitStopLoss);
  
  // reset the population flag after the stack clears
  setTimeout(() => { setIsPopulatingForm(false); }, 0);
}

// function to build the modal UI for config saving
export async function showSaveModal() {
  const { modalBody, modalTitle } = getModalEls();
  if (!modalBody || !modalTitle) return;
  
  // save button
  modalTitle.textContent = 'Save Configuration';
  modalBody.innerHTML = '';
  
  // name input field
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter a name for this config (e.g. Monza Dry)';
  input.id = 'saveNameInput';
  
  // buttons
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  
  const cancel = document.createElement('button'); 
  cancel.className = 'btn-basic btn-alt'; 
  cancel.textContent = 'Cancel';
  
  const save = document.createElement('button'); 
  save.className = 'btn-basic'; 
  save.textContent = 'Save';
  
  actions.append(cancel, save);
  modalBody.append(input, actions);

  // event listeners
  cancel.addEventListener('click', closeModal);
  
  save.addEventListener('click', async () => {
    // validate fields before saving
    const errors = validateAll();
    if (Object.keys(errors).length > 0) {
      alert('Cannot save: The race configuration has invalid fields. Please correct them and try again.');
      closeModal();
      return;
    }

    // name input validation
    const name = (document.getElementById('saveNameInput')?.value || '').trim();
    if (!name) { 
      input.focus(); 
      input.classList.add('input-error'); 
      return; 
    }
    
    // build the config object
    const config = buildCurrentConfigFromForm();
    
    try {
      // send to backend
      const res = await apiFetch('/api/configs', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ name, config }) 
      });
      
      // handle duplicate names
      if (res.status === 409) { 
        alert('A config with that name already exists. Choose a different name.'); 
        return; 
      }
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      // show success feedback
      modalBody.innerHTML = '<div class="feedback-text">Saved! You can load it anytime via "Load Config".</div>';
      setTimeout(closeModal, 800);
      
    } catch (e) {
      console.error('Save failed', e);
      alert('Failed to save config.');
    }
  });

  openModal();
  // auto-focus the input for better ux
  setTimeout(() => input.focus(), 50);
}

// helper to format iso dates for display
function fmtTime(t) { 
  if (!t || isNaN(t)) return 'Unknown Date'; 
  try { return new Date(Number(t)).toLocaleString(); } 
  catch (_) { return String(t); } 
}

// fetches the list of saved configs and displays them in the modal
export async function showLoadModal() {
  console.log('showLoadModal triggered');
  const { modalBody, modalTitle } = getModalEls();
  if (!modalBody || !modalTitle) return;
  
  modalTitle.textContent = 'Load Configuration';
  modalBody.innerHTML = '';
  
  // Controls container for search and sort
  const controls = document.createElement('div');
  controls.className = 'modal-search-controls';
  controls.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; width: 100%;';
  
  // Search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search...';
  searchInput.style.cssText = 'flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #444; background: #222; color: #fff;';
  
  // Sort select
  const sortSelect = document.createElement('select');
  sortSelect.style.cssText = 'padding: 8px; border-radius: 4px; border: 1px solid #444; background: #222; color: #fff;';
  
  [
    { val: 'date-desc', txt: 'Newest' },
    { val: 'date-asc', txt: 'Oldest' },
    { val: 'name-asc', txt: 'A-Z' },
    { val: 'name-desc', txt: 'Z-A' }
  ].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.val;
    o.textContent = opt.txt;
    sortSelect.append(o);
  });
  
  controls.append(searchInput, sortSelect);
  modalBody.append(controls);
  
  // container for the list items
  const list = document.createElement('div'); 
  list.className = 'config-list';
  modalBody.append(list);
  
  // close button at the bottom
  const actions = document.createElement('div'); 
  actions.className = 'modal-actions';
  const close = document.createElement('button'); 
  close.className = 'btn-basic btn-alt'; 
  close.textContent = 'Close';
  
  actions.append(close); 
  modalBody.append(actions);
  
  close.addEventListener('click', closeModal);
  
  // linear search function
  function linearSearch(items, query) {
    if (!query) return items;
    const lowerQuery = query.toLowerCase();
    const result = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.name.toLowerCase().includes(lowerQuery)) {
            result.push(item);
        }
    }
    return result;
  }
  
  // quick sort function
  function quickSort(items, criteria) {
    if (items.length <= 1) return items;

    const pivot = items[items.length - 1];
    const left = [];
    const right = [];

    for (let i = 0; i < items.length - 1; i++) {
        const item = items[i];
        let comparison = 0;

        if (criteria === 'date-desc') {
             // newest first
            comparison = item.timestamp - pivot.timestamp;
            if (comparison > 0) left.push(item);
            else right.push(item);
        } else if (criteria === 'date-asc') {
            // oldest first
            comparison = item.timestamp - pivot.timestamp;
            if (comparison < 0) left.push(item);
            else right.push(item);
        } else if (criteria === 'name-asc') {
            // A-Z
            if (item.name.toLowerCase() < pivot.name.toLowerCase()) left.push(item);
            else right.push(item);
        } else if (criteria === 'name-desc') {
            // Z-A
            if (item.name.toLowerCase() > pivot.name.toLowerCase()) left.push(item);
            else right.push(item);
        }
    }

    return [...quickSort(left, criteria), pivot, ...quickSort(right, criteria)];
  }

  try {
    // fetch saved items from API
    const res = await apiFetch('/api/configs');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let allItems = data.items || [];
    
    const renderList = () => {
        list.innerHTML = '';
        const query = searchInput.value;
        const sortMode = sortSelect.value;
        
        let filtered = linearSearch(allItems, query);
        let sorted = quickSort(filtered, sortMode);

        if (!sorted.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-note';
            empty.textContent = query ? 'No matching configs found.' : 'No saved configurations yet.';
            list.append(empty);
            return;
        }

        sorted.forEach(item => {
            const row = document.createElement('div'); 
            row.className = 'config-item';
            
            const info = document.createElement('div'); 
            info.className = 'config-info';
            info.innerHTML = `<div class="name">${item.name}</div><div class="time">${fmtTime(item.timestamp)}</div>`; // use item.timestamp from backend
            
            // create delete button with confirmation logic
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete';
    
            row.append(info, delBtn);
    
            // clicking the row loads the config
            const loadConfig = async () => {
              try {
                const r = await apiFetch(`/api/configs/${encodeURIComponent(item.name)}`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const payload = await r.json();
                
                const cfg = payload?.item?.config || {};
                populateFormFromConfig(cfg);
                
                // update UI state to reflect loaded config
                setRaceSetupTitle(item.name);
                setCurrentLoadedConfigName(item.name);
                
                closeModal();
              } catch (e) {
                console.error('Load failed', e);
                alert('Failed to load config.');
              }
            };
    
            row.addEventListener('click', loadConfig);
    
            // handle delete with click twice to confirm logic
            delBtn.addEventListener('click', async (e) => {
              e.stopPropagation(); // prevent triggering the row click
              
              if (delBtn.classList.contains('confirm-state')) {
                // second click, perform delete
                try {
                  const res = await apiFetch(`/api/configs/${encodeURIComponent(item.name)}`, { method: 'DELETE' });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  
                  // remove from local list and UI
                  allItems = allItems.filter(i => i.name !== item.name);
                  renderList();
                  
                } catch (err) {
                  console.error('Delete failed', err);
                  alert('Failed to delete config.');
                  
                  // reset button state on failure
                  delBtn.classList.remove('confirm-state');
                  delBtn.innerHTML = '&times;';
                }
              } else {
                // first click, show confirmation state
                delBtn.classList.add('confirm-state');
                delBtn.textContent = 'Confirm?';
                
                // auto-reset after 3 seconds if not confirmed
                setTimeout(() => {
                  if (delBtn.isConnected && delBtn.classList.contains('confirm-state')) {
                    delBtn.classList.remove('confirm-state');
                    delBtn.innerHTML = '&times;';
                  }
                }, 3000);
              }
            });
            list.append(row);
        });
    };

    // Attach listeners
    searchInput.addEventListener('input', renderList);
    sortSelect.addEventListener('change', renderList);

    // Initial render
    renderList();

  } catch (e) {
    console.error('List failed', e);
    const div = document.createElement('div');
    div.className = 'empty-note';
    div.textContent = 'Failed to fetch saved configs.';
    modalBody.append(div);
  }
  
  openModal();
}

// initialisation function to attach listeners to static buttons
export function initConfigModalBindings() {
  console.log('Initializing config modal bindings...');
  const saveBtn = document.getElementById('saveConfigBtn');
  const loadBtn = document.getElementById('loadConfigBtn');
  const { modal, modalClose } = getModalEls();
  
  if (saveBtn) console.log('Found saveConfigBtn');
  else console.error('saveConfigBtn NOT found');

  if (loadBtn) console.log('Found loadConfigBtn');
  else console.error('loadConfigBtn NOT found');

  if (modal) console.log('Found modal');
  else console.error('configModal NOT found');
  
  if (modalClose) modalClose.addEventListener('click', closeModal);
  
  // close modal when clicking on the backdrop
  if (modal) modal.addEventListener('click', (e) => { 
    if (e.target === modal) closeModal(); 
  });
  
  if (saveBtn) saveBtn.addEventListener('click', showSaveModal);
  if (loadBtn) loadBtn.addEventListener('click', showLoadModal);
}
