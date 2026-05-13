//  State 
let currentDeckId = null, currentCardIndex = 0;
let editingDeckId = null, editingCardId = null;
let cards = [], isFlipped = false;
let allDecks = [];
let activeFilter = 'All';

// prevents crash on loading decks
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

//  API helper 
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

//  Pop Up 
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

//  Views 
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome() { showView('home-view'); loadDecks(); }

//  Home
async function loadDecks() {
  allDecks = await api('GET', '/decks');
  renderFilters();
  searchDecks();
}

function renderFilters() {
  const categories = ['All', ...new Set(allDecks.map(d => d.category).filter(Boolean))];
  const pills = document.getElementById('filter-pills');
  pills.innerHTML = categories.map(cat => `
    <button onclick="setFilter('${esc(cat)}')"
      class="px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
        activeFilter === cat
          ? 'bg-stone-900 text-white border-stone-900'
          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
      }">
      ${esc(cat)}
    </button>`).join('');
  // Keep pills visible
  pills.style.display = 'flex';
}

function setFilter(cat) {
  activeFilter = cat;
  renderFilters();
  renderGrid();
}

function renderGrid(decks = null) {
  const filtered = decks || (activeFilter === 'All'
    ? allDecks
    : allDecks.filter(d => d.category === activeFilter));

  const grid = document.getElementById('deck-grid');

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-3 flex flex-col items-center py-20 text-stone-300">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="mb-4">
          <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 4v16M16 4v16"/>
        </svg>
        <p class="text-sm">No decks found.</p>
      </div>`;
    // Keep pills visible
    const pills = document.getElementById('filter-pills');
    if (pills.children.length) pills.style.display = 'flex';
    return;
  }

  // Using innerHTML or use display: none :thinking:

  grid.innerHTML = filtered.map(d => `
    <div class="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
      <div class="flex items-start justify-between">
        <h3 class="font-bold text-lg leading-tight">${esc(d.title)}</h3>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" class="shrink-0 mt-0.5">
          <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 4v16M16 4v16"/>
        </svg>
      </div>
      ${d.category ? `<span class="inline-block self-start text-xs font-medium bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full">${esc(d.category)}</span>` : '<span></span>'}
      <div class="flex items-center justify-between mt-auto pt-2">
        <span class="text-sm text-stone-400">${d.cardCount} card${d.cardCount !== 1 ? 's' : ''}</span>
        <div class="flex items-center gap-2">
          <button onclick="openEditDeckModal(this.dataset.id, this.dataset.title, this.dataset.category)"
            data-id="${esc(d.id)}" data-title="${esc(d.title)}" data-category="${esc(d.category||'')}"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onclick="deleteDeck('${d.id}')"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
          <button onclick="openDeck('${d.id}')"
            class="px-4 py-1.5 bg-stone-900 text-white text-sm font-semibold rounded-xl hover:bg-stone-700 transition-colors">
            Study
          </button>
        </div>
      </div>
    </div>`).join('');
}

//  Deck Modal 
function openNewDeckModal() {
  editingDeckId = null;
  document.getElementById('deck-modal-title').textContent = 'New Deck';
  document.getElementById('deck-title-input').value = '';
  document.getElementById('deck-category-input').value = '';
  openModal('deck-modal');
  setTimeout(() => document.getElementById('deck-title-input').focus(), 120);
}

function openEditDeckModal(id, title, category) {
  editingDeckId = id;
  document.getElementById('deck-modal-title').textContent = 'Edit Deck';
  document.getElementById('deck-title-input').value = title;
  document.getElementById('deck-category-input').value = category || '';
  openModal('deck-modal');
  setTimeout(() => document.getElementById('deck-title-input').focus(), 120);
}

function closeDeckModal() { closeModal('deck-modal'); }

async function saveDeck() {
  const title = document.getElementById('deck-title-input').value.trim();
  const category = document.getElementById('deck-category-input').value.trim();
  if (!title) return;
  if (editingDeckId) {
    await api('PUT', `/decks/${editingDeckId}`, { title, category });
    showToast('Deck updated ✓');
  } else {
    await api('POST', '/decks', { title, category });
    showToast('Deck created ✓');
  }
  closeDeckModal();
  loadDecks();
}

async function deleteDeck(id) {
  if (!confirm('Delete this deck and all its cards?')) return;
  await api('DELETE', `/decks/${id}`);
  showToast('Deck deleted');
  loadDecks();
}

//  Study 
async function openDeck(deckId) {
  currentDeckId = deckId;
  currentCardIndex = 0;
  const deck = await api('GET', `/decks/${deckId}`);
  cards = deck.cards;
  document.getElementById('study-title').textContent = deck.title;
  renderStudyView();
  showView('study-view');
}

function renderStudyView() {
  const has = cards.length > 0;
  document.getElementById('study-content').style.display = has ? '' : 'none';
  document.getElementById('no-cards').classList.toggle('hidden', has);
  if (!has) {
    document.getElementById('card-counter').textContent = '0 cards';
    document.getElementById('progress-fill').style.width = '0%';
    return;
  }
  if (currentCardIndex >= cards.length) currentCardIndex = cards.length - 1;
  if (currentCardIndex < 0) currentCardIndex = 0;
  const card = cards[currentCardIndex];
  document.getElementById('card-question').textContent = card.question;
  document.getElementById('card-answer').textContent = card.answer;
  document.getElementById('card-counter').textContent = `Card ${currentCardIndex + 1} of ${cards.length}`;
  document.getElementById('progress-fill').style.width = `${((currentCardIndex + 1) / cards.length) * 100}%`;
  document.getElementById('prev-btn').disabled = currentCardIndex === 0;
  document.getElementById('next-btn').disabled = currentCardIndex === cards.length - 1;
  isFlipped = false;
  document.getElementById('flashcard-inner').style.transform = 'rotateY(0deg)';
}

// Sound effects library file inventory mapping
const SFX_FILES = [
  "wooshlong1.wav",
  "wooshlong2.wav",
  "wooshshort1.wav",
  "wooshshort2.wav",
  "wooshshortdash6.wav",
  "wooshshortdash7.wav",
  "wooshshortdash8.wav",
];


function playRandomSFX() {
      if (!SFX_FILES.length) return;
      const randomFile = SFX_FILES[Math.floor(Math.random() * SFX_FILES.length)];
      const sfxPath = `/audio/${randomFile}`;
      const effectAudio = new Audio(sfxPath);
      
      // Tied to existing sfxVolume slider tracker variable
      if (typeof sfxVolume === 'number') {
        effectAudio.volume = sfxVolume;
      }
      effectAudio.play().catch(e => console.log("SFX blocked or missing:", e));
    }

function flipCard() {
  isFlipped = !isFlipped;
  document.getElementById('flashcard-inner').style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
  playRandomSFX();
}

const flipPreviewCard = flipCard;
function prevCard() { if (currentCardIndex > 0) { currentCardIndex--; renderStudyView(); } playRandomSFX()}
function nextCard() { if (currentCardIndex < cards.length - 1) { currentCardIndex++; renderStudyView(); }  playRandomSFX()}

//  Card Modal 
function openAddCardModal() {
  editingCardId = null;
  document.getElementById('card-modal-title').textContent = 'Add Card';
  document.getElementById('card-question-input').value = '';
  document.getElementById('card-answer-input').value = '';
  openModal('card-modal');
  setTimeout(() => document.getElementById('card-question-input').focus(), 120);
}

function openEditCardModal() {
  if (!cards.length) return;
  const c = cards[currentCardIndex];
  editingCardId = c.id;
  document.getElementById('card-modal-title').textContent = 'Edit Card';
  document.getElementById('card-question-input').value = c.question;
  document.getElementById('card-answer-input').value = c.answer;
  openModal('card-modal');
  setTimeout(() => document.getElementById('card-question-input').focus(), 120);
}

function closeCardModal() { closeModal('card-modal'); }

async function saveCard() {
  const q = document.getElementById('card-question-input').value.trim();
  const a = document.getElementById('card-answer-input').value.trim();
  if (!q || !a) return;
  if (editingCardId) {
    const u = await api('PUT', `/decks/${currentDeckId}/cards/${editingCardId}`, { question: q, answer: a });
    const i = cards.findIndex(c => c.id === editingCardId);
    if (i !== -1) cards[i] = u;
    showToast('Card saved ✓');
  } else {
    const n = await api('POST', `/decks/${currentDeckId}/cards`, { question: q, answer: a });
    cards.push(n);
    currentCardIndex = cards.length - 1;
    showToast('Card added ✓');
  }
  closeCardModal();
  renderStudyView();
}

async function deleteCurrentCard() {
  if (!cards.length || !confirm('Delete this card?')) return;

  /* ==========================================
     CUSTOM AUDIO DELETE TRIGGER
     ========================================== */
  try {
    const deleteAudio = new Audio("/audio/goat.mp3");
    
    // Connects playback volume output directly to your active sfxVolume slider variable
    if (typeof sfxVolume === 'number') {
      deleteAudio.volume = sfxVolume;
    }
    
    deleteAudio.play().catch(e => console.log("Deletion audio blocked or missing:", e));
  } catch (err) {
    console.log("Audio track initialization error:", err);
  }

  // Restores your original database wipe routine and layout array splitting
  await api('DELETE', `/decks/${currentDeckId}/cards/${cards[currentCardIndex].id}`);
  cards.splice(currentCardIndex, 1);
  if (currentCardIndex >= cards.length && currentCardIndex > 0) currentCardIndex--;
  
  showToast('Card deleted');
  renderStudyView();
}

//  Modal helpers 
function openModal(id) {
  document.getElementById(id).classList.remove('opacity-0', 'pointer-events-none');
  const box = document.getElementById(id.replace('modal', 'modal-box'));
  if (box) box.classList.remove('translate-y-4');
}
function closeModal(id) {
  document.getElementById(id).classList.add('opacity-0', 'pointer-events-none');
  const box = document.getElementById(id.replace('modal', 'modal-box'));
  if (box) box.classList.add('translate-y-4');
}

//  Keyboard shortcuts 
document.addEventListener('keydown', e => {
  if (!document.getElementById('study-view').classList.contains('active')) return;
  if (!document.getElementById('deck-modal').classList.contains('pointer-events-none') ||
      !document.getElementById('card-modal').classList.contains('pointer-events-none')) return;
  if (e.key === 'ArrowRight') nextCard();
  if (e.key === 'ArrowLeft') prevCard();
  if (e.key === ' ') { e.preventDefault(); flipCard(); }
});

['deck-modal', 'card-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeModal(id);
  });
});

document.getElementById('deck-title-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveDeck();
});

//  Dark mode 
function toggleDark() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  document.getElementById('dark-label').textContent = isDark ? 'Light mode' : 'Dark mode';
  document.getElementById('dark-icon').innerHTML = isDark
    ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
}
if (localStorage.getItem('theme') === 'dark') toggleDark();

//  Utility 
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

//  Search
function searchDecks() {
  if (!allDecks.length) return;
  const query = document.getElementById('deck-search').value.trim().toLowerCase();
  const filtered = !query
    ? allDecks
    : allDecks.filter(d =>
      d.title.toLowerCase().includes(query) ||
      (d.category && d.category.toLowerCase().includes(query))
    );
  renderGrid(filtered);
}
document.getElementById('deck-search').addEventListener('input', searchDecks);

//  Init
// MUSIC SETTINGS
const musicVolumeSlider = document.getElementById("music-volume");
const sfxVolumeSlider = document.getElementById("sfx-volume");

const musicValue = document.getElementById("music-volume-value");
const sfxValue = document.getElementById("sfx-volume-value");

const backgroundMusic = document.getElementById("background-music");

// VOLUME DROPDOWN
const volumeWidget = document.getElementById("volume-widget");
const volumeDropdown = document.getElementById("volume-dropdown");
const volumeBtn = document.getElementById("volume-btn");

let volumeTimer;

volumeWidget.addEventListener("mouseenter", () => {
  clearTimeout(volumeTimer);
  volumeDropdown.classList.remove("hidden");
});

volumeWidget.addEventListener("mouseleave", () => {
  volumeTimer = setTimeout(() => {
    volumeDropdown.classList.add("hidden");
  }, 300);
});

if (musicVolumeSlider && musicValue) {
  musicVolumeSlider.value = "0";
  musicValue.textContent = "0%";
}
 
let musicVolume = 0; 
let sfxVolume = Number(sfxVolumeSlider.value) / 100;

/* ADDED: Keep track of the last non-zero volume level. Default to 40% */
let preMuteVolume = 40; 

if (backgroundMusic) {
  backgroundMusic.volume = musicVolume;
}

if (volumeBtn) {
  volumeBtn.textContent = "🔇";
}

// SLIDER INTERACTION HANDLERS
musicVolumeSlider.addEventListener("input", () => {
  musicVolume = Number(musicVolumeSlider.value) / 100;
  musicValue.textContent = `${musicVolumeSlider.value}%`;
  
  if (backgroundMusic) {
    backgroundMusic.volume = musicVolume;
  }

  // Update our tracked non-zero volume variable whenever the slider moves
  if (musicVolumeSlider.value !== "0") {
    preMuteVolume = Number(musicVolumeSlider.value);
  }

  if (volumeBtn) {
    if (musicVolumeSlider.value === "0") {
      volumeBtn.textContent = "🔇";
    } else {
      volumeBtn.textContent = "🔊";
    }
  }
});

sfxVolumeSlider.addEventListener("input", () => {
  sfxVolume = Number(sfxVolumeSlider.value) / 100;
  sfxValue.textContent = `${sfxVolumeSlider.value}%`;
});

/* ADDED: Click handler for the volume button to toggle mute state */
if (volumeBtn) {
  volumeBtn.addEventListener("click", () => {
    if (musicVolumeSlider.value === "0") {
      // Unmute: Restore to the last tracked non-zero volume level
      musicVolumeSlider.value = String(preMuteVolume);
      volumeBtn.textContent = "🔊";
    } else {
      // Mute: Save current position first, then drop to zero
      preMuteVolume = Number(musicVolumeSlider.value);
      musicVolumeSlider.value = "0";
      volumeBtn.textContent = "🔇";
    }
    
    // Sync the underlying audio engine and text layouts to match the new value
    musicVolume = Number(musicVolumeSlider.value) / 100;
    musicValue.textContent = `${musicVolumeSlider.value}%`;
    if (backgroundMusic) {
      backgroundMusic.volume = musicVolume;
    }
  });
}

document.addEventListener(
  "click", () => {
    if (backgroundMusic) backgroundMusic.play();
  },
  {once: true}
);
//  Init 
loadDecks();
