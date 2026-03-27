'use strict';

/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDEQf0TrDG7QtM96HfpcOrtFbFibFCaK3o",
  authDomain:        "case-clash.firebaseapp.com",
  projectId:         "case-clash",
  storageBucket:     "case-clash.firebasestorage.app",
  messagingSenderId: "251214048625",
  appId:             "1:251214048625:web:1f32ab6cbe8ab45f8adad0"
};

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1486783614388666448/yTR9D5E-hSwzP2Yn2am1ig81dWMDrDpCzlS-yXTTH_OrX3xvw-j4C4QDWuSgk9FFpBDN';

const KNIVES = [
  { name: 'Rusty Knife',     rarity: 'common',    value: 5,   image: 'knife-rusty.png' },
  { name: 'Forest Blade',    rarity: 'uncommon',  value: 15,  image: 'knife-forest.png' },
  { name: 'Crimson Edge',    rarity: 'rare',      value: 25,  image: 'knife-crimson.png' },
  { name: 'Shadow Cutter',   rarity: 'epic',      value: 40,  image: 'knife-shadow.png' },
  { name: 'Golden Blade',    rarity: 'legendary', value: 60,  image: 'knife-golden.png' },
  { name: 'Void Dagger',     rarity: 'mythical',  value: 80,  image: 'knife-void.png' },
  { name: 'Celestial Knife', rarity: 'celestial', value: 100, image: 'knife-celestial.png' },
];

const RARITY_COLORS = {
  common:    0x9e9e9e,
  uncommon:  0x4caf50,
  rare:      0x2196f3,
  epic:      0x9c27b0,
  legendary: 0xff9800,
  mythical:  0xf44336,
  celestial: 0xffeb3b,
};

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
let currentUser     = null;   // Firebase Auth user
let currentProfile  = null;   // Firestore profile { username, keys, inventory }
let isSpinning      = false;
let selectedItemIds = new Set();

/* ═══════════════════════════════════════
   FIREBASE — lazy dynamic import
═══════════════════════════════════════ */
let _fb = null;

async function getFirebase() {
  if (_fb) return _fb;
  const [appMod, authMod, storeMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js'),
  ]);
  const app  = appMod.initializeApp(FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);
  const db   = storeMod.getFirestore(app);
  _fb = { auth, db, authMod, storeMod };
  console.log('Firebase connected');
  return _fb;
}

/* ═══════════════════════════════════════
   FIRESTORE HELPERS
═══════════════════════════════════════ */
async function getProfile(username) {
  const { db, storeMod: { doc, getDoc } } = await getFirebase();
  const snap = await getDoc(doc(db, 'users', username));
  return snap.exists() ? snap.data() : null;
}

async function saveProfile(profile) {
  const { db, storeMod: { doc, setDoc } } = await getFirebase();
  await setDoc(doc(db, 'users', profile.username), profile);
  console.log('Inventory updated');
}

/* ═══════════════════════════════════════
   AUTH HELPERS
═══════════════════════════════════════ */
function toEmail(username) {
  return username.toLowerCase().trim() + '@game.com';
}

