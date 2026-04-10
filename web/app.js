/**
 * app.js — CPU WASM Visualizer
 * Drives all interactivity after the WASM module is loaded.
 */

// ─── ISA lookup (mirrors cpu.h / instructionset.h) ──────────────────────────
const ISA = {
    0x00: { name: 'NOP',        hasOp: false },
    0x01: { name: 'LOAD_R0',    hasOp: true  },
    0x02: { name: 'LOAD_R1',    hasOp: true  },
    0x03: { name: 'MOV_R0→R1', hasOp: false },
    0x04: { name: 'MOV_R1→R0', hasOp: false },
    0x10: { name: 'ADD_R0_IMM', hasOp: true  },
    0x11: { name: 'ADD_R0_R1',  hasOp: false },
    0x12: { name: 'SUB_R0_IMM', hasOp: true  },
    0x20: { name: 'LOADM_R0',   hasOp: true  },
    0x21: { name: 'STORE_R0',   hasOp: true  },
    0x22: { name: 'LOADM_R1',   hasOp: true  },
    0x23: { name: 'STORE_R1',   hasOp: true  },
    0x30: { name: 'JMP',        hasOp: true  },
    0x31: { name: 'JZ',         hasOp: true  },
    0x32: { name: 'JNZ',        hasOp: true  },
    0xFF: { name: 'HALT',       hasOp: false },
};

// ─── State ───────────────────────────────────────────────────────────────────
let M         = null;   // WASM module
let running   = false;
let runTimer  = null;
let cycles    = 0;
let loaded    = false;
let curTab    = 'data';

// Shadow copies for change detection
let prev = { r0: null, r1: null, pc: null };
let prevMem  = new Uint8Array(256);
let prevInst = new Uint8Array(256).fill(0xFF);

// DOM refs (populated in init)
let elEditor, elAssembleBtn, elStepBtn, elRunBtn, elResetBtn;
let elSpeedSlider, elSpeedValue, elCycles, elHeaderPc, elStatusBadge;
let elDataGrid, elInstGrid, elInstWrap;
let elDisasm, elExecLog, elMsgBar, elMsgText, elMsgIcon;
let elLineCount, elByteCount;

// ─── Boot ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    setLoadingProgress(20, 'Parsing WASM binary…');
    CPUModule().then(module => {
        M = module;
        setLoadingProgress(80, 'Initializing CPU…');
        M._cpu_init();
        setLoadingProgress(100, 'Ready!');
        setTimeout(showApp, 400);
    }).catch(err => {
        document.getElementById('loading-status').textContent = 'Error: ' + err.message;
        console.error(err);
    });
});

function setLoadingProgress(pct, msg) {
    document.getElementById('loading-bar').style.width = pct + '%';
    document.getElementById('loading-status').textContent = msg;
}

function showApp() {
    document.getElementById('loading-screen').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');
        initDOM();
        buildGrids();
        buildColHeader();
        updateDisplay();
        // Wire editor line counter
        elEditor.addEventListener('input', updateEditorMeta);
        updateEditorMeta();
    }, 500);
}

function initDOM() {
    elEditor       = document.getElementById('editor');
    elAssembleBtn  = document.getElementById('assemble-btn');
    elStepBtn      = document.getElementById('step-btn');
    elRunBtn       = document.getElementById('run-btn');
    elResetBtn     = document.getElementById('reset-btn');
    elSpeedSlider  = document.getElementById('speed-slider');
    elSpeedValue   = document.getElementById('speed-value');
    elCycles       = document.getElementById('cycle-counter');
    elHeaderPc     = document.getElementById('header-pc');
    elStatusBadge  = document.getElementById('status-badge');
    elDataGrid     = document.getElementById('data-grid');
    elInstGrid     = document.getElementById('inst-grid');
    elInstWrap     = document.getElementById('inst-wrap');
    elDisasm       = document.getElementById('disasm');
    elExecLog      = document.getElementById('exec-log');
    elMsgBar       = document.getElementById('message-bar');
    elMsgText      = document.getElementById('message-text');
    elMsgIcon      = document.getElementById('message-icon');
    elLineCount    = document.getElementById('line-count');
    elByteCount    = document.getElementById('byte-count');

    elAssembleBtn.addEventListener('click', assemble);
    elStepBtn.addEventListener('click',    singleStep);
    elRunBtn.addEventListener('click',     toggleRun);
    elResetBtn.addEventListener('click',   reset);
    elSpeedSlider.addEventListener('input', () => {
        elSpeedValue.textContent = elSpeedSlider.value + ' Hz';
        if (running) { clearInterval(runTimer); startRunLoop(); }
    });
}

