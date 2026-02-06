import { apiFetch } from './api.js';
import { validateAll } from './validation.js';
import { setRaceSetupTitle, setCurrentLoadedConfigName, setIsPopulatingForm } from './state.js';

// retrieval utility to grab all modal-related dom elements at once
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

// reads the current form values and packages them into a configuration object to save the current setup
export function buildCurrentConfigFromForm() {
  const f = document.getElementById('raceForm');
  if (!f) return null;
  return {
    totalLaps: document.getElementById('totalLaps')?.value,
    trackLength: document.getElementById('trackLength')?.value,
    fuelLoad: document.getElementById('fuelLoad')?.value,
    degradation: document.getElementById('degradation')?.value,
    totalRainfall: document.getElementById('totalRainfall')?.value,
    temperature: document.getElementById('temperature')?.value,
    baseLapTime: document.getElementById('baseLapTime')?.value,
    pitStopLoss: document.getElementById('pitStopLoss')?.value,
  };
}

// takes a loaded config object and fills the html form inputs with those values
export function populateFormFromConfig(cfg = {}) {
  // signal that we are currently populating the form to prevent early simulation
  setIsPopulatingForm(true);
  
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

// builds and displays the save configuration modal content
export async function showSaveModal() {
  const { modalBody, modalTitle } = getModalEls();
  if (!modalBody || !modalTitle) return;
  
  // prepare the modal for save mode
  modalTitle.textContent = 'Save Configuration';
  modalBody.innerHTML = '';
  
  // create the name input field
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter a name for this config (e.g. Monza Dry)';
  input.id = 'saveNameInput';
  
  // create the action buttons
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

  // add event listeners
  cancel.addEventListener('click', closeModal);
  
  save.addEventListener('click', async () => {
    // validate all fields before allowing a save
    const errors = validateAll();
    if (Object.keys(errors).length > 0) {
      alert('Cannot save: The race configuration has invalid fields. Please correct them and try again.');
      closeModal();
      return;
    }

    // check if the user provided a name
    const name = (document.getElementById('saveNameInput')?.value || '').trim();
    if (!name) { 
      input.focus(); 
      input.classList.add('input-error'); 
      return; 
    }
    
    // build the config object
    const config = buildCurrentConfigFromForm();
    
    try {
      // send to the backend
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
function fmtTime(t) { try { const d = new Date(t); return d.toLocaleString(); } catch (_) { return String(t); } }

// fetches the list of saved configs and displays them in the modal
export async function showLoadModal() {
  const { modalBody, modalTitle } = getModalEls();
  if (!modalBody || !modalTitle) return;
  
  modalTitle.textContent = 'Load Configuration';
  modalBody.innerHTML = '';
  
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
  
  try {
    // fetch saved items from API
    const res = await apiFetch('/api/configs');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.items || [];
    
    // handle empty state
    if (!items.length) {
      const empty = document.createElement('div'); 
      empty.className = 'empty-note'; 
      empty.textContent = 'No saved configurations yet. Save one to see it here.';
      list.append(empty);
      return;
    }
    
    // render each config item
    items.forEach(item => {
      const row = document.createElement('div'); 
      row.className = 'config-item';
      
      const info = document.createElement('div'); 
      info.className = 'config-info';
      info.innerHTML = `<div class="name">${item.name}</div><div class="time">${fmtTime(item.createdAt)}</div>`;
      
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
            
            // remove from UI
            row.remove();
            
            // check if list is now empty
            if (list.children.length === 0) {
              const empty = document.createElement('div'); 
              empty.className = 'empty-note'; 
              empty.textContent = 'No saved configurations yet.';
              list.append(empty);
            }
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
  const saveBtn = document.getElementById('saveConfigBtn');
  const loadBtn = document.getElementById('loadConfigBtn');
  const { modal, modalClose } = getModalEls();
  
  if (modalClose) modalClose.addEventListener('click', closeModal);
  
  // close modal when clicking on the backdrop
  if (modal) modal.addEventListener('click', (e) => { 
    if (e.target === modal) closeModal(); 
  });
  
  if (saveBtn) saveBtn.addEventListener('click', showSaveModal);
  if (loadBtn) loadBtn.addEventListener('click', showLoadModal);
}
