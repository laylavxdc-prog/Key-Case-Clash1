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

// Hardcoded admin usernames — add any username here to grant instant admin access.
const ADMIN_USERNAMES = ['idek', 'admin'];

// Weighted knife chances. Must add up to 100.
const KNIVES = [
  { name: 'Rusty Knife',     rarity: 'common',    value: 5,   image: 'knife-rusty.png',     chance: 40 },
  { name: 'Forest Blade',    rarity: 'uncommon',  value: 15,  image: 'knife-forest.png',    chance: 25 },
  { name: 'Crimson Edge',    rarity: 'rare',      value: 25,  image: 'knife-crimson.png',   chance: 18 },
  { name: 'Shadow Cutter',   rarity: 'epic',      value: 40,  image: 'knife-shadow.png',    chance: 10 },
  { name: 'Golden Blade',    rarity: 'legendary', value: 60,  image: 'knife-golden.png',    chance: 5  },
  { name: 'Void Dagger',     rarity: 'mythical',  value: 80,  image: 'knife-void.png',      chance: 1.5},
  { name: 'Celestial Knife', rarity: 'celestial', value: 100, image: 'knife-celestial.png', chance: 0.5},
];
const TOTAL_CHANCE = KNIVES.reduce((s, k) => s + k.chance, 0); // = 100

const ITEM_W       = 110;
const ITEM_GAP     = 10;
const ITEM_TOTAL   = ITEM_W + ITEM_GAP;
const STRIP_COUNT  = 60;
const WINNER_IDX   = 45;
const CASE_COST    = 10;
const STARTER_KEYS = 0;

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let currentUser          = null;
let currentProfile       = null;
let isSpinning           = false;
let selectedItemIds      = new Set();
let adminLog             = [];
let unsubscribeProfile   = null;  // Firestore real-time listener

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
}

