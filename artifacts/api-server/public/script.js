const KNIFE_IMAGES = {
  'Rusty Knife': '/knife-rusty.png',
  'Forest Blade': '/knife-forest.png',
  'Crimson Edge': '/knife-crimson.png',
  'Shadow Cutter': '/knife-shadow.png',
  'Golden Blade': '/knife-golden.png',
  'Void Dagger': '/knife-void.png',
  'Celestial Knife': '/knife-celestial.png',
};

let currentUser = null;

function loadUser() {
  const saved = localStorage.getItem('knifecase_user');
  if (saved) {
    try { currentUser = JSON.parse(saved); } catch(e) { currentUser = null; }
  }
}

function saveUser() {
  if (currentUser) localStorage.setItem('knifecase_user', JSON.stringify(currentUser));
}

function showTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Login failed'; return; }
    currentUser = data.user;
    saveUser();
    enterGame();
  } catch(err) {
    errEl.textContent = 'Connection error. Please try again.';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Registration failed'; return; }
    currentUser = data.user;
    saveUser();
    enterGame();
  } catch(err) {
    errEl.textContent = 'Connection error. Please try again.';
  }
}

function enterGame() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('username-display').textContent = currentUser.username;
  updateKeys(currentUser.keys);
  loadInventory();
}

function updateKeys(count) {
  currentUser.keys = count;
  saveUser();
  document.getElementById('keys-count').textContent = count;
}

function logout() {
  currentUser = null;
  localStorage.removeItem('knifecase_user');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  showTab('login');
}

async function openCase() {
  if (!currentUser) return;
  if (currentUser.keys < 10) {
    alert('Not enough keys! You need 10 keys to open a case.');
    return;
  }
  const btn = document.getElementById('open-btn');
  const caseImg = document.getElementById('case-img');
  btn.disabled = true;
  caseImg.classList.add('shake');
  setTimeout(() => caseImg.classList.remove('shake'), 600);
  try {
    const res = await fetch('/api/game/open-case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Error opening case');
      btn.disabled = false;
      return;
    }
    updateKeys(data.keys);
    showWin(data.item);
    loadInventory();
  } catch(err) {
    alert('Connection error. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

function showWin(item) {
  const rarityMap = {
    common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
    epic: 'Epic', legendary: 'Legendary', mythical: 'Mythical', celestial: 'Celestial'
  };
  const modal = document.getElementById('win-modal');
  const glow = document.getElementById('win-glow');
  const img = document.getElementById('win-img');
  const name = document.getElementById('win-name');
  const rarityEl = document.getElementById('win-rarity');
  const keysEl = document.getElementById('win-keys');

  img.src = KNIFE_IMAGES[item.name] || '';
  img.alt = item.name;
  name.textContent = item.name;
  rarityEl.textContent = rarityMap[item.rarity] || item.rarity;
  rarityEl.className = 'rarity-badge win-rarity-badge ' + item.rarity;
  glow.className = 'win-glow ' + item.rarity;
  keysEl.textContent = `🗝️ ${currentUser.keys} keys remaining`;

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('win-modal').classList.add('hidden');
}

async function loadInventory() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/game/inventory/' + currentUser.id);
    const data = await res.json();
    renderInventory(data.items || []);
  } catch(e) {
    console.error('Failed to load inventory');
  }
}

function renderInventory(items) {
  const grid = document.getElementById('inventory-grid');
  const emptyMsg = document.getElementById('empty-inv');

  const existingCards = grid.querySelectorAll('.item-card');
  existingCards.forEach(c => c.remove());

  if (items.length === 0) {
    emptyMsg.style.display = '';
    return;
  }
  emptyMsg.style.display = 'none';

  const rarityMap = {
    common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
    epic: 'Epic', legendary: 'Legendary', mythical: 'Mythical', celestial: 'Celestial'
  };

  const sorted = [...items].sort((a, b) => new Date(b.obtainedAt) - new Date(a.obtainedAt));

  sorted.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card rarity-' + item.rarity;
    const img = document.createElement('img');
    img.src = KNIFE_IMAGES[item.itemName] || '';
    img.alt = item.itemName;
    const nameEl = document.createElement('span');
    nameEl.className = 'item-name';
    nameEl.textContent = item.itemName;
    const badge = document.createElement('span');
    badge.className = 'rarity-badge ' + item.rarity;
    badge.textContent = rarityMap[item.rarity] || item.rarity;
    card.appendChild(img);
    card.appendChild(nameEl);
    card.appendChild(badge);
    grid.appendChild(card);
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

loadUser();
if (currentUser) {
  enterGame();
}
