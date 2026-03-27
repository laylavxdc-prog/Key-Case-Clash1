'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const API = '/api';

const KNIVES = [
  { name: 'Rusty Knife',     rarity: 'common',    value: 5,   image: 'knife-rusty.png' },
  { name: 'Forest Blade',    rarity: 'uncommon',  value: 15,  image: 'knife-forest.png' },
  { name: 'Crimson Edge',    rarity: 'rare',      value: 25,  image: 'knife-crimson.png' },
  { name: 'Shadow Cutter',   rarity: 'epic',      value: 40,  image: 'knife-shadow.png' },
  { name: 'Golden Blade',    rarity: 'legendary', value: 60,  image: 'knife-golden.png' },
  { name: 'Void Dagger',     rarity: 'mythical',  value: 80,  image: 'knife-void.png' },
  { name: 'Celestial Knife', rarity: 'celestial', value: 100, image: 'knife-celestial.png' },
];

const ITEM_W  = 110;
const ITEM_GAP = 10;
const ITEM_TOTAL = ITEM_W + ITEM_GAP;
const STRIP_COUNT = 60;
const WINNER_IDX  = 45;

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let currentUser = null;
let isSpinning  = false;
let selectedInvIds = new Set();
let inventoryData  = [];

/* ═══════════════════════════════════════
   SOUND (Web Audio API)
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
  try {
    const ctx = getCtx();
    osc(800, 'square', ctx.currentTime, 0.04, vol || 0.06, ctx);
  } catch(e) {}
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
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.13;
      osc(f, 'sine', t, 0.45, 0.18, ctx);
    });
  } catch(e) {}
}

function playCoinSound() {
  try {
    const ctx = getCtx();
    [1047, 1319, 1568].forEach((f, i) => {
      osc(f, 'sine', ctx.currentTime + i * 0.1, 0.3, 0.12, ctx);
    });
  } catch(e) {}
}

function playWithdrawSound() {
  try {
    const ctx = getCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(200, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.4);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    o.start(); o.stop(ctx.currentTime + 0.6);
    setTimeout(() => { try { osc(1047, 'sine', ctx.currentTime, 0.3, 0.12, ctx); } catch(e) {} }, 500);
  } catch(e) {}
}

/* ═══════════════════════════════════════
   AUTH HELPERS
═══════════════════════════════════════ */
function showAuthTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('atab-login').classList.toggle('active', tab === 'login');
  document.getElementById('atab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-err').textContent = '';
  document.getElementById('reg-err').textContent = '';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  errEl.textContent = '';
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Login failed'; return; }
    setUser(data.user);
  } catch(err) { errEl.textContent = 'Connection error'; }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const errEl = document.getElementById('reg-err');
  errEl.textContent = '';
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Register failed'; return; }
    setUser(data.user);
  } catch(err) { errEl.textContent = 'Connection error'; }
}

