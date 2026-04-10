/**
 * pcb.js — Live PCB Diagram for the CPU Visualizer
 */

// ─── Layout constants ─────────────────────────────────────────────────────────
const COMPS = {
    pc:      { x:20,  y:20,  w:115, h:65, label:'PROG CTR',  sub:'PC',         id:'comp-pc'  },
    progmem: { x:190, y:20,  w:155, h:65, label:'PROG MEM',  sub:'FLASH ROM',  id:'comp-pm'  },
    instreg: { x:400, y:20,  w:155, h:65, label:'INST REG',  sub:'IR',         id:'comp-ir'  },
    ctrl:    { x:400, y:165, w:155, h:80, label:'CONTROL',   sub:'UNIT',       id:'comp-cu'  },
    alu:     { x:440, y:320, w:150, h:80, label:'ALU',       sub:'ARITH LOGIC',id:'comp-alu' },
    regfile: { x:215, y:320, w:170, h:80, label:'REG FILE',  sub:'R0 | R1',    id:'comp-rf'  },
    datamem: { x:20,  y:320, w:155, h:80, label:'DATA MEM',  sub:'RAM 256B',   id:'comp-dm'  },
};

const TRACES = {
    addr:    { d:'M 135,52 H 190',                    label:'ADDR BUS'   },
    fetch:   { d:'M 345,52 H 400',                    label:'FETCH BUS'  },
    decode:  { d:'M 477,85 V 165',                    label:'DECODE'     },
    branch:  { d:'M 445,165 V 125 H 77 V 85',         label:'BRANCH/JMP' },
    regctrl: { d:'M 400,205 H 302 V 320',             label:'REG CTRL'   },
    aluctrl: { d:'M 555,200 H 590 V 345 H 590',       label:'ALU CTRL'   },
    op_a:    { d:'M 385,340 H 440',                   label:'OPERAND'    },
    result:  { d:'M 440,360 H 385',                   label:'RESULT'     },
    store:   { d:'M 215,340 H 175',                   label:'STORE'      },
    load:    { d:'M 175,360 H 215',                   label:'LOAD'       },
};

// Which traces light up for each opcode
const OP_TRACES = {
    0x00: ['addr','fetch'],
    0x01: ['addr','fetch','decode','regctrl'],
    0x02: ['addr','fetch','decode','regctrl'],
    0x03: ['addr','fetch','decode','regctrl'],
    0x04: ['addr','fetch','decode','regctrl'],
    0x10: ['addr','fetch','decode','regctrl','op_a','aluctrl','result'],
    0x11: ['addr','fetch','decode','regctrl','op_a','aluctrl','result'],
    0x12: ['addr','fetch','decode','regctrl','op_a','aluctrl','result'],
    0x20: ['addr','fetch','decode','regctrl','load'],
    0x21: ['addr','fetch','decode','regctrl','store'],
    0x22: ['addr','fetch','decode','regctrl','load'],
    0x23: ['addr','fetch','decode','regctrl','store'],
    0x30: ['addr','fetch','decode','branch'],
    0x31: ['addr','fetch','decode','branch'],
    0x32: ['addr','fetch','decode','branch'],
    0xFF: [],
};

const ISA_TABLE = [
    { op:'NOP',         code:'0x00', hasArg:false, desc:'No operation'              },
    { op:'LOAD_R0 n',   code:'0x01', hasArg:true,  desc:'R0 ← immediate n'         },
    { op:'LOAD_R1 n',   code:'0x02', hasArg:true,  desc:'R1 ← immediate n'         },
    { op:'MOV_R0_R1',   code:'0x03', hasArg:false, desc:'R1 ← R0'                  },
    { op:'MOV_R1_R0',   code:'0x04', hasArg:false, desc:'R0 ← R1'                  },
    { op:'ADD_R0_IMM n',code:'0x10', hasArg:true,  desc:'R0 ← R0 + n'              },
    { op:'ADD_R0_R1',   code:'0x11', hasArg:false, desc:'R0 ← R0 + R1'             },
    { op:'SUB_R0_IMM n',code:'0x12', hasArg:true,  desc:'R0 ← R0 − n'              },
    { op:'LOADM_R0 a',  code:'0x20', hasArg:true,  desc:'R0 ← mem[a]'              },
    { op:'STORE_R0 a',  code:'0x21', hasArg:true,  desc:'mem[a] ← R0'              },
    { op:'LOADM_R1 a',  code:'0x22', hasArg:true,  desc:'R1 ← mem[a]'              },
    { op:'STORE_R1 a',  code:'0x23', hasArg:true,  desc:'mem[a] ← R1'              },
    { op:'JMP a',       code:'0x30', hasArg:true,  desc:'PC ← a (unconditional)'   },
    { op:'JZ a',        code:'0x31', hasArg:true,  desc:'if R0=0: PC ← a'          },
    { op:'JNZ a',       code:'0x32', hasArg:true,  desc:'if R0≠0: PC ← a'          },
    { op:'HALT',        code:'0xFF', hasArg:false, desc:'Stop execution'            },
];