/* ═══════════════════════════════════════
   AUTH UI
═══════════════════════════════════════ */
function showAuthTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('atab-login').classList.toggle('active', tab === 'login');
  document.getElementById('atab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-err').textContent = '';
  document.getElementById('reg-err').textContent   = '';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-err');
  errEl.textContent = '';
  const btn = document.querySelector('#login-form .btn-auth');
  btn.disabled = true;
  btn.textContent = 'LOGGING IN...';
  try {
    const { auth, authMod: { signInWithEmailAndPassword } } = await getFirebase();
    await signInWithEmailAndPassword(auth, toEmail(username), password);
    // onAuthStateChanged handles the rest
  } catch(err) {
    errEl.textContent = friendlyAuthError(err.code);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'LOGIN';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const errEl    = document.getElementById('reg-err');
  errEl.textContent = '';
  if (username.length < 3) { errEl.textContent = 'Username must be 3+ characters.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be 6+ characters.'; return; }
  const btn = document.querySelector('#register-form .btn-auth');
  btn.disabled = true;
  btn.textContent = 'CREATING...';
  try {
    const { auth, db, authMod: { createUserWithEmailAndPassword }, storeMod: { doc, getDoc } } = await getFirebase();
    // Check username is not already taken
    const { getFirebase: _g, ..._ } = { getFirebase };
    const existing = await getProfile(username);
    if (existing) { errEl.textContent = 'Username already taken.'; return; }

    await createUserWithEmailAndPassword(auth, toEmail(username), password);
    // Create Firestore profile
    const profile = { username, keys: STARTER_KEYS, inventory: [] };
    await saveProfile(profile);
    console.log('User registered:', username);
    // onAuthStateChanged handles the rest
  } catch(err) {
    errEl.textContent = friendlyAuthError(err.code);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'CREATE ACCOUNT';
  }
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'User not found. Register first.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'Username already taken.',
    'auth/weak-password':        'Password must be 6+ characters.',
    'auth/invalid-email':        'Invalid username.',
    'auth/invalid-credential':   'Wrong username or password.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
  };
  return map[code] || 'Something went wrong. Try again.';
}

async function logout() {
  const { auth, authMod: { signOut } } = await getFirebase();
  await signOut(auth);
  currentUser    = null;
  currentProfile = null;
  isSpinning     = false;
  selectedItemIds.clear();
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showAuthTab('login');
}

/* ═══════════════════════════════════════
   GAME INIT (called after auth)
═══════════════════════════════════════ */
async function onUserLoggedIn(firebaseUser) {
  currentUser = firebaseUser;
  // Derive username from email (strip @game.com)
  const username = firebaseUser.email.replace('@game.com', '');
  // Load or create Firestore profile
  let profile = await getProfile(username);
  if (!profile) {
    profile = { username, keys: STARTER_KEYS, inventory: [] };
    await saveProfile(profile);
    console.log('User registered:', username);
  } else {
    console.log('User logged in:', username);
  }
  currentProfile = profile;

  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('username-display').textContent = username;
  updateKeysDisplay(profile.keys);
  initPossibleDrops();
  buildInitialReel();
  switchTab('case');
  console.log('Inventory loaded:', profile.inventory.length, 'items');
}

function updateKeysDisplay(keys) {
  document.getElementById('keys-count').textContent = keys;
  if (currentProfile) currentProfile.keys = keys;
}

