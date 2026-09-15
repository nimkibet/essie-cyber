import { supabase, requireAuth } from './supabaseClient.js';
requireAuth();

let allInventory = [];
let groups = []; // [{id, name, items: [{id, name, selling_price}], noStock}]
let linkedResources = []; // [{id, name}]
let dragItem = null;

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
    const { data: inv } = await supabase.from('inventory').select('id, name, selling_price, buying_price').order('name');
    allInventory = inv || [];

    // Load saved settings from DB
    const { data: rows } = await supabase.from('settings').select('key, value').in('key', ['binding_groups', 'binding_linked_resources', 'binding_show_tape']);
    const settingsMap = {};
    (rows || []).forEach(r => settingsMap[r.key] = r.value);

    groups = settingsMap['binding_groups'] ? JSON.parse(settingsMap['binding_groups']) : [];
    linkedResources = settingsMap['binding_linked_resources'] ? JSON.parse(settingsMap['binding_linked_resources']) : [
        // defaults: EMBOSSED and PVC BLUE
        ...allInventory.filter(i => i.name === 'EMBOSSED' || i.name === 'PVC (BLUE)').map(i => ({ id: i.id, name: i.name }))
    ];
    document.getElementById('chk-show-tape').checked = settingsMap['binding_show_tape'] === 'true';

    renderAll();
    renderLinkedResources();
    renderLinkedSelect();
}

// ─────────────────────────────────────────────────────────────────────────────
// POOL (unassigned spirals)
// ─────────────────────────────────────────────────────────────────────────────
function getAssignedIds() {
    return new Set(groups.flatMap(g => g.items.map(i => i.id)));
}

function renderPool() {
    const container = document.getElementById('pool-container');
    const emptyMsg = document.getElementById('pool-empty');
    const assigned = getAssignedIds();

    // Spirals and binding tapes that haven't been assigned yet
    const spirals = allInventory.filter(i => {
        const n = i.name.toLowerCase();
        return (n.includes('spiral') && !n.includes('a5 spiral')) && !assigned.has(i.id);
    });

    // Remove all chips but keep the empty msg span
    [...container.querySelectorAll('.item-chip')].forEach(el => el.remove());

    if (spirals.length === 0) {
        emptyMsg.classList.remove('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        spirals.forEach(item => {
            container.appendChild(makeChip(item, null));
        });
    }
}