function setUser(user) {
  currentUser = user;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('username-display').textContent = user.username;
  updateKeysDisplay(user.keys);
  if (user.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
  initPossibleDrops();
  buildInitialReel();
  switchTab('case');
}

function logout() {
  currentUser = null;
  selectedInvIds.clear();
  inventoryData = [];
  isSpinning = false;
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showAuthTab('login');
}

function updateKeysDisplay(keys) {
  document.getElementById('keys-count').textContent = keys;
  if (currentUser) currentUser.keys = keys;
}

/* ═══════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════ */
function switchTab(tab) {
  ['case','inventory','admin'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`ntab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'inventory') loadInventory();
  if (tab === 'admin') loadAdminUsers();
}

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
function knifeForSlot(winner, idx) {
  if (idx === WINNER_IDX) return winner;
  return KNIVES[Math.floor(Math.random() * KNIVES.length)];
}

function buildReel(winner) {
  const strip = document.getElementById('reel-strip');
  strip.innerHTML = '';
  const viewport = document.getElementById('reel-viewport');
  const startX = viewport.offsetWidth / 2 - ITEM_W / 2;
  strip.style.transition = 'none';
  strip.style.transform = `translateX(${startX}px)`;

  for (let i = 0; i < STRIP_COUNT; i++) {
    const knife = knifeForSlot(winner, i);
    const div = document.createElement('div');
    div.className = `ri ri-${knife.rarity}`;
    div.innerHTML = `
      <img src="${knife.image}" alt="${knife.name}" />
      <div class="ri-name">${knife.name}</div>
      <div class="ri-val">🪙${knife.value}</div>
    `;
    strip.appendChild(div);
  }
  return startX;
}

function buildInitialReel() {
  const strip = document.getElementById('reel-strip');
  strip.innerHTML = '';
  const viewport = document.getElementById('reel-viewport');
  const startX = (viewport.offsetWidth || 800) / 2 - ITEM_W / 2;
  strip.style.transition = 'none';
  strip.style.transform = `translateX(${startX}px)`;

  for (let i = 0; i < STRIP_COUNT; i++) {
    const knife = KNIVES[Math.floor(Math.random() * KNIVES.length)];
    const div = document.createElement('div');
    div.className = `ri ri-${knife.rarity}`;
    div.innerHTML = `
      <img src="${knife.image}" alt="${knife.name}" />
      <div class="ri-name">${knife.name}</div>
      <div class="ri-val">🪙${knife.value}</div>
    `;
    strip.appendChild(div);
  }
}

function scheduleTickSounds() {
  const DURATION = 6000;
  let t = 0, interval = 28;
  while (t < DURATION - 100) {
    const vol = Math.max(0.015, 0.07 - (t / DURATION) * 0.055);
    const delay = t;
    setTimeout(() => playTick(vol), delay);
    interval = Math.min(interval * 1.075, 420);
    t += interval;
  }
}

async function openCase() {
  if (isSpinning || !currentUser) return;
  if (currentUser.keys < 10) {
    alert("You don't have enough keys! Ask an admin for more.");
    return;
  }

  isSpinning = true;
  const btn = document.getElementById('open-btn');
  btn.disabled = true;
  btn.textContent = 'SPINNING...';

  try {
    const res = await fetch(`${API}/game/open-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to open case');
      isSpinning = false;
      btn.disabled = false;
      btn.innerHTML = '<span class="spin-icon">⚡</span> OPEN CASE';
      return;
    }

    updateKeysDisplay(data.keys);

    const winner = KNIVES.find(k => k.name === data.item.name) || KNIVES[0];
    const startX = buildReel(winner);

    // Force reflow before animation
    document.getElementById('reel-strip').offsetHeight;

    const endX = startX - WINNER_IDX * ITEM_TOTAL;

    // Small random offset so it doesn't always land dead center
    const nudge = Math.floor(Math.random() * 30) - 15;

    const strip = document.getElementById('reel-strip');
    strip.style.transition = 'transform 6s cubic-bezier(0.12, 0.85, 0.25, 1)';
    strip.style.transform = `translateX(${endX + nudge}px)`;

    scheduleTickSounds();

    setTimeout(() => {
      // Highlight winner card
      const items = strip.querySelectorAll('.ri');
      if (items[WINNER_IDX]) items[WINNER_IDX].classList.add('winner');

      playWinSound(winner.rarity);

      setTimeout(() => {
        showWinModal(winner, data.keys);
        isSpinning = false;
        btn.disabled = false;
        btn.innerHTML = '<span class="spin-icon">⚡</span> OPEN CASE';
      }, 700);
    }, 6100);

  } catch(err) {
    console.error(err);
    alert('Connection error');
    isSpinning = false;
    btn.disabled = false;
    btn.innerHTML = '<span class="spin-icon">⚡</span> OPEN CASE';
  }
}