// ─── Build ────────────────────────────────────────────────────────────────────
function buildPCB() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    // No viewBox – we handle transforms manually for zoom/pan
    svg.setAttribute('id', 'pcb-svg');
    svg.setAttribute('class', 'pcb-svg');
    svg.style.width  = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
    svg.style.cursor = 'grab';

    // Defs: arrowhead + filters
    svg.innerHTML = `
    <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#4a3a18"/>
        </marker>
        <marker id="arr-active" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#f0b030"/>
        </marker>
        <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-strong">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <pattern id="pcb-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.8" fill="#1a3a1a"/>
        </pattern>
    </defs>
    `;

    // Infinite board background (very large rect, panned with viewport group)
    const bg1 = document.createElementNS(svgNS, 'rect');
    bg1.setAttribute('x','-5000'); bg1.setAttribute('y','-5000');
    bg1.setAttribute('width','10640'); bg1.setAttribute('height','10430');
    bg1.setAttribute('fill','#0a170a');
    svg.appendChild(bg1);

    const bg2 = document.createElementNS(svgNS, 'rect');
    bg2.setAttribute('x','-5000'); bg2.setAttribute('y','-5000');
    bg2.setAttribute('width','10640'); bg2.setAttribute('height','10430');
    bg2.setAttribute('fill','url(#pcb-dots)');
    svg.appendChild(bg2);

    // ── Viewport group (all content lives here, we transform this) ──────────────
    const vp = document.createElementNS(svgNS, 'g');
    vp.setAttribute('id', 'pcb-vp');
    svg.appendChild(vp);

    // Board outline
    const outline = document.createElementNS(svgNS,'rect');
    outline.setAttribute('x','6'); outline.setAttribute('y','6');
    outline.setAttribute('width','628'); outline.setAttribute('height','418');
    outline.setAttribute('rx','4'); outline.setAttribute('fill','none');
    outline.setAttribute('stroke','#1a3a1a'); outline.setAttribute('stroke-width','1.5');
    vp.appendChild(outline);

    // Draw traces
    for (const [key, t] of Object.entries(TRACES)) {
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', t.d);
        path.setAttribute('class', 'pcb-trace');
        path.setAttribute('id', 'trace-' + key);
        path.setAttribute('marker-end', 'url(#arr)');
        vp.appendChild(path);
    }

    // Vias
    const vias = [[135,52],[345,52],[477,85],[445,165],[400,205],[555,200],[385,340],[385,360],[215,340],[175,360]];
    for (const [cx,cy] of vias) {
        const c = document.createElementNS(svgNS,'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', cy);
        c.setAttribute('r','3'); c.setAttribute('class','pcb-via');
        vp.appendChild(c);
    }

    // Components
    for (const [key, c] of Object.entries(COMPS)) {
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('id', c.id);
        g.setAttribute('class', 'pcb-comp');

        const pad = document.createElementNS(svgNS,'rect');
        pad.setAttribute('x', c.x-2); pad.setAttribute('y', c.y-2);
        pad.setAttribute('width', c.w+4); pad.setAttribute('height', c.h+4);
        pad.setAttribute('rx','3'); pad.setAttribute('class','comp-pad');
        g.appendChild(pad);

        const body = document.createElementNS(svgNS,'rect');
        body.setAttribute('x', c.x); body.setAttribute('y', c.y);
        body.setAttribute('width', c.w); body.setAttribute('height', c.h);
        body.setAttribute('rx','2'); body.setAttribute('class','comp-body');
        g.appendChild(body);

        const cx2 = c.x + c.w/2;
        const notch = document.createElementNS(svgNS,'path');
        notch.setAttribute('d', `M ${cx2-6},${c.y} Q ${cx2},${c.y-5} ${cx2+6},${c.y}`);
        notch.setAttribute('class','comp-notch');
        g.appendChild(notch);

        for (let i=0; i<3; i++) {
            const py = c.y + 14 + i*16;
            ['left','right'].forEach(side => {
                const pin = document.createElementNS(svgNS,'rect');
                pin.setAttribute('x', side==='left' ? c.x-6 : c.x+c.w);
                pin.setAttribute('y', py); pin.setAttribute('width','6'); pin.setAttribute('height','5');
                pin.setAttribute('class','comp-pin');
                g.appendChild(pin);
            });
        }

        const lbl = document.createElementNS(svgNS,'text');
        lbl.setAttribute('x', c.x + c.w/2); lbl.setAttribute('y', c.y + 22);
        lbl.setAttribute('class','comp-label'); lbl.textContent = c.label;
        g.appendChild(lbl);

        const sub = document.createElementNS(svgNS,'text');
        sub.setAttribute('x', c.x + c.w/2); sub.setAttribute('y', c.y + 36);
        sub.setAttribute('class','comp-sub'); sub.textContent = c.sub;
        g.appendChild(sub);

        const val = document.createElementNS(svgNS,'text');
        val.setAttribute('x', c.x + c.w/2); val.setAttribute('y', c.y + 54);
        val.setAttribute('class','comp-val'); val.setAttribute('id', c.id + '-val');
        val.textContent = '——';
        g.appendChild(val);

        vp.appendChild(g);
    }

    // Board label
    const brd = document.createElementNS(svgNS,'text');
    brd.setAttribute('x','10'); brd.setAttribute('y','422');
    brd.setAttribute('class','board-label');
    brd.textContent = '8-BIT RISC CPU  REV 1.0  © CPU-SIM';
    vp.appendChild(brd);

    const wrap = document.getElementById('pcb-svg-wrap');
    wrap.appendChild(svg);

    // Fit and enable canvas controls after first render
    requestAnimationFrame(() => {
        fitPCB();
        initCanvasControls(svg);
    });
}