// ─── Grid builders ───────────────────────────────────────────────────────────
function buildGrids() {
    ['data-grid','inst-grid'].forEach(id => {
        const grid = document.getElementById(id);
        const labels = document.getElementById('row-labels-' + (id === 'data-grid' ? 'data' : 'inst'));
        grid.innerHTML = '';
        if (labels) labels.innerHTML = '';

        for (let row = 0; row < 16; row++) {
            if (labels) {
                const lbl = document.createElement('div');
                lbl.className = 'grid-row-lbl';
                lbl.textContent = hex2(row * 16);
                labels.appendChild(lbl);
            }
            for (let col = 0; col < 16; col++) {
                const addr = row * 16 + col;
                const cell = document.createElement('div');
                cell.className = 'mem-cell';
                cell.id = id + '-' + addr;
                cell.textContent = '00';
                cell.title = '@' + hex2(addr);
                grid.appendChild(cell);
            }
        }
    });
}

function buildColHeader() {
    const hdr = document.getElementById('col-header');
    hdr.innerHTML = '';
    const corner = document.createElement('div');
    corner.className = 'grid-col-lbl';
    hdr.appendChild(corner);
    for (let i = 0; i < 16; i++) {
        const lbl = document.createElement('div');
        lbl.className = 'grid-col-lbl';
        lbl.textContent = i.toString(16).toUpperCase();
        hdr.appendChild(lbl);
    }
}

// ─── Assemble ────────────────────────────────────────────────────────────────
function assemble() {
    stopRun();
    const src = elEditor.value;

    // Allocate string in WASM heap
    const len = M.lengthBytesUTF8(src) + 1;
    const ptr = M._malloc(len);
    M.stringToUTF8(src, ptr, len);
    const result = M._cpu_assemble(ptr);
    M._free(ptr);

    if (result < 0) {
        const errPtr = M._cpu_get_error();
        showMessage('error', '✕  ' + M.UTF8ToString(errPtr));
        return;
    }

    // Load assembled bytes into CPU
    const bufPtr  = M._cpu_get_assembled_buf();
    const bytes   = M.HEAPU8.slice(bufPtr, bufPtr + result);
    const dataPtr = M._malloc(result);
    M.HEAPU8.set(bytes, dataPtr);
    M._cpu_load(dataPtr, result);
    M._free(dataPtr);

    cycles = 0;
    loaded = true;
    prev = { r0: null, r1: null, pc: null };
    prevMem.fill(0);
    prevInst.fill(0xFF);

    showMessage('success', `✓  Assembled ${result} bytes — program loaded`);
    elByteCount.textContent = result + ' bytes';
    elStepBtn.disabled  = false;
    elRunBtn.disabled   = false;
    elResetBtn.disabled = false;

    updateDisplay();
}

// ─── Execution ───────────────────────────────────────────────────────────────
function singleStep() {
    if (!loaded || M._cpu_is_halted()) return;
    doStep();
}

function doStep() {
    const opBefore = M._cpu_get_pc();
    M._cpu_step();
    cycles++;

    const opcode  = M._cpu_get_last_opcode();
    const operand = M._cpu_get_last_operand();
    addLogEntry(opcode, operand);
    updateDisplay();

    if (M._cpu_is_halted()) stopRun();
}