/* ═══════════════════════════════════════
   WIN MODAL
═══════════════════════════════════════ */
function showWinModal(knife, keysLeft) {
  document.getElementById('win-img').src = knife.image;
  document.getElementById('win-img').alt = knife.name;
  document.getElementById('win-name').textContent = knife.name;
  document.getElementById('win-coins').textContent = `🪙 ${knife.value} Coins = ${knife.value} Robux`;
  document.getElementById('win-keys-left').textContent = `🗝️ ${keysLeft} keys remaining`;
  const badge = document.getElementById('win-badge');
  badge.textContent = knife.rarity;
  badge.className = `rarity-badge modal-badge ${knife.rarity}`;
  const glow = document.getElementById('modal-glow');
  glow.className = `modal-glow ${knife.rarity}`;
  document.getElementById('win-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('win-modal').classList.add('hidden');
}

/* ═══════════════════════════════════════
   INVENTORY
═══════════════════════════════════════ */
async function loadInventory() {
  selectedInvIds.clear();
  updateWithdrawBar();

  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '<div class="empty-msg">Loading...</div>';

  try {
    const res = await fetch(`${API}/game/inventory/${currentUser.id}`);
    const data = await res.json();
    inventoryData = data.items || [];

    const totalEl = document.getElementById('inv-total-count');
    totalEl.textContent = `${inventoryData.length} item${inventoryData.length !== 1 ? 's' : ''}`;

    if (inventoryData.length === 0) {
      grid.innerHTML = '<div class="empty-msg">No items yet. Open a case to get started!</div>';
      return;
    }

    grid.innerHTML = inventoryData.map(item => {
      const knife = KNIVES.find(k => k.name === item.itemName);
      const img = knife ? knife.image : 'knife-rusty.png';
      return `
        <div class="icard inv-item rarity-${item.rarity}" data-id="${item.id}" data-val="${item.value}" onclick="toggleInvItem(this)">
          <div class="sel-overlay"><span class="sel-check">✓</span></div>
          <img src="${img}" alt="${item.itemName}" />
          <div class="iname">${item.itemName}</div>
          <div class="ival">🪙 ${item.value}</div>
          <div class="rarity-badge ${item.rarity}">${item.rarity}</div>
        </div>
      `;
    }).join('');
  } catch(err) {
    grid.innerHTML = '<div class="empty-msg">Failed to load inventory.</div>';
  }
}

function toggleInvItem(el) {
  const id = parseInt(el.dataset.id);
  if (selectedInvIds.has(id)) {
    selectedInvIds.delete(id);
    el.classList.remove('selected');
  } else {
    selectedInvIds.add(id);
    el.classList.add('selected');
  }
  updateWithdrawBar();
}

function updateWithdrawBar() {
  const bar = document.getElementById('withdraw-bar');
  const count = selectedInvIds.size;
  const totalVal = inventoryData
    .filter(i => selectedInvIds.has(i.id))
    .reduce((s, i) => s + i.value, 0);

  document.getElementById('sel-count').textContent = `${count} selected`;
  document.getElementById('sel-robux').textContent = `${totalVal} Robux`;

  if (count > 0) bar.classList.remove('hidden');
  else bar.classList.add('hidden');
}

async function withdraw() {
  if (selectedInvIds.size === 0 || !currentUser) return;
  const ids = Array.from(selectedInvIds);

  try {
    const res = await fetch(`${API}/game/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, itemIds: ids }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Withdraw failed'); return; }

    playWithdrawSound();
    alert(`✅ Withdrawn! ${data.withdrawn} item(s) worth ${data.totalValue} Robux sent to Discord.`);
    await loadInventory();
  } catch(err) {
    alert('Connection error during withdrawal');
  }
}

/* ═══════════════════════════════════════
   ADMIN PANEL
═══════════════════════════════════════ */
async function loadAdminUsers() {
  if (!currentUser?.isAdmin) return;
  const list = document.getElementById('users-list');
  list.innerHTML = '<div class="loading-msg">Loading...</div>';

  try {
    const res = await fetch(`${API}/admin/users?adminId=${currentUser.id}`);
    const data = await res.json();
    if (!res.ok) { list.innerHTML = `<div class="loading-msg">${data.error}</div>`; return; }

    const users = data.users || [];
    if (users.length === 0) {
      list.innerHTML = '<div class="loading-msg">No regular users yet.</div>';
      return;
    }

    list.innerHTML = users.map(u => `
      <div class="user-row" id="urow-${u.id}">
        <div class="ur-name">👤 ${u.username}</div>
        <div class="ur-keys" id="ukeys-${u.id}">🗝️ ${u.keys} keys</div>
        <div class="ur-give">
          <input type="number" id="ugive-${u.id}" placeholder="Keys" min="1" max="9999" value="10" />
          <button class="btn-give" onclick="giveKeys(${u.id})">GIVE KEYS</button>
        </div>
        <span class="ur-feedback" id="ufb-${u.id}"></span>
      </div>
    `).join('');
  } catch(err) {
    list.innerHTML = '<div class="loading-msg">Failed to load users.</div>';
  }
}

async function giveKeys(userId) {
  if (!currentUser?.isAdmin) return;
  const input = document.getElementById(`ugive-${userId}`);
  const amount = parseInt(input.value);
  const fb = document.getElementById(`ufb-${userId}`);

  if (isNaN(amount) || amount <= 0) {
    fb.textContent = 'Enter a valid amount';
    fb.className = 'ur-feedback err';
    return;
  }

  try {
    const res = await fetch(`${API}/admin/give-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: currentUser.id, targetUserId: userId, amount }),
    });
    const data = await res.json();
    if (!res.ok) {
      fb.textContent = data.error || 'Failed';
      fb.className = 'ur-feedback err';
      return;
    }

    playCoinSound();
    document.getElementById(`ukeys-${userId}`).textContent = `🗝️ ${data.newKeys} keys`;
    fb.textContent = `✓ Gave ${amount} keys!`;
    fb.className = 'ur-feedback ok';
    input.value = '10';
    setTimeout(() => { fb.textContent = ''; }, 3000);
  } catch(err) {
    fb.textContent = 'Connection error';
    fb.className = 'ur-feedback err';
  }
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  showAuthTab('login');
});
