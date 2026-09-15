import { login, checkSession, supabase } from './supabaseClient.js';
if (checkSession()) window.location.href = '/pos.html';

let loginUser = ''; 
let currentPin = '';

async function loadUsers() {
    try {
        const { data, error } = await supabase.from('users').select('username, role').order('role');
        if (error) throw error;
        
        const selector = document.getElementById('user-selector');
        selector.innerHTML = '';
        
        data.forEach((u, idx) => {
            if(idx === 0) loginUser = u.username;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.user = u.username;
            btn.className = idx === 0 
                ? "user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-blue-600 shadow-sm"
                : "user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
            
            const icon = u.role === 'admin' ? '🛡️' : '👤';
            btn.innerHTML = `${icon} <span class="capitalize">${u.username}</span>`;
            
            btn.addEventListener('click', (e) => {
                loginUser = e.currentTarget.dataset.user;
                document.querySelectorAll('.user-btn').forEach(b => b.className = "user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900");
                e.currentTarget.className = "user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-blue-600 shadow-sm";
            });
            selector.appendChild(btn);
        });
    } catch (err) {
        document.getElementById('user-selector').innerHTML = '<div class="text-sm text-red-500 w-full text-center py-2">Error loading users</div>';
    }
}

function updatePin() {
    document.querySelectorAll('.pin-dot').forEach((dot, idx) => {
        if (idx < currentPin.length) dot.classList.replace('border-slate-300', 'bg-blue-600');
        else { dot.classList.remove('bg-blue-600'); dot.classList.add('border-slate-300'); }
    });
}

document.querySelectorAll('.keypad-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const val = e.currentTarget.dataset.val; document.getElementById('login-error').classList.add('hidden');
    if (val === 'clear') currentPin = '';
    else if (val === 'back') currentPin = currentPin.slice(0, -1);
    else if (currentPin.length < 4) currentPin += val;
    updatePin();
}));

document.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '9' && currentPin.length < 4) { currentPin += e.key; updatePin(); }
    else if (e.key === 'Backspace') { currentPin = currentPin.slice(0, -1); updatePin(); }
    else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') { currentPin = ''; updatePin(); }
    else if (e.key === 'Enter') processLogin();
});

document.getElementById('btn-login-submit').addEventListener('click', processLogin);

async function processLogin() {
    if (!loginUser) return alert('Please select a user');
    if (currentPin.length < 4) return alert('Enter 4 digit PIN');
    
    // Disable inputs while logging in
    document.getElementById('login-error').classList.add('hidden');
    
    const res = await login(loginUser, currentPin);
    if (res.success) window.location.href = '/pos.html';
    else { 
        document.getElementById('login-error').classList.remove('hidden'); 
        currentPin = ''; 
        updatePin(); 
    }
}

// Init
loadUsers();