function toggleRun() {
    if (running) { stopRun(); return; }
    if (!loaded || M._cpu_is_halted()) return;
    running = true;
    elRunBtn.textContent = '⏸ PAUSE';
    elStepBtn.disabled   = true;
    startRunLoop();
}

function startRunLoop() {
    const hz = parseInt(elSpeedSlider.value);
    runTimer = setInterval(() => {
        if (M._cpu_is_halted()) { stopRun(); return; }
        doStep();
    }, 1000 / hz);
}

function stopRun() {
    if (runTimer) { clearInterval(runTimer); runTimer = null; }
    running = false;
    elRunBtn.textContent = '▶ RUN';
    if (loaded) elStepBtn.disabled = false;
}

function reset() {
    stopRun();
    M._cpu_reset();
    cycles = 0;
    prev = { r0: null, r1: null, pc: null };
    prevMem.fill(0);
    hideMessage();
    updateDisplay();
}

// ─── Display update ──────────────────────────────────────────────────────────
function updateDisplay() {
    const r0 = M._cpu_get_r0();
    const r1 = M._cpu_get_r1();
    const pc = M._cpu_get_pc();
    const halted = !!M._cpu_is_halted();

    updateReg('r0', r0, prev.r0, false);
    updateReg('r1', r1, prev.r1, false);
    updateReg('pc', pc, prev.pc, true);

    prev.r0 = r0; prev.r1 = r1; prev.pc = pc;

    // Header
    elCycles.textContent  = cycles;
    elHeaderPc.textContent = '0x' + hex2(pc);

    // Status badge
    elStatusBadge.className = 'status-badge ' + (loaded ? (halted ? 'halted' : 'running') : 'ready');
    elStatusBadge.textContent = loaded ? (halted ? '● HALTED' : '● RUNNING') : '● READY';

    updateMemGrids(pc);
    updateDisassembly(pc);
}

function updateReg(name, val, prevVal, isPc) {
    const changed = (prevVal !== null && val !== prevVal);
    const card = document.getElementById('card-' + name);
    document.getElementById(name + '-hex').textContent = '0x' + hex2(val);
    document.getElementById(name + '-dec').textContent = val;
    document.getElementById(name + '-bits').textContent = val.toString(2).padStart(8, '0');
    document.getElementById(name + '-bar').style.width = (val / 255 * 100).toFixed(1) + '%';

    if (changed) {
        card.classList.remove('changed');
        void card.offsetWidth; // reflow to restart animation
        card.classList.add('changed');
        setTimeout(() => card.classList.remove('changed'), 500);
    }
}

// ─── Memory grids ────────────────────────────────────────────────────────────
function updateMemGrids(pc) {
    // Snapshot both memory arrays
    const memPtr  = M._malloc(256);
    const instPtr = M._malloc(256);
    M._cpu_snapshot_mem(memPtr);
    M._cpu_snapshot_inst(instPtr);
    const mem  = M.HEAPU8.slice(memPtr, memPtr + 256);
    const inst = M.HEAPU8.slice(instPtr, instPtr + 256);
    M._free(memPtr);
    M._free(instPtr);

    // Data grid
    for (let addr = 0; addr < 256; addr++) {
        const cell = document.getElementById('data-grid-' + addr);
        if (!cell) continue;
        const val = mem[addr];
        cell.textContent = hex2(val);

        const wasWritten = val !== prevMem[addr];
        cell.className = 'mem-cell';
        if (val !== 0)   cell.classList.add('nonzero');
        if (wasWritten)  { cell.classList.add('written'); flashCell(cell); }
    }
    prevMem.set(mem);

    // Instruction grid
    for (let addr = 0; addr < 256; addr++) {
        const cell = document.getElementById('inst-grid-' + addr);
        if (!cell) continue;
        const val = inst[addr];
        cell.textContent = hex2(val);

        cell.className = 'mem-cell';
        if (val !== 0xFF)               cell.classList.add('nonzero');
        if (addr === pc)                cell.classList.add('pc-here');
        else if (addr % 2 === 0 && val !== 0xFF) cell.classList.add('opcode');
    }
    prevInst.set(inst);
}