// Real-time listener so balance updates without refreshing
async function startProfileListener(username) {
  const { db, storeMod: { doc, onSnapshot } } = await getFirebase();
  if (unsubscribeProfile) unsubscribeProfile();
  unsubscribeProfile = onSnapshot(doc(db, 'users', username), (snap) => {
    if (!snap.exists() || !currentProfile) return;
    const data = snap.data();
    const newKeys = data.keys ?? 0;
    // If keys went up externally (admin added keys), play sound + toast
    if (newKeys > (currentProfile.keys || 0)) {
      const added = newKeys - (currentProfile.keys || 0);
      playKeysReceivedSound();
      showToast(`🗝️ +${added} keys added to your account!`, 'success');
    }
    currentProfile.keys      = newKeys;
    currentProfile.inventory = data.inventory || currentProfile.inventory;
    updateKeysDisplay(newKeys);
  });
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
  btn.disabled = true; btn.textContent = 'LOGGING IN...';
  try {
    const { auth, authMod: { signInWithEmailAndPassword } } = await getFirebase();
    await signInWithEmailAndPassword(auth, toEmail(username), password);
  } catch(err) {
    errEl.textContent = friendlyAuthError(err.code);
  } finally {
    btn.disabled = false; btn.textContent = 'LOGIN';
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
  btn.disabled = true; btn.textContent = 'CREATING...';
  try {
    const { auth, authMod: { createUserWithEmailAndPassword } } = await getFirebase();
    const existing = await getProfile(username);
    if (existing) { errEl.textContent = 'Username already taken.'; return; }
    // Save profile FIRST so onAuthStateChanged finds it immediately
    const isAdminUser = ADMIN_USERNAMES.includes(username.toLowerCase());
    await saveProfile({ username, keys: STARTER_KEYS, inventory: [], isAdmin: isAdminUser });
    await createUserWithEmailAndPassword(auth, toEmail(username), password);
  } catch(err) {
    errEl.textContent = friendlyAuthError(err.code);
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
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
  if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null; }
  const { auth, authMod: { signOut } } = await getFirebase();
  await signOut(auth);
  currentUser = null; currentProfile = null;
  isSpinning = false; selectedItemIds.clear(); adminLog = [];
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('ntab-admin').classList.add('hidden');
  showAuthTab('login');
}

/* ═══════════════════════════════════════
   GAME INIT
═══════════════════════════════════════ */
async function onUserLoggedIn(firebaseUser) {
  currentUser = firebaseUser;
  const username = firebaseUser.email.replace('@game.com', '');

  let profile = await getProfile(username);
  if (!profile) {
    profile = { username, keys: STARTER_KEYS, inventory: [], isAdmin: false };
    await saveProfile(profile);
  }

  const isAdmin = ADMIN_USERNAMES.includes(username.toLowerCase()) || profile.isAdmin === true;
  if (isAdmin && !profile.isAdmin) {
    profile.isAdmin = true;
    await saveProfile(profile);
  }
  profile.isAdmin = isAdmin;
  currentProfile  = profile;

  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('username-display').textContent = username;
  updateKeysDisplay(profile.keys);

  const adminBtn = document.getElementById('ntab-admin');
  isAdmin ? adminBtn.classList.remove('hidden') : adminBtn.classList.add('hidden');

  initPossibleDrops();
  buildInitialReel();
  switchTab('case');

  // Start real-time listener AFTER showing the game
  startProfileListener(username);

  console.log('Logged in:', username, '| Keys:', profile.keys, '| Admin:', isAdmin);
}

function updateKeysDisplay(keys) {
  document.getElementById('keys-count').textContent = keys;
  if (currentProfile) currentProfile.keys = keys;
}

/* ═══════════════════════════════════════
   TABS
═══════════════════════════════════════ */
function switchTab(tab) {
  ['case', 'inventory', 'admin'].forEach(t => {
    const panel = document.getElementById(`tab-${t}`);
    if (panel) panel.classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`ntab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'inventory') renderInventory();
  if (tab === 'admin')     renderAdminLog();
}

/* ═══════════════════════════════════════
   TOAST NOTIFICATION
═══════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type || 'info'}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast toast-hide'; }, 3200);
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
      <div class="drop-chance">${k.chance}%</div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════
   WEIGHTED RANDOM KNIFE
═══════════════════════════════════════ */
function randomKnife() {
  let r = Math.random() * TOTAL_CHANCE;
  for (const knife of KNIVES) {
    r -= knife.chance;
    if (r <= 0) return knife;
  }
  return KNIVES[KNIVES.length - 1];
}

/* ═══════════════════════════════════════
   REEL
═══════════════════════════════════════ */
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
  if (audioCtx.state === 'suspended') audioCtx.resume();
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
  o.start(start); o.stop(start + duration + 0.01);
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
function playWithdrawSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    osc(330, 'sine', t,        0.15, 0.12, ctx);
    osc(440, 'sine', t + 0.1,  0.18, 0.14, ctx);
    osc(660, 'sine', t + 0.22, 0.25, 0.16, ctx);
    osc(880, 'sine', t + 0.35, 0.3,  0.18, ctx);
  } catch(e) {}
}
function playKeysReceivedSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => osc(f, 'sine', t + i * 0.08, 0.3, 0.15, ctx));
  } catch(e) {}
}
function scheduleTickSounds() {
  // First tick plays immediately at t=0
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

/* ═══════════════════════════════════════
   CASE OPENING
═══════════════════════════════════════ */
async function openCase() {
  if (isSpinning || !currentProfile) return;
  if (currentProfile.keys < CASE_COST) {
    showToast("Not enough keys! Ask an admin to top you up.", 'error');
    return;
  }

  isSpinning = true;
  const btn  = document.getElementById('open-btn');
  btn.disabled = true;
  btn.textContent = 'SPINNING...';

  // Wake audio context immediately on user tap (important on mobile)
  try { getCtx(); } catch(e) {}

  const winner = randomKnife();

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
    console.error('Failed to save:', err);
  }

  const startX = buildReel(winner);
  document.getElementById('reel-strip').offsetHeight; // force reflow

  // Start sounds IMMEDIATELY before animation
  scheduleTickSounds();

  const endX  = startX - WINNER_IDX * ITEM_TOTAL;
  const nudge = Math.floor(Math.random() * 30) - 15;
  const strip = document.getElementById('reel-strip');
  strip.style.transition = 'transform 6s cubic-bezier(0.12, 0.85, 0.25, 1)';
  strip.style.transform  = `translateX(${endX + nudge}px)`;

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
  document.getElementById('win-img').src           = knife.image;
  document.getElementById('win-img').alt           = knife.name;
  document.getElementById('win-name').textContent  = knife.name;
  document.getElementById('win-coins').textContent = `🪙 ${knife.value} Coins`;
  document.getElementById('win-keys-left').textContent = `🗝️ ${currentProfile.keys} keys remaining`;
  const badge = document.getElementById('win-badge');
  badge.textContent = knife.rarity;
  badge.className   = `rarity-badge modal-badge ${knife.rarity}`;
  document.getElementById('modal-glow').className = `modal-glow ${knife.rarity}`;
  document.getElementById('win-modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('win-modal').classList.add('hidden'); }

/* ═══════════════════════════════════════
   INVENTORY
═══════════════════════════════════════ */
function renderInventory() {
  selectedItemIds.clear();
  updateWithdrawBar();
  const grid = document.getElementById('inventory-grid');
  const inv  = currentProfile?.inventory || [];
  document.getElementById('inv-total-count').textContent = `${inv.length} item${inv.length !== 1 ? 's' : ''}`;
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
  if (selectedItemIds.has(id)) { selectedItemIds.delete(id); el.classList.remove('selected'); }
  else                         { selectedItemIds.add(id);    el.classList.add('selected'); }
  updateWithdrawBar();
}

function updateWithdrawBar() {
  const bar   = document.getElementById('withdraw-bar');
  const count = selectedItemIds.size;
  const total = (currentProfile?.inventory || []).filter(i => selectedItemIds.has(i.id)).reduce((s, i) => s + i.value, 0);
  document.getElementById('sel-count').textContent = `${count} selected`;
  document.getElementById('sel-value').textContent = `${total} 🪙`;
  bar.classList.toggle('hidden', count === 0);
}

/* ═══════════════════════════════════════
   WITHDRAW
═══════════════════════════════════════ */
async function withdraw() {
  if (selectedItemIds.size === 0 || !currentProfile) return;
  const toWithdraw = currentProfile.inventory.filter(i => selectedItemIds.has(i.id));
  const btn = document.getElementById('withdraw-btn');
  btn.disabled = true; btn.textContent = 'SENDING...';

  const totalVal = toWithdraw.reduce((s, i) => s + i.value, 0);
  const fields   = toWithdraw.map(i => ({
    name:   i.name,
    value:  `Rarity: **${i.rarity}** | Value: **${i.value} 🪙**`,
    inline: false,
  }));

  const embed = {
    title:       `🎮 Withdrawal — ${currentProfile.username}`,
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
    if (!res.ok) throw new Error(`Discord ${res.status}`);

    // Remove from inventory
    currentProfile.inventory = currentProfile.inventory.filter(i => !selectedItemIds.has(i.id));
    await saveProfile(currentProfile);

    playWithdrawSound();
    showWithdrawModal(toWithdraw, totalVal);

    selectedItemIds.clear();
    renderInventory();
  } catch(err) {
    console.error('Withdraw failed:', err);
    showToast('❌ Withdrawal failed. Try again.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '🎮 WITHDRAW';
  }
}

function showWithdrawModal(items, totalVal) {
  document.getElementById('wd-items').innerHTML = items.map(i => `
    <div class="wd-item rarity-${i.rarity}">
      <img src="${i.image}" alt="${i.name}" />
      <div class="wd-item-info">
        <div class="wd-item-name">${i.name}</div>
        <div class="rarity-badge ${i.rarity}" style="font-size:9px;padding:2px 8px;">${i.rarity}</div>
      </div>
      <div class="wd-item-val">🪙 ${i.value}</div>
    </div>
  `).join('');
  document.getElementById('wd-total').textContent = `Total: ${totalVal} 🪙 coins sent to Discord`;
  document.getElementById('withdraw-modal').classList.remove('hidden');
}
function closeWithdrawModal() { document.getElementById('withdraw-modal').classList.add('hidden'); }

/* ═══════════════════════════════════════
   ADMIN
═══════════════════════════════════════ */
async function adminAddKeys() {
  if (!currentProfile?.isAdmin) return;
  const targetUser = document.getElementById('admin-target-user').value.trim().toLowerCase();
  const amount     = parseInt(document.getElementById('admin-keys-amount').value, 10);
  const errEl      = document.getElementById('admin-err');
  const successEl  = document.getElementById('admin-success');
  errEl.textContent = ''; successEl.classList.add('hidden');
  if (!targetUser) { errEl.textContent = 'Enter a username.'; return; }
  if (!amount || amount < 1) { errEl.textContent = 'Enter a valid number of keys (min 1).'; return; }
  const btn = document.querySelector('#tab-admin .btn-auth');
  btn.disabled = true; btn.textContent = 'ADDING...';
  try {
    const profile = await getProfile(targetUser);
    if (!profile) { errEl.textContent = `User "${targetUser}" not found.`; return; }
    profile.keys = (profile.keys || 0) + amount;
    await saveProfile(profile);
    const entry = { time: new Date().toLocaleString(), admin: currentProfile.username, target: targetUser, amount, newTotal: profile.keys };
    adminLog.unshift(entry);
    successEl.textContent = `✅ Added ${amount} keys to ${targetUser}. They now have ${profile.keys} keys.`;
    successEl.classList.remove('hidden');
    document.getElementById('admin-target-user').value = '';
    document.getElementById('admin-keys-amount').value = '';
    renderAdminLog();
  } catch(err) {
    errEl.textContent = 'Failed to add keys. Try again.';
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = 'ADD KEYS';
  }
}

function renderAdminLog() {
  const el = document.getElementById('admin-log');
  if (!el) return;
  if (adminLog.length === 0) {
    el.innerHTML = '<div class="empty-msg" style="font-size:13px;padding:12px 0;">No actions yet this session.</div>';
    return;
  }
  el.innerHTML = adminLog.map(e => `
    <div class="admin-log-entry">
      <span class="al-time">${e.time}</span>
      <span class="al-text">Added <strong>${e.amount}</strong> keys to <strong>${e.target}</strong> → now <strong>${e.newTotal}</strong> keys</span>
    </div>
  `).join('');
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
      currentUser = null; currentProfile = null;
      document.getElementById('game-screen').classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
    }
  });
});
