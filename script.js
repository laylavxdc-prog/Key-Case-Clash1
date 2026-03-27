'use strict';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

/* ═══════════════════════════════════════
   FIREBASE
═══════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyDEQf0TrDG7QtM96HfpcOrtFbFibFCaK3o",
  authDomain: "case-clash.firebaseapp.com",
  projectId: "case-clash",
  storageBucket: "case-clash.firebasestorage.app",
  messagingSenderId: "251214048625",
  appId: "1:251214048625:web:1f32ab6cbe8ab45f8adad0"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
console.log('Firebase connected');

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const KNIVES = [
  { name: 'Rusty Knife',     rarity: 'common',    value: 5,   image: 'knife-rusty.png' },
  { name: 'Forest Blade',    rarity: 'uncommon',  value: 15,  image: 'knife-forest.png' },
  { name: 'Crimson Edge',    rarity: 'rare',      value: 25,  image: 'knife-crimson.png' },
  { name: 'Shadow Cutter',   rarity: 'epic',      value: 40,  image: 'knife-shadow.png' },
  { name: 'Golden Blade',    rarity: 'legendary', value: 60,  image: 'knife-golden.png' },
  { name: 'Void Dagger',     rarity: 'mythical',  value: 80,  image: 'knife-void.png' },
  { name: 'Celestial Knife', rarity: 'celestial', value: 100, image: 'knife-celestial.png' },
];

const ITEM_W       = 110;
const ITEM_GAP     = 10;
const ITEM_TOTAL   = ITEM_W + ITEM_GAP;
const STRIP_COUNT  = 60;
const WINNER_IDX   = 45;
const CASE_COST    = 10;
const STARTER_KEYS = 100;

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let currentUser = null;
let isSpinning  = false;

/* ═══════════════════════════════════════
   AUDIO
═══════════════════════════════════════ */
let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function osc(freq, type, start, duration, volume, ctx) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(volume, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  o.start(start);
  o.stop(start + duration + 0.01);
}
function playTick(vol) {
  try { const ctx = getCtx(); osc(800, 'square', ctx.currentTime, 0.04, vol || 0.06, ctx); } catch(e) {}
}
function playWinSound(rarity) {
  try {
    const ctx = getCtx();
    const scales = {
      common:    [440, 523],
      uncommon:  [440, 523, 659],
      rare:      [440, 554, 659, 784],
      epic:      [523, 659, 784, 988],
      legendary: [523, 659, 784, 988, 1047],
      mythical:  [659, 784, 988, 1175, 1319],
      celestial: [659, 784, 988, 1175, 1319, 1568, 2093],
    };
    const notes = scales[rarity] || scales.common;
    notes.forEach((f, i) => osc(f, 'sine', ctx.currentTime + i * 0.13, 0.45, 0.18, ctx));
  } catch(e) {}
}

