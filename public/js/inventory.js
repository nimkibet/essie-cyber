import { supabase, currentUser, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';
requireAuth();

async function load() {
    const {data} = await supabase.from('inventory').select('*').order('name');
    const tb = document.getElementById('inv-tbody'); 
    tb.innerHTML = '';
    
    (data||[]).forEach(i => {
        // Main Display Row
        tb.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
            <td class="py-3 px-4 font-medium text-slate-800">${i.name}</td>
            <td class="py-3 px-4"><span class="px-2 py-1 text-xs font-bold rounded ${i.is_service ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}">${i.is_service ? 'Service' : i.type}</span></td>
            <td class="py-3 px-4 text-right">${i.buying_price}</td>
            <td class="py-3 px-4 text-right font-bold text-slate-800">${i.selling_price}</td>
            <td class="py-3 px-4 text-center">${i.is_service ? '-' : i.stock_quantity}</td>
            <td class="py-3 px-4 text-center">
                <button class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded font-bold text-xs mr-2 transition-colors" onclick="toggleEdit('${i.id}')">Edit</button>
                <button class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded font-bold text-xs transition-colors" onclick="del('${i.id}', '${i.name.replace(/'/g, "\\'")}')">Delete</button>
            </td>
        </tr>
        
        <!-- Inline Edit Row (Hidden by default) -->
        <tr id="edit-row-${i.id}" class="hidden bg-slate-100 border-b-2 border-slate-200 shadow-inner">
            <td colspan="6" class="p-4">
                <div class="grid grid-cols-1 md:grid-cols-6 gap-4 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div class="md:col-span-2">
                        <label class="block text-xs font-bold mb-1 text-slate-600">Item Name</label>
                        <input type="text" id="edit-name-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value="${i.name}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Type</label>
                        <select id="edit-type-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="fixed" ${i.type === 'fixed' ? 'selected' : ''}>Fixed Price</option>
                            <option value="variable" ${i.type === 'variable' ? 'selected' : ''}>Variable Price</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Buy Price (Ksh)</label>
                        <input type="number" id="edit-bp-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value="${i.buying_price}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Sell Price (Ksh)</label>
                        <input type="number" id="edit-sp-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value="${i.selling_price}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1 text-slate-600">Stock Qty</label>
                        <input type="number" id="edit-stock-${i.id}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value="${i.stock_quantity}">
                    </div>
                    <div class="md:col-span-6 flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                        <div class="flex items-center">
                            <input type="checkbox" id="edit-svc-${i.id}" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" ${i.is_service ? 'checked' : ''}>
                            <label class="ml-2 text-sm font-bold text-slate-700">This is a Service (Raw materials tracked via Admin/Resources)</label>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="toggleEdit('${i.id}')" class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                            <button onclick="saveEdit('${i.id}')" class="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20">Save Changes</button>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
        `;
    });
}

window.toggleEdit = (id) => {
    const row = document.getElementById(`edit-row-${id}`);
    if (row.classList.contains('hidden')) {
        // Hide all other open edits first
        document.querySelectorAll('[id^="edit-row-"]').forEach(el => el.classList.add('hidden'));
        row.classList.remove('hidden');
    } else {
        row.classList.add('hidden');
    }
};

window.saveEdit = async (id) => {
    const payload = {
        name: document.getElementById(`edit-name-${id}`).value,
        type: document.getElementById(`edit-type-${id}`).value,
        is_service: document.getElementById(`edit-svc-${id}`).checked,
        buying_price: parseFloat(document.getElementById(`edit-bp-${id}`).value || 0),
        selling_price: parseFloat(document.getElementById(`edit-sp-${id}`).value || 0),
        stock_quantity: parseInt(document.getElementById(`edit-stock-${id}`).value || 0)
    };
    
    if(!payload.name) {
        alert("Name is required");
        return;
    }
    
    // Save to supabase
    const { error } = await supabase.from('inventory').update(payload).eq('id', id);
    if (error) {
        alert("Error saving: " + error.message);
    } else {
        load();
    }
};

window.del = (id, name) => { 
    showModal('Delete Item', `<p>Are you sure you want to delete <strong>${name}</strong>? This action cannot be undone.</p>`, async (close) => {
        await supabase.from('inventory').delete().eq('id',id);
        close(); load();
    }, 'Delete Item');
};

document.getElementById('btn-add-item').addEventListener('click', () => {
    showModal('Add New Item / Service', `
        <div class="space-y-3">
            <div>
                <label class="block text-sm font-semibold mb-1">Name</label>
                <input type="text" id="add-name" class="w-full border rounded px-3 py-2">
            </div>
            <div class="flex gap-4">
                <div class="flex-1">
                    <label class="block text-sm font-semibold mb-1">Type</label>
                    <select id="add-type" class="w-full border rounded px-3 py-2">
                        <option value="fixed">Fixed Price</option>
                        <option value="variable">Variable Price</option>
                    </select>
                </div>
                <div class="flex items-center pt-6">
                    <input type="checkbox" id="add-is-service" class="mr-2 h-4 w-4">
                    <label class="text-sm font-semibold">Is Service?</label>
                </div>
            </div>
            <div class="flex gap-4">
                <div class="flex-1">
                    <label class="block text-sm font-semibold mb-1">Buying Price</label>
                    <input type="number" id="add-bp" class="w-full border rounded px-3 py-2" value="0">
                </div>
                <div class="flex-1">
                    <label class="block text-sm font-semibold mb-1">Selling Price</label>
                    <input type="number" id="add-sp" class="w-full border rounded px-3 py-2" value="0">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Initial Stock (If Product)</label>
                <input type="number" id="add-stock" class="w-full border rounded px-3 py-2" value="0">
            </div>
        </div>
    `, async (close) => {
        const payload = {
            name: document.getElementById('add-name').value,
            type: document.getElementById('add-type').value,
            is_service: document.getElementById('add-is-service').checked,
            buying_price: parseFloat(document.getElementById('add-bp').value||0),
            selling_price: parseFloat(document.getElementById('add-sp').value||0),
            stock_quantity: parseInt(document.getElementById('add-stock').value||0)
        };
        if(!payload.name) throw new Error("Name is required");
        await supabase.from('inventory').insert([payload]);
        close(); load();
    }, 'Save Item');
});

load();
document.getElementById('inv-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#inv-tbody tr');
    for(let i=0; i<rows.length; i+=2) {
        const displayRow = rows[i];
        const editRow = rows[i+1];
        if(!displayRow) continue;
        const text = displayRow.innerText.toLowerCase();
        if(text.includes(term)) {
            displayRow.style.display = '';
        } else {
            displayRow.style.display = 'none';
            if(editRow) editRow.classList.add('hidden');
        }
    }
});

