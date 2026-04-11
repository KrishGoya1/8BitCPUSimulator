<div align="center">
  <h1>8-Bit CPU Simulator & Visualizer</h1>
  <p>A minimalist, high-performance 8-bit CPU emulation engine written in <b>C++</b>, compiled to <b>WebAssembly (WASM)</b>, and wrapped in a stunning <b>Cyberpunk-Industrial Web UI</b>.</p>

![C++](https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

</div>

---

## Features

-**Custom Architecture:** A lightweight, handcrafted 8-bit RISC-style instruction set featuring registers (`R0`, `R1`), an ALU, control units, and RAM.

- **Lightning Fast WASM:** Core execution logic is written entirely in `C++` (`cpu.h`, `instructionset.h`) natively mapped to memory bridges for zero-latency execution directly in your browser.
- **GitHub-Style Memory Heatmaps:** See memory activity visually—data and program address spaces are represented as dense, color-coded heatmaps reminiscent of GitHub contribution charts, complete with precise `0x00`-to-`0xFF` multi-stage intensity gradients.
- **Dynamic PCB Diagram:** An interactive, pan/zoomable "Printed Circuit Board" architecture diagram that accurately illustrates the pathways and layout of the internal CPU hardware components.
- **Live Assembly Editor:** Write, assemble, and inject code into the virtual machine natively utilizing the built-in Editor, featuring direct hardware disassembly validation and automatic execution logs down to the cycle.

---

## Architecture and Stack

The project is split into two defining halves communicating seamlessly via an Emscripten WASM bridge:

**The Core (C++)**
Handles all simulated computational math, clock steps, raw byte operations, and manages isolated state.

- `cpu.h`: Contains the core architectural class, memory buffers (256B Data / 256B Flash ROM), PC iteration logic, and arithmetic executions.
- `instructionset.h`: Contains the raw Opcode mapping dictating execution bounds.

**The Interface (Vanilla Web)**
Drives purely off the exported memory offsets of the WASM file, bringing the raw data alive. No massive web frameworks, pure performance.

- `web/app.js`: Core runner—controls rendering intervals, assembles string text into bytes, and orchestrates UI feedback safely tracking pointer values.
- `web/style.css`: Provides the meticulously constructed 3-column industrial viewport locking flex-layouts perfectly in place.

---

## Setup & Execution

### 1. Compile the WASM Backend

To build the WebAssembly payload natively, you need **Emscripten (emsdk)** installed. A unified installation script is included.

1. Ensure Python/Git are available in your windows environment.
2. Execute the setup sequence:
   ```cmd
   .\install_emsdk.bat
   ```
3. Compile `cpu.h` into `cpu.wasm` via standard emcc build chains (ensure you export the CPU methods like `_cpu_init`, `_cpu_step`, etc.).

### 2. Launching the Simulator

Since WASM requires fetching assets asynchronously over HTTP, you cannot double-click the `index.html`. You must run a local development server.

If you have VSCode or Python installed:

```cmd
# Start a local python web server
python -m http.server 8080
```

Navigate to `http://localhost:8080/web/` in your browser.

---

## Writing Assembly

The CPU reads a stripped-down Custom ISA (Instruction Set Architecture).

### Quick Demo: Smilie Face Heatmap Generator

Want to test the heatmap? Try this custom script that injects bright green `255` values to paint a smiley face onto the Data visualizer:

```assembly
; Draw a smiley face on the Heatmap!

LOAD_R0 255     ; Brightest green (heat-4)

; Left Eye
STORE_R0 68     ; 0x44
STORE_R0 69     ; 0x45
STORE_R0 84     ; 0x54
STORE_R0 85     ; 0x55

; Right Eye
STORE_R0 74     ; 0x4A
STORE_R0 75     ; 0x4B
STORE_R0 90     ; 0x5A
STORE_R0 91     ; 0x5B

; Smile
STORE_R0 164    ; 0xA4
STORE_R0 171    ; 0xAB
STORE_R0 181    ; 0xB5
STORE_R0 186    ; 0xBA
STORE_R0 198    ; 0xC6
STORE_R0 199    ; 0xC7
STORE_R0 200    ; 0xC8
STORE_R0 201    ; 0xC9

HALT
```

Click **ASSEMBLE**, then hit **RUN**, and watch the magic execute linearly directly on the bare-metal architecture!
