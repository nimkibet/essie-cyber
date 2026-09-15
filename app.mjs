import { checkSession, login, logout, currentUser } from './supabaseClient.js';
import { initPOS } from './modules/pos.js';
import { initAdmin } from './modules/admin.js';
import { initAnalytics } from './modules/analytics.js';

const views = {
    login: document.getElementById('login-view'),
    pos: document.getElementById('pos-view'),
    admin: document.getElementById('admin-view'),
    analytics: document.getElementById('analytics-view')
};

const nav = document.getElementById('app-nav');
const main = document.getElementById('app-main');
const navTitle = document.getElementById('nav-title');

// Login State
let loginUser = 'cashier';
let currentPin = '';

async function initApp() {
    if (checkSession()) {
        showAppShell();
        applyRolePermissions();
        await navigateTo('pos');
    } else {
        showLogin();
    }
    setupEventListeners();
    setupKeypadLogic();
}

function hideAllViews() {
    Object.values(views).forEach(view => view.classList.remove('active'));
}

export async function navigateTo(viewName) {
    if (!currentUser) return showLogin();
    if ((viewName === 'admin' || viewName === 'analytics' || viewName === 'inventory') && currentUser.role !== 'admin') {
        alert("Admin access required.");
        return;
    }
    
    hideAllViews();
    views[viewName === 'inventory' ? 'admin' : viewName].classList.add('active');
    
    document.querySelectorAll('#app-nav button').forEach(btn => {
        btn.classList.remove('bg-blue-600');
        if (btn.id !== 'nav-btn-logout') btn.classList.add('bg-slate-700');
    });
    
    if (viewName !== 'login') {
        const activeBtn = document.getElementById(`nav-btn-${viewName === 'inventory' ? 'admin' : viewName}`);
        if(activeBtn) {
            activeBtn.classList.remove('bg-slate-700');
            activeBtn.classList.add('bg-blue-600');
        }
    }

    switch(viewName) {
        case 'pos':
            navTitle.textContent = '/ POS';
            await initPOS();
            break;
        case 'admin':
        case 'inventory':
            navTitle.textContent = '/ Admin';
            await initAdmin();
            break;
        case 'analytics':
            navTitle.textContent = '/ Analytics';
            await initAnalytics();
            break;
    }
}

function showLogin() {
    nav.classList.add('hidden');
    main.classList.add('hidden');
    hideAllViews();
    views.login.classList.add('active');
}

function showAppShell() {
    nav.classList.remove('hidden');
    main.classList.remove('hidden');
    document.getElementById('nav-btn-admin').textContent = `${currentUser.username} (${currentUser.role})`;
}

function applyRolePermissions() {
    if (currentUser.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
}

// --- KEYPAD LOGIC ---
function updatePinDisplay() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
        if (idx < currentPin.length) {
            dot.classList.remove('border-slate-300');
            dot.classList.add('bg-blue-600', 'border-blue-600');
        } else {
            dot.classList.add('border-slate-300');
            dot.classList.remove('bg-blue-600', 'border-blue-600');
        }
    });
}

function setupKeypadLogic() {
    // User Toggle
    document.querySelectorAll('.user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            loginUser = e.currentTarget.dataset.user;
            document.querySelectorAll('.user-btn').forEach(b => {
                b.className = "user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
            });
            e.currentTarget.className = "user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-blue-600 shadow-sm";
            document.getElementById('login-error').classList.add('hidden');
        });
    });

    // Keypad Clicks
    document.querySelectorAll('.keypad-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const val = e.currentTarget.dataset.val;
            document.getElementById('login-error').classList.add('hidden');
            
            if (val === 'clear') {
                currentPin = '';
            } else if (val === 'back') {
                currentPin = currentPin.slice(0, -1);
            } else {
                if (currentPin.length < 4) currentPin += val;
            }
            updatePinDisplay();
        });
    });

    // Keyboard support
    document.addEventListener('keydown', (e) => {
        if (views.login.classList.contains('active')) {
            if (e.key >= '0' && e.key <= '9' && currentPin.length < 4) {
                currentPin += e.key;
                updatePinDisplay();
            } else if (e.key === 'Backspace') {
                currentPin = currentPin.slice(0, -1);
                updatePinDisplay();
            } else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') {
                currentPin = '';
                updatePinDisplay();
            } else if (e.key === 'Enter') {
                processLogin();
            }
        } else if (currentUser && e.key === 'F2') {
            e.preventDefault();
            if (!views.pos.classList.contains('active')) navigateTo('pos');
            setTimeout(() => {
                const search = document.getElementById('pos-item-search');
                if (search) search.focus();
            }, 100);
        }
    });

    document.getElementById('btn-login-submit').addEventListener('click', processLogin);
}

async function processLogin() {
    if (currentPin.length < 4) {
        showLoginError("PIN must be 4 digits");
        return;
    }
    
    const btn = document.getElementById('btn-login-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Authenticating...';
    btn.disabled = true;

    const res = await login(loginUser, currentPin);
    
    if (res.success) {
        document.getElementById('login-error').classList.add('hidden');
        currentPin = '';
        updatePinDisplay();
        showAppShell();
        applyRolePermissions();
        navigateTo(loginUser === 'admin' ? 'admin' : 'pos');
    } else {
        showLoginError(res.message || "Invalid credentials");
        currentPin = '';
        updatePinDisplay();
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
}

function showLoginError(msg) {
    document.getElementById('login-error-msg').textContent = msg;
    document.getElementById('login-error').classList.remove('hidden');
}

function setupEventListeners() {
    document.getElementById('nav-btn-pos').addEventListener('click', () => navigateTo('pos'));
    document.getElementById('nav-btn-admin').addEventListener('click', () => navigateTo('admin'));
    document.getElementById('nav-btn-inventory').addEventListener('click', () => navigateTo('inventory'));
    document.getElementById('nav-btn-analytics').addEventListener('click', () => navigateTo('analytics'));
    document.getElementById('nav-btn-logout').addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', initApp);