// ─── Update (called after every CPU step) ────────────────────────────────────
let _activeTraceTimer = null;

function updatePCB(r0, r1, pc, halted, lastOpcode, lastOperand) {
    if (!document.getElementById('pcb-svg')) return;

    const h = n => '0x' + n.toString(16).padStart(2,'0').toUpperCase();

    // Component live values
    const vals = {
        'comp-pc-val':  h(pc),
        'comp-pm-val':  `@${h(pc)}`,
        'comp-ir-val':  lastOpname(lastOpcode, lastOperand),
        'comp-cu-val':  opmodeLabel(lastOpcode),
        'comp-alu-val': aluLabel(lastOpcode),
        'comp-rf-val':  `R0=${r0}  R1=${r1}`,
        'comp-dm-val':  halted ? 'HALTED' : 'ACTIVE',
    };
    for (const [id, txt] of Object.entries(vals)) {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    }

    // Highlight active component
    document.querySelectorAll('.pcb-comp').forEach(g => g.classList.remove('pcb-comp-active'));
    const activeComp = compForOpcode(lastOpcode);
    activeComp.forEach(id => {
        const g = document.getElementById(id);
        if (g) g.classList.add('pcb-comp-active');
    });

    // Animate traces
    clearTimeout(_activeTraceTimer);
    document.querySelectorAll('.pcb-trace').forEach(p => p.classList.remove('trace-active'));
    document.querySelectorAll('.isa-row').forEach(r => r.classList.remove('isa-row-active'));

    const active = OP_TRACES[lastOpcode] || ['addr','fetch'];
    active.forEach(key => {
        const el = document.getElementById('trace-' + key);
        if (el) {
            el.classList.remove('trace-active');
            void el.offsetWidth; // reflow
            el.classList.add('trace-active');
        }
    });

    // Highlight opcode in ISA table
    const isaRow = document.querySelector(`.isa-row[data-op="${'0x' + lastOpcode.toString(16).padStart(2,'0').toUpperCase()}"]`);
    if (isaRow) {
        isaRow.classList.add('isa-row-active');
        isaRow.scrollIntoView({ block:'nearest' });
    }

    _activeTraceTimer = setTimeout(() => {
        document.querySelectorAll('.pcb-trace').forEach(p => p.classList.remove('trace-active'));
        document.querySelectorAll('.pcb-comp').forEach(g => g.classList.remove('pcb-comp-active'));
    }, 900);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ISA_NAMES = {
    0x00:'NOP', 0x01:'LOAD_R0', 0x02:'LOAD_R1',
    0x03:'MOV R0→R1', 0x04:'MOV R1→R0',
    0x10:'ADD_R0_IMM', 0x11:'ADD_R0_R1', 0x12:'SUB_R0_IMM',
    0x20:'LOADM_R0', 0x21:'STORE_R0', 0x22:'LOADM_R1', 0x23:'STORE_R1',
    0x30:'JMP', 0x31:'JZ', 0x32:'JNZ', 0xFF:'HALT',
};

function lastOpname(op, arg) {
    const n = ISA_NAMES[op];
    if (!n) return '——';
    const hasArg = [0x01,0x02,0x10,0x12,0x20,0x21,0x22,0x23,0x30,0x31,0x32].includes(op);
    return hasArg ? `${n} ${arg}` : n;
}

function opmodeLabel(op) {
    if ([0x10,0x11,0x12].includes(op)) return 'ALU OP';
    if ([0x20,0x22].includes(op))       return 'MEM READ';
    if ([0x21,0x23].includes(op))       return 'MEM WRITE';
    if ([0x30,0x31,0x32].includes(op))  return 'BRANCH';
    if ([0x01,0x02].includes(op))       return 'IMM LOAD';
    if ([0x03,0x04].includes(op))       return 'REGMOV';
    if (op === 0xFF)                    return 'HALT';
    return 'IDLE';
}
function aluLabel(op) {
    if (op === 0x10 || op === 0x11) return 'ADD';
    if (op === 0x12)                return 'SUB';
    return '——';
}
function compForOpcode(op) {
    const always = ['comp-pc','comp-pm','comp-ir','comp-cu'];
    if ([0x10,0x11,0x12].includes(op)) return [...always,'comp-alu','comp-rf'];
    if ([0x20,0x22].includes(op))      return [...always,'comp-dm','comp-rf'];
    if ([0x21,0x23].includes(op))      return [...always,'comp-rf','comp-dm'];
    if ([0x30,0x31,0x32].includes(op)) return [...always];
    if ([0x01,0x02,0x03,0x04].includes(op)) return [...always,'comp-rf'];
    return always;
}

// ─── Canvas zoom / pan ───────────────────────────────────────────────────────
let _cam = { x: 0, y: 0, scale: 1 };  // current transform state
let _drag = null;                       // drag state: { startX, startY, camX, camY }

const BOARD_W = 640, BOARD_H = 430;
const MIN_SCALE = 0.2, MAX_SCALE = 8;

function applyTransform() {
    const vp = document.getElementById('pcb-vp');
    if (!vp) return;
    vp.setAttribute('transform', `translate(${_cam.x},${_cam.y}) scale(${_cam.scale})`);
    // Update zoom indicator
    const ind = document.getElementById('pcb-zoom-indicator');
    if (ind) ind.textContent = Math.round(_cam.scale * 100) + '%';
}

function fitPCB() {
    const wrap = document.getElementById('pcb-svg-wrap');
    const svg  = document.getElementById('pcb-svg');
    if (!wrap || !svg) return;
    const W = wrap.clientWidth  || 900;
    const H = wrap.clientHeight || 600;
    const padding = 40;
    const s = Math.min((W - padding*2) / BOARD_W, (H - padding*2) / BOARD_H);
    _cam.scale = s;
    _cam.x = (W - BOARD_W * s) / 2;
    _cam.y = (H - BOARD_H * s) / 2;
    applyTransform();
}

function initCanvasControls(svg) {
    const wrap = document.getElementById('pcb-svg-wrap');

    // ── Scroll to zoom ────────────────────────────────────────────────────────
    wrap.addEventListener('wheel', e => {
        e.preventDefault();
        const rect  = svg.getBoundingClientRect();
        const mx    = e.clientX - rect.left;   // mouse pos in SVG pixel space
        const my    = e.clientY - rect.top;
        const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, _cam.scale * delta));
        // Zoom toward cursor
        _cam.x = mx - (mx - _cam.x) * (newScale / _cam.scale);
        _cam.y = my - (my - _cam.y) * (newScale / _cam.scale);
        _cam.scale = newScale;
        applyTransform();
    }, { passive: false });

    // ── Drag to pan ───────────────────────────────────────────────────────────
    wrap.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        _drag = { startX: e.clientX, startY: e.clientY, camX: _cam.x, camY: _cam.y };
        svg.style.cursor = 'grabbing';
        e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
        if (!_drag) return;
        _cam.x = _drag.camX + (e.clientX - _drag.startX);
        _cam.y = _drag.camY + (e.clientY - _drag.startY);
        applyTransform();
    });
    window.addEventListener('mouseup', () => {
        _drag = null;
        if (svg) svg.style.cursor = 'grab';
    });

    // ── Double-click to fit ───────────────────────────────────────────────────
    wrap.addEventListener('dblclick', fitPCB);

    // ── Touch pinch-to-zoom ───────────────────────────────────────────────────
    let _lastDist = null;
    wrap.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            _lastDist = Math.hypot(dx, dy);
        }
    }, { passive: true });
    wrap.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && _lastDist) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const delta = dist / _lastDist;
            _lastDist = dist;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, _cam.scale * delta));
            _cam.scale = newScale;
            applyTransform();
        }
    }, { passive: false });
    wrap.addEventListener('touchend', () => { _lastDist = null; });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
window.buildPCB  = buildPCB;
window.updatePCB = updatePCB;
window.fitPCB    = fitPCB;
// Legacy alias (toolbar onclick still calls switchTab directly)
window.togglePCB = () => window.switchTab && window.switchTab('pcb');