/* ═══════════════════════════════════════
   TABS
═══════════════════════════════════════ */
function switchTab(tab) {
  ['case', 'inventory'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`ntab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'inventory') renderInventory();
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
async function openCase() {
  if (isSpinning || !currentProfile) return;
  if (currentProfile.keys < CASE_COST) {
    alert("You don't have enough keys!");
    return;
  }

  isSpinning = true;
  const btn  = document.getElementById('open-btn');
  btn.disabled = true;
  btn.textContent = 'SPINNING...';

  const winner = randomKnife();
  console.log('Item won:', winner.name, '(' + winner.rarity + ')');

  currentProfile.keys -= CASE_COST;
  const item = {
    id:     Date.now(),
    name:   winner.name,
    rarity: winner.rarity,
    value:  winner.value,
    image:  winner.image,
  };
  currentProfile.inventory = [...(currentProfile.inventory || []), item];
  updateKeysDisplay(currentProfile.keys);

  try {
    await saveProfile(currentProfile);
  } catch(err) {
    console.error('Failed to save to Firestore:', err);
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
}

/* ═══════════════════════════════════════
   WIN MODAL
═══════════════════════════════════════ */
function showWinModal(knife) {
  document.getElementById('win-img').src   = knife.image;
  document.getElementById('win-img').alt   = knife.name;
  document.getElementById('win-name').textContent      = knife.name;
  document.getElementById('win-coins').textContent     = `🪙 ${knife.value} Coins`;
  document.getElementById('win-keys-left').textContent = `🗝️ ${currentProfile.keys} keys remaining`;
  const badge = document.getElementById('win-badge');
  badge.textContent = knife.rarity;
  badge.className   = `rarity-badge modal-badge ${knife.rarity}`;
  document.getElementById('modal-glow').className = `modal-glow ${knife.rarity}`;
  document.getElementById('win-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('win-modal').classList.add('hidden');
}

/* ═══════════════════════════════════════
   INVENTORY
═══════════════════════════════════════ */
function renderInventory() {
  selectedItemIds.clear();
  updateWithdrawBar();

  const grid = document.getElementById('inventory-grid');
  const inv  = currentProfile?.inventory || [];
  document.getElementById('inv-total-count').textContent =
    `${inv.length} item${inv.length !== 1 ? 's' : ''}`;

  if (inv.length === 0) {
    grid.innerHTML = '<div class="empty-msg">No items yet. Open a case to get started!</div>';
    return;
  }

  grid.innerHTML = inv.slice().reverse().map(item => `
    <div class="icard inv-item rarity-${item.rarity}" data-id="${item.id}" data-val="${item.value}" onclick="toggleItem(this)">
      <div class="sel-overlay"><span class="sel-check">✓</span></div>
      <img src="${item.image}" alt="${item.name}" />
      <div class="iname">${item.name}</div>
      <div class="ival">🪙 ${item.value}</div>
      <div class="rarity-badge ${item.rarity}">${item.rarity}</div>
    </div>
  `).join('');
}

function toggleItem(el) {
  const id = Number(el.dataset.id);
  if (selectedItemIds.has(id)) {
    selectedItemIds.delete(id);
    el.classList.remove('selected');
  } else {
    selectedItemIds.add(id);
    el.classList.add('selected');
  }
  updateWithdrawBar();
}

function updateWithdrawBar() {
  const bar   = document.getElementById('withdraw-bar');
  const count = selectedItemIds.size;
  const total = (currentProfile?.inventory || [])
    .filter(i => selectedItemIds.has(i.id))
    .reduce((s, i) => s + i.value, 0);

  document.getElementById('sel-count').textContent = `${count} selected`;
  document.getElementById('sel-value').textContent = `${total} 🪙`;
  bar.classList.toggle('hidden', count === 0);
}

async function withdraw() {
  if (selectedItemIds.size === 0 || !currentProfile) return;
  const toWithdraw = currentProfile.inventory.filter(i => selectedItemIds.has(i.id));

  const btn = document.getElementById('withdraw-btn');
  btn.disabled = true;
  btn.textContent = 'SENDING...';

  // Build Discord embed
  const totalVal = toWithdraw.reduce((s, i) => s + i.value, 0);
  const fields   = toWithdraw.map(i => ({
    name:   i.name,
    value:  `Rarity: **${i.rarity}** | Value: **${i.value} 🪙**`,
    inline: false,
  }));

  const embed = {
    title:       `🎮 Withdrawal Request — ${currentProfile.username}`,
    description: `**${toWithdraw.length}** item(s) worth **${totalVal} 🪙 coins**`,
    color:       0xffd700,
    fields,
    footer: { text: `KnifeCase • ${new Date().toUTCString()}` },
  };

  try {
    const res = await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) throw new Error(`Discord responded ${res.status}`);

    // Remove withdrawn items from inventory
    currentProfile.inventory = currentProfile.inventory.filter(i => !selectedItemIds.has(i.id));
    await saveProfile(currentProfile);

    selectedItemIds.clear();
    renderInventory();
    alert(`✅ Withdrawal sent! ${toWithdraw.length} item(s) submitted.`);
  } catch(err) {
    console.error('Withdraw failed:', err);
    alert('❌ Withdrawal failed. Try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = '🎮 WITHDRAW';
  }
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  showAuthTab('login');

  const { auth, authMod: { onAuthStateChanged } } = await getFirebase();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await onUserLoggedIn(user);
    } else {
      currentUser    = null;
      currentProfile = null;
      document.getElementById('game-screen').classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
    }
  });
});
