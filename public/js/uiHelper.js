export function showModal(title, contentHtml, onConfirm, confirmText = 'Confirm') {
    // Remove existing modal if any
    const existing = document.getElementById('essie-modal');
    if (existing) existing.remove();

    const modalHTML = `
        <div id="essie-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm opacity-0 transition-opacity duration-200">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform scale-95 transition-transform duration-200">
                <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 class="text-lg font-bold text-slate-800">${title}</h3>
                    <button id="essie-modal-close" class="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                </div>
                <div class="p-6">
                    ${contentHtml}
                </div>
                <div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button id="essie-modal-cancel" class="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button id="essie-modal-confirm" class="px-4 py-2 bg-blue-600 text-white font-bold hover:bg-blue-700 rounded-lg transition-colors shadow-md shadow-blue-600/20">${confirmText}</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('essie-modal');
    const contentBox = modal.querySelector('div.bg-white');
    
    // Animate in
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        contentBox.classList.remove('scale-95');
    });

    const close = () => {
        modal.classList.add('opacity-0');
        contentBox.classList.add('scale-95');
        setTimeout(() => modal.remove(), 200);
    };

    document.getElementById('essie-modal-close').addEventListener('click', close);
    document.getElementById('essie-modal-cancel').addEventListener('click', close);
    document.getElementById('essie-modal-confirm').addEventListener('click', async () => {
        const btn = document.getElementById('essie-modal-confirm');
        btn.disabled = true;
        btn.innerHTML = 'Processing...';
        try {
            await onConfirm(close);
        } catch (e) {
            alert(e.message);
            btn.disabled = false;
            btn.innerHTML = confirmText;
        }
    });
}