function makeChip(item, fromGroupId) {
    const el = document.createElement('div');
    el.className = 'item-chip bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1';
    el.draggable = true;
    el.dataset.itemId = item.id;
    el.dataset.fromGroup = fromGroupId || '';
    el.innerHTML = `<span>${item.name}</span><span class="text-slate-400">(${item.selling_price})</span>`;

    el.addEventListener('dragstart', e => {
        dragItem = { item, fromGroupId };
        e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => { dragItem = null; });
    return el;
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────────────────────────────────────
function renderGroups() {
    const container = document.getElementById('groups-container');
    const noMsg = document.getElementById('no-groups-msg');
    if (groups.length === 0) {
        noMsg.classList.remove('hidden');
        container.innerHTML = '<div class="text-center py-8 text-slate-400 text-sm" id="no-groups-msg">No groups yet. Click "+ Add Group" to create one.</div>';
        return;
    }
    container.innerHTML = groups.map((g, idx) => `
        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3" id="group-${g.id}">
            <div class="flex items-center gap-2 mb-2">
                <input type="text" value="${g.name}" onchange="renameGroup('${g.id}', this.value)"
                    class="flex-1 text-sm font-bold border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-400 outline-none bg-white">
                <label class="flex items-center gap-1 text-xs text-slate-500 cursor-pointer" title="No ring deducted, only covers">
                    <input type="checkbox" ${g.noStock ? 'checked' : ''} onchange="toggleNoStock('${g.id}', this.checked)" class="rounded">
                    No ring deducted
                </label>
                <button onclick="removeGroup('${g.id}')" class="text-red-400 hover:text-red-600 font-black text-base leading-none px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors" title="Remove group">×</button>
            </div>
            <div class="min-h-12 bg-white rounded border border-dashed border-slate-300 p-2 flex flex-wrap gap-1.5 content-start group-drop-zone"
                data-group-id="${g.id}"
                ondragover="event.preventDefault(); this.classList.add('drag-over')"
                ondragleave="this.classList.remove('drag-over')"
                ondrop="dropToGroup(event, '${g.id}')">
                ${g.items.length === 0 ? '<span class="text-xs text-slate-300 italic">Drop spirals here</span>' : ''}
                ${g.items.map(item => `
                    <div class="item-chip bg-blue-50 text-slate-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1"
                        draggable="true" data-item-id="${item.id}" data-from-group="${g.id}"
                        ondragstart="dragItem = {item: {id:'${item.id}', name:'${item.name}', selling_price:${item.selling_price}}, fromGroupId:'${g.id}'}; event.dataTransfer.effectAllowed='move'">
                        <span>${item.name}</span><span class="text-slate-400">(${item.selling_price})</span>
                        <button onclick="removeFromGroup('${g.id}','${item.id}')" class="ml-1 text-slate-400 hover:text-red-500 font-black leading-none">×</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderAll() {
    renderGroups();
    renderPool();
}

window.addGroup = function() {
    const id = 'grp_' + Date.now();
    groups.push({ id, name: 'New Group', items: [], noStock: false });
    renderAll();
};

window.removeGroup = function(groupId) {
    const g = groups.find(g => g.id === groupId);
    if (g) groups = groups.filter(x => x.id !== groupId);
    renderAll();
};

window.renameGroup = function(groupId, newName) {
    const g = groups.find(g => g.id === groupId);
    if (g) g.name = newName;
};

window.toggleNoStock = function(groupId, val) {
    const g = groups.find(g => g.id === groupId);
    if (g) g.noStock = val;
};

window.removeFromGroup = function(groupId, itemId) {
    const g = groups.find(g => g.id === groupId);
    if (g) g.items = g.items.filter(i => i.id !== itemId);
    renderAll();
};

// ─────────────────────────────────────────────────────────────────────────────
// DRAG & DROP
// ─────────────────────────────────────────────────────────────────────────────
window.dropToGroup = function(event, targetGroupId) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (!dragItem) return;

    const { item, fromGroupId } = dragItem;

    // Remove from old group if any
    if (fromGroupId) {
        const og = groups.find(g => g.id === fromGroupId);
        if (og) og.items = og.items.filter(i => i.id !== item.id);
    }

    // Add to new group if not already there
    const tg = groups.find(g => g.id === targetGroupId);
    if (tg && !tg.items.find(i => i.id === item.id)) {
        tg.items.push({ id: item.id, name: item.name, selling_price: item.selling_price });
    }

    dragItem = null;
    renderAll();
};

window.dropToPool = function(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (!dragItem) return;
    const { item, fromGroupId } = dragItem;
    if (fromGroupId) {
        const og = groups.find(g => g.id === fromGroupId);
        if (og) og.items = og.items.filter(i => i.id !== item.id);
    }
    dragItem = null;
    renderAll();
};

// ─────────────────────────────────────────────────────────────────────────────
// LINKED RESOURCES
// ─────────────────────────────────────────────────────────────────────────────
function renderLinkedResources() {
    const list = document.getElementById('linked-resources-list');
    if (linkedResources.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-400 italic">No linked resources. Add some below.</p>';
        return;
    }
    list.innerHTML = linkedResources.map(r => `
        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span class="text-sm font-bold text-slate-700">${r.name}</span>
            <button onclick="removeLinkedResource('${r.id}')" class="text-red-400 hover:text-red-600 font-black text-base leading-none px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors" title="Remove">×</button>
        </div>
    `).join('');
}

function renderLinkedSelect() {
    const sel = document.getElementById('linked-add-select');
    const existingIds = new Set(linkedResources.map(r => r.id));
    sel.innerHTML = allInventory
        .filter(i => !existingIds.has(i.id) && !i.name.toLowerCase().includes('spiral'))
        .map(i => `<option value="${i.id}">${i.name}</option>`).join('');
}

window.addLinkedResource = function() {
    const sel = document.getElementById('linked-add-select');
    const item = allInventory.find(i => i.id === sel.value);
    if (!item) return;
    if (linkedResources.find(r => r.id === item.id)) return;
    linkedResources.push({ id: item.id, name: item.name });
    renderLinkedResources();
    renderLinkedSelect();
};

window.removeLinkedResource = function(id) {
    linkedResources = linkedResources.filter(r => r.id !== id);
    renderLinkedResources();
    renderLinkedSelect();
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
window.saveBindingGroups = async function() {
    const btn = document.getElementById('btn-save-binding');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        await supabase.from('settings').upsert([{ key: 'binding_groups', value: JSON.stringify(groups) }], { onConflict: 'key' });
        btn.textContent = '✅ Saved!';
        setTimeout(() => { btn.textContent = '💾 Save Binding Groups'; btn.disabled = false; }, 2000);
    } catch(e) {
        alert('Error saving: ' + e.message);
        btn.textContent = '💾 Save Binding Groups'; btn.disabled = false;
    }
};

window.saveTapeSetting = async function() {
    const val = document.getElementById('chk-show-tape').checked;
    await supabase.from('settings').upsert([{ key: 'binding_show_tape', value: String(val) }], { onConflict: 'key' });
    alert('Tape setting saved!');
};

window.saveLinkedResources = async function() {
    await supabase.from('settings').upsert([{ key: 'binding_linked_resources', value: JSON.stringify(linkedResources) }], { onConflict: 'key' });
    alert('Linked resources saved!');
};

init();
