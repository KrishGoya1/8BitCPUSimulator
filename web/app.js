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
    0x13: { name: 'SUB_R0_R1',  hasOp: false },
    0x20: { name: 'LOADM_R0',   hasOp: true  },
    0x21: { name: 'STORE_R0',   hasOp: true  },
    0x22: { name: 'LOADM_R1',   hasOp: true  },
    0x23: { name: 'STORE_R1',   hasOp: true  },
    0x24: { name: 'LOADIND_R0_R1', hasOp: false },
    0x25: { name: 'STOREIND_R0_R1', hasOp: false },
    0x30: { name: 'JMP',        hasOp: true  },
    0x31: { name: 'JZ',         hasOp: true  },
    0x32: { name: 'JNZ',        hasOp: true  },
    0x33: { name: 'JGE_R0_R1',  hasOp: true  },
    0xFF: { name: 'HALT',       hasOp: false },
};

// ─── IO State ────────────────────────────────────────────────────────────────
let sysLastKey = 100;
document.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W') sysLastKey = 0x77;
    else if (e.key === 'a' || e.key === 'A') sysLastKey = 0x61;
    else if (e.key === 's' || e.key === 'S') sysLastKey = 0x73;
    else if (e.key === 'd' || e.key === 'D') sysLastKey = 0x64;
});

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
        // Build PCB eagerly — it's always visible now
        buildPCB();
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
                cell.className = 'mem-cell heat-0';
                cell.id = id + '-' + addr;
                cell.textContent = '00';
                cell.title = '@' + hex2(addr) + ' = 0x00';
                grid.appendChild(cell);
            }
        }
    });
}

function buildColHeader() {
    ['col-header-data', 'col-header-inst'].forEach(id => {
        const hdr = document.getElementById(id);
        if (!hdr) return;
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
    });
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
    setButtonsEnabled(true);
    updateDisplay();
}

// ─── Execution ───────────────────────────────────────────────────────────────
function singleStep() {
    if (!loaded || M._cpu_is_halted()) return;
    doStep();
}

function doStep() {
    // Inject IO state right before execution step
    if (M._cpu_set_mem) {
        M._cpu_set_mem(255, sysLastKey); 
        M._cpu_set_mem(254, Math.floor(Math.random() * 256));
    }

    const opBefore = M._cpu_get_pc();
    M._cpu_step();
    cycles++;

    const opcode  = M._cpu_get_last_opcode();
    const operand = M._cpu_get_last_operand();
    addLogEntry(opcode, operand);
    updateDisplay();
    if (typeof updatePCB === 'function')
        updatePCB(M._cpu_get_r0(), M._cpu_get_r1(), M._cpu_get_pc(), !!M._cpu_is_halted(), opcode, operand);

    if (M._cpu_is_halted()) stopRun();
}

function toggleRun() {
    if (running) { stopRun(); return; }
    if (!loaded || M._cpu_is_halted()) return;
    running = true;
    elRunBtn.textContent = '⏸ PAUSE';
    elStepBtn.disabled = true;
    startRunLoop();
}

function startRunLoop() {
    const hz = parseInt(elSpeedSlider.value);
    
    // Calculate optimal interval and operations per interval
    // Browsers cap minimum setInterval to ~4ms, so frame time shouldn't drop below 16ms for stability
    let interval = Math.max(16, 1000 / hz); 
    let opsPerTick = Math.max(1, Math.round(hz / (1000 / interval)));

    runTimer = setInterval(() => {
        for (let i = 0; i < opsPerTick; i++) {
            if (M._cpu_is_halted()) { stopRun(); return; }
            doStep();
        }
    }, interval);
}

function stopRun() {
    if (runTimer) { clearInterval(runTimer); runTimer = null; }
    running = false;
    elRunBtn.textContent = '▶ RUN';
    if (loaded) setButtonsEnabled(true);
}

function setButtonsEnabled(on) {
    elStepBtn.disabled  = !on;
    elRunBtn.disabled   = !on;
    elResetBtn.disabled = !on;
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
        
        let heat = 0;
        if (val > 0) heat = Math.min(4, Math.floor(val / 64) + 1);

        cell.className = 'mem-cell heat-' + heat;
        cell.title = '@' + hex2(addr) + ' = 0x' + hex2(val);

        const wasWritten = val !== prevMem[addr];
        if (wasWritten) { flashCell(cell); }
    }
    prevMem.set(mem);

    // Instruction grid
    for (let addr = 0; addr < 256; addr++) {
        const cell = document.getElementById('inst-grid-' + addr);
        if (!cell) continue;
        const val = inst[addr];

        let heat = 0;
        // 0xFF means empty in instruction memory
        if (val !== 0xFF) heat = 4;

        cell.className = 'mem-cell heat-' + heat;
        cell.title = '@' + hex2(addr) + ' = 0x' + hex2(val);

        if (addr === pc) cell.classList.add('pc-here');
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

// Tab switching removed: DATA and PROGRAM are horizontally stacked.

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

window.hideMessage = hideMessage;