/* ═══════════════════════════════════════
   FIREBASE HELPERS
═══════════════════════════════════════ */
async function loadUser(username) {
  const ref  = doc(db, 'users', username);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function saveUser(user) {
  const ref = doc(db, 'users', user.username);
  await setDoc(ref, user);
  console.log('Inventory updated');
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
window.showAuthTab = function(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('atab-login').classList.toggle('active', tab === 'login');
  document.getElementById('atab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-err').textContent = '';
  document.getElementById('reg-err').textContent   = '';
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-err');
  errEl.textContent = '';
  try {
    const user = await loadUser(username);
    if (!user)                      { errEl.textContent = 'User not found. Register first.'; return; }
    if (user.password !== password) { errEl.textContent = 'Incorrect password.'; return; }
    setUser(user);
  } catch(err) {
    errEl.textContent = 'Connection error.';
    console.error(err);
  }
};

window.handleRegister = async function(e) {
  e.preventDefault();
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const errEl    = document.getElementById('reg-err');
  errEl.textContent = '';
  if (username.length < 3) { errEl.textContent = 'Username must be 3+ characters.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be 6+ characters.'; return; }
  try {
    const existing = await loadUser(username);
    if (existing) { errEl.textContent = 'Username already taken.'; return; }
    const newUser = { username, password, keys: STARTER_KEYS, inventory: [] };
    await saveUser(newUser);
    setUser(newUser);
  } catch(err) {
    errEl.textContent = 'Connection error.';
    console.error(err);
  }
};

function setUser(user) {
  currentUser = user;
  localStorage.setItem('knifecase_user', user.username);
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('username-display').textContent = user.username;
  updateKeysDisplay(user.keys);
  initPossibleDrops();
  buildInitialReel();
  switchTab('case');
  console.log('User loaded:', user.username);
}

window.logout = function() {
  currentUser = null;
  isSpinning  = false;
  localStorage.removeItem('knifecase_user');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showAuthTab('login');
};

function updateKeysDisplay(keys) {
  document.getElementById('keys-count').textContent = keys;
  if (currentUser) currentUser.keys = keys;
}

/* ═══════════════════════════════════════
   TABS
═══════════════════════════════════════ */
window.switchTab = function(tab) {
  ['case', 'inventory'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`ntab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'inventory') renderInventory();
};

/* ═══════════════════════════════════════
   POSSIBLE DROPS
═══════════════════════════════════════ */
function initPossibleDrops() {
  const grid = document.getElementById('possible-grid');
  grid.innerHTML = KNIVES.map(k => `
    <div class="icard rarity-${k.rarity}">
      <img src="${k.image}" alt="${k.name}" />
      <div class="iname">${k.name}</div>
      <div class="ival">🪙 ${k.value}</div>
      <div class="rarity-badge ${k.rarity}">${k.rarity}</div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════
   REEL
═══════════════════════════════════════ */
function randomKnife() {
  return KNIVES[Math.floor(Math.random() * KNIVES.length)];
}

function buildReel(winner) {
  const strip    = document.getElementById('reel-strip');
  const viewport = document.getElementById('reel-viewport');
  const startX   = viewport.offsetWidth / 2 - ITEM_W / 2;
  strip.innerHTML = '';
  strip.style.transition = 'none';
  strip.style.transform  = `translateX(${startX}px)`;
  for (let i = 0; i < STRIP_COUNT; i++) {
    const knife = i === WINNER_IDX ? winner : randomKnife();
    const div   = document.createElement('div');
    div.className = `ri ri-${knife.rarity}`;
    div.innerHTML = `<img src="${knife.image}" alt="${knife.name}" /><div class="ri-name">${knife.name}</div><div class="ri-val">🪙${knife.value}</div>`;
    strip.appendChild(div);
  }
  return startX;
}

function buildInitialReel() {
  const strip    = document.getElementById('reel-strip');
  const viewport = document.getElementById('reel-viewport');
  const startX   = (viewport.offsetWidth || 800) / 2 - ITEM_W / 2;
  strip.innerHTML = '';
  strip.style.transition = 'none';
  strip.style.transform  = `translateX(${startX}px)`;
  for (let i = 0; i < STRIP_COUNT; i++) {
    const knife = randomKnife();
    const div   = document.createElement('div');
    div.className = `ri ri-${knife.rarity}`;
    div.innerHTML = `<img src="${knife.image}" alt="${knife.name}" /><div class="ri-name">${knife.name}</div><div class="ri-val">🪙${knife.value}</div>`;
    strip.appendChild(div);
  }
}

function scheduleTickSounds() {
  const DURATION = 6000;
  let t = 0, interval = 28;
  while (t < DURATION - 100) {
    const vol = Math.max(0.015, 0.07 - (t / DURATION) * 0.055);
    setTimeout(() => playTick(vol), t);
    interval = Math.min(interval * 1.075, 420);
    t += interval;
  }
}

/* ═══════════════════════════════════════
   CASE OPENING
═══════════════════════════════════════ */
window.openCase = async function() {
  if (isSpinning || !currentUser) return;
  if (currentUser.keys < CASE_COST) {
    alert("You don't have enough keys!");
    return;
  }

  isSpinning = true;
  const btn  = document.getElementById('open-btn');
  btn.disabled = true;
  btn.textContent = 'SPINNING...';

  const winner = randomKnife();
  console.log('Item won:', winner.name, '(' + winner.rarity + ')');

  currentUser.keys -= CASE_COST;
  const item = {
    id:     Date.now(),
    name:   winner.name,
    rarity: winner.rarity,
    value:  winner.value,
    image:  winner.image,
  };
  currentUser.inventory = [...(currentUser.inventory || []), item];
  updateKeysDisplay(currentUser.keys);

  try {
    await saveUser(currentUser);
  } catch(err) {
    console.error('Failed to save to Firebase:', err);
  }

  const startX = buildReel(winner);
  document.getElementById('reel-strip').offsetHeight;
  const endX  = startX - WINNER_IDX * ITEM_TOTAL;
  const nudge = Math.floor(Math.random() * 30) - 15;
  const strip = document.getElementById('reel-strip');
  strip.style.transition = 'transform 6s cubic-bezier(0.12, 0.85, 0.25, 1)';
  strip.style.transform  = `translateX(${endX + nudge}px)`;

  scheduleTickSounds();

  setTimeout(() => {
    const items = strip.querySelectorAll('.ri');
    if (items[WINNER_IDX]) items[WINNER_IDX].classList.add('winner');
    playWinSound(winner.rarity);
    setTimeout(() => {
      showWinModal(winner);
      isSpinning   = false;
      btn.disabled = false;
      btn.innerHTML = '<span class="spin-icon">⚡</span> OPEN CASE';
    }, 700);
  }, 6100);
};

/* ═══════════════════════════════════════
   WIN MODAL
═══════════════════════════════════════ */
function showWinModal(knife) {
  document.getElementById('win-img').src   = knife.image;
  document.getElementById('win-img').alt   = knife.name;
  document.getElementById('win-name').textContent      = knife.name;
  document.getElementById('win-coins').textContent     = `🪙 ${knife.value} Coins`;
  document.getElementById('win-keys-left').textContent = `🗝️ ${currentUser.keys} keys remaining`;
  const badge = document.getElementById('win-badge');
  badge.textContent = knife.rarity;
  badge.className   = `rarity-badge modal-badge ${knife.rarity}`;
  document.getElementById('modal-glow').className = `modal-glow ${knife.rarity}`;
  document.getElementById('win-modal').classList.remove('hidden');
}

window.closeModal = function() {
  document.getElementById('win-modal').classList.add('hidden');
};

/* ═══════════════════════════════════════
   INVENTORY
═══════════════════════════════════════ */
function renderInventory() {
  const grid = document.getElementById('inventory-grid');
  const inv  = currentUser?.inventory || [];
  document.getElementById('inv-total-count').textContent =
    `${inv.length} item${inv.length !== 1 ? 's' : ''}`;
  if (inv.length === 0) {
    grid.innerHTML = '<div class="empty-msg">No items yet. Open a case to get started!</div>';
    return;
  }
  grid.innerHTML = inv.slice().reverse().map(item => `
    <div class="icard rarity-${item.rarity}">
      <img src="${item.image}" alt="${item.name}" />
      <div class="iname">${item.name}</div>
      <div class="ival">🪙 ${item.value}</div>
      <div class="rarity-badge ${item.rarity}">${item.rarity}</div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  showAuthTab('login');
  const savedUsername = localStorage.getItem('knifecase_user');
  if (savedUsername) {
    try {
      const user = await loadUser(savedUsername);
      if (user) setUser(user);
    } catch(err) {
      console.error('Auto-login failed:', err);
    }
  }
});