function flashCell(cell) {
    cell.classList.remove('flash-write');
    void cell.offsetWidth;
    cell.classList.add('flash-write');
    setTimeout(() => cell.classList.remove('flash-write'), 600);
}

// ─── Disassembly ─────────────────────────────────────────────────────────────
function updateDisassembly(pc) {
    if (!loaded) return;

    const instPtr = M._malloc(256);
    M._cpu_snapshot_inst(instPtr);
    const inst = M.HEAPU8.slice(instPtr, instPtr + 256);
    M._free(instPtr);

    const rows = [];
    for (let addr = 0; addr < 256; addr += 2) {
        const op  = inst[addr];
        const arg = inst[addr + 1];
        if (op === 0xFF && arg === 0xFF) break; // unloaded region
        const info = ISA[op] || { name: `???  0x${hex2(op)}`, hasOp: false };
        rows.push({ addr, op, arg, info });
        if (op === 0xFF) break; // HALT
    }

    if (rows.length === 0) {
        elDisasm.innerHTML = '<div class="disasm-empty">No program loaded</div>';
        return;
    }

    elDisasm.innerHTML = rows.map(r => {
        const isActive = r.addr === pc;
        const arg = r.info.hasOp ? `<span class="disasm-arg">${r.arg}</span>` : '';
        const arrow = isActive ? '<span class="disasm-arrow">▶</span>' : '';
        return `<div class="disasm-row ${isActive ? 'active' : ''}">
            ${arrow}
            <span class="disasm-addr">${hex2(r.addr)}</span>
            <span class="disasm-op">${r.info.name}</span>
            ${arg}
        </div>`;
    }).join('');

    // Scroll active row into view
    const activeEl = elDisasm.querySelector('.disasm-row.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

// ─── Execution log ────────────────────────────────────────────────────────────
function addLogEntry(opcode, operand) {
    const info = ISA[opcode] || { name: `0x${hex2(opcode)}`, hasOp: false };
    const arg  = info.hasOp ? ` ${operand}` : '';

    // Remove empty placeholder
    const empty = elExecLog.querySelector('.log-empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
        <span class="log-cycle">#${cycles}</span>
        <span class="log-op">${info.name}${arg}</span>
        <span class="log-info">R0=${M._cpu_get_r0()} R1=${M._cpu_get_r1()} PC=${M._cpu_get_pc()}</span>
    `;
    elExecLog.appendChild(row);

    // Keep last 120 entries
    while (elExecLog.children.length > 120) elExecLog.removeChild(elExecLog.firstChild);
    elExecLog.scrollTop = elExecLog.scrollHeight;
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
    curTab = tab;
    const isInst = tab === 'inst';
    document.getElementById('tab-data').classList.toggle('active', !isInst);
    document.getElementById('tab-inst').classList.toggle('active', isInst);
    document.getElementById('data-wrap').classList.toggle('hidden', isInst);
    elInstWrap.classList.toggle('hidden', !isInst);
    document.getElementById('legend-pc').style.display = isInst ? '' : 'none';
}

// ─── Editor meta ─────────────────────────────────────────────────────────────
function updateEditorMeta() {
    const lines = elEditor.value.split('\n').length;
    elLineCount.textContent = lines + ' line' + (lines === 1 ? '' : 's');
}

// ─── Message helpers ──────────────────────────────────────────────────────────
function showMessage(type, text) {
    elMsgBar.className = 'message-bar ' + type;
    elMsgText.textContent = text;
}
function hideMessage() {
    elMsgBar.className = 'message-bar hidden';
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function hex2(n) { return n.toString(16).padStart(2, '0').toUpperCase(); }

// Expose tab switch globally (called from HTML onclick)
window.switchTab   = switchTab;
window.hideMessage = hideMessage;
