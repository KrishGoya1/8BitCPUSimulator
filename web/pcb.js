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
    const modal = document.getElementById('pcb-modal');
    if (!modal) return;

    // Build SVG
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 640 430');
    svg.setAttribute('id', 'pcb-svg');
    svg.setAttribute('class', 'pcb-svg');

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
        <!-- PCB dot grid pattern -->
        <pattern id="pcb-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.8" fill="#1a3a1a"/>
        </pattern>
    </defs>
    <!-- Board background -->
    <rect width="640" height="430" fill="#0a170a"/>
    <rect width="640" height="430" fill="url(#pcb-dots)"/>
    <!-- Board edge chamfer -->
    <rect x="6" y="6" width="628" height="418" rx="4" fill="none" stroke="#1a3a1a" stroke-width="1.5"/>
    `;

    // Draw traces (base layer, dim copper)
    for (const [key, t] of Object.entries(TRACES)) {
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', t.d);
        path.setAttribute('class', 'pcb-trace');
        path.setAttribute('id', 'trace-' + key);
        path.setAttribute('marker-end', 'url(#arr)');
        svg.appendChild(path);
    }

    // Draw vias (small circles at trace junctions)
    const vias = [[135,52],[345,52],[477,85],[445,165],[400,205],[555,200],[385,340],[385,360],[215,340],[175,360]];
    for (const [cx,cy] of vias) {
        const c = document.createElementNS(svgNS,'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', cy);
        c.setAttribute('r','3'); c.setAttribute('class','pcb-via');
        svg.appendChild(c);
    }

    // Draw components
    for (const [key, c] of Object.entries(COMPS)) {
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('id', c.id);
        g.setAttribute('class', 'pcb-comp');

        // Shadow pad
        const pad = document.createElementNS(svgNS,'rect');
        pad.setAttribute('x', c.x-2); pad.setAttribute('y', c.y-2);
        pad.setAttribute('width', c.w+4); pad.setAttribute('height', c.h+4);
        pad.setAttribute('rx','3'); pad.setAttribute('class','comp-pad');
        g.appendChild(pad);

        // IC body
        const body = document.createElementNS(svgNS,'rect');
        body.setAttribute('x', c.x); body.setAttribute('y', c.y);
        body.setAttribute('width', c.w); body.setAttribute('height', c.h);
        body.setAttribute('rx','2'); body.setAttribute('class','comp-body');
        g.appendChild(body);

        // IC notch (orientation mark)
        const cx2 = c.x + c.w/2;
        const notch = document.createElementNS(svgNS,'path');
        notch.setAttribute('d', `M ${cx2-6},${c.y} Q ${cx2},${c.y-5} ${cx2+6},${c.y}`);
        notch.setAttribute('class','comp-notch');
        g.appendChild(notch);

        // Pins (left side)
        for (let i=0; i<3; i++) {
            const py = c.y + 14 + i*16;
            const pin = document.createElementNS(svgNS,'rect');
            pin.setAttribute('x', c.x-6); pin.setAttribute('y', py);
            pin.setAttribute('width','6'); pin.setAttribute('height','5');
            pin.setAttribute('class','comp-pin');
            g.appendChild(pin);
        }
        // Pins (right side)
        for (let i=0; i<3; i++) {
            const py = c.y + 14 + i*16;
            const pin = document.createElementNS(svgNS,'rect');
            pin.setAttribute('x', c.x+c.w); pin.setAttribute('y', py);
            pin.setAttribute('width','6'); pin.setAttribute('height','5');
            pin.setAttribute('class','comp-pin');
            g.appendChild(pin);
        }

        // Labels
        const lbl = document.createElementNS(svgNS,'text');
        lbl.setAttribute('x', c.x + c.w/2); lbl.setAttribute('y', c.y + 22);
        lbl.setAttribute('class','comp-label'); lbl.textContent = c.label;
        g.appendChild(lbl);

        const sub = document.createElementNS(svgNS,'text');
        sub.setAttribute('x', c.x + c.w/2); sub.setAttribute('y', c.y + 36);
        sub.setAttribute('class','comp-sub'); sub.textContent = c.sub;
        g.appendChild(sub);

        // Value text (updated live)
        const val = document.createElementNS(svgNS,'text');
        val.setAttribute('x', c.x + c.w/2); val.setAttribute('y', c.y + 54);
        val.setAttribute('class','comp-val'); val.setAttribute('id', c.id + '-val');
        val.textContent = '——';
        g.appendChild(val);

        svg.appendChild(g);
    }

    // Board label
    const brd = document.createElementNS(svgNS,'text');
    brd.setAttribute('x','10'); brd.setAttribute('y','422');
    brd.setAttribute('class','board-label');
    brd.textContent = '8-BIT RISC CPU  REV 1.0  © CPU-SIM';
    svg.appendChild(brd);

    document.getElementById('pcb-svg-wrap').appendChild(svg);

    // Build ISA table
    const tbody = document.getElementById('isa-tbody');
    tbody.innerHTML = ISA_TABLE.map(r => `
        <tr class="isa-row" data-op="${r.code}">
            <td class="isa-op">${r.op}</td>
            <td class="isa-code">${r.code}</td>
            <td class="isa-desc">${r.desc}</td>
        </tr>`).join('');
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

// ─── Toggle ───────────────────────────────────────────────────────────────────
let _pcbBuilt = false;
function togglePCB() {
    const modal = document.getElementById('pcb-modal');
    const isOpen = !modal.classList.contains('hidden');
    if (isOpen) {
        modal.classList.add('hidden');
        document.getElementById('pcb-btn').textContent = '⬡ PCB VIEW';
    } else {
        if (!_pcbBuilt) { buildPCB(); _pcbBuilt = true; }
        modal.classList.remove('hidden');
        document.getElementById('pcb-btn').textContent = '✕ CLOSE PCB';
    }
}
window.togglePCB = togglePCB;
window.updatePCB = updatePCB;
