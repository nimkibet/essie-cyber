import { login, checkSession } from './supabaseClient.js';
if (checkSession()) window.location.href = '/pos.html';
let loginUser = 'cashier'; let currentPin = '';
function updatePin() {
    document.querySelectorAll('.pin-dot').forEach((dot, idx) => {
        if (idx < currentPin.length) dot.classList.replace('border-slate-300', 'bg-blue-600');
        else { dot.classList.remove('bg-blue-600'); dot.classList.add('border-slate-300'); }
    });
}
document.querySelectorAll('.user-btn').forEach(btn => btn.addEventListener('click', (e) => {
    loginUser = e.currentTarget.dataset.user;
    document.querySelectorAll('.user-btn').forEach(b => b.className = "user-btn flex-1 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900");
    e.currentTarget.className = "user-btn flex-1 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 bg-white text-blue-600 shadow-sm";
}));
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
    if (currentPin.length < 4) return alert('Enter 4 digit PIN');
    const res = await login(loginUser, currentPin);
    if (res.success) window.location.href = '/pos.html';
    else { document.getElementById('login-error').classList.remove('hidden'); currentPin = ''; updatePin(); }
}
