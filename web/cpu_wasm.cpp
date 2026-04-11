#include <emscripten.h>
#include <cstring>
#include <cstdio>
#include <cctype>
#include <sstream>
#include <string>
#include <unordered_map>
#include "../cpu.h"
#include "../instructionset.h"

// ─── Global state ────────────────────────────────────────────────────────────
static CPU      g_cpu;
static uint8_t  g_assembled[256];
static int      g_assembled_len = 0;
static char     g_error[512]    = "";
static uint8_t  g_last_opcode   = 0;
static uint8_t  g_last_operand  = 0;

// ─── Exported C API ──────────────────────────────────────────────────────────
extern "C" {

/** Reset CPU to factory defaults (keeps inst[] intact). */
EMSCRIPTEN_KEEPALIVE void cpu_reset() {
    g_cpu.r0   = 0;
    g_cpu.r1   = 0;
    g_cpu.pc   = 0;
    g_cpu.halt = false;
    std::fill(std::begin(g_cpu.mem), std::end(g_cpu.mem), 0x00);
}

/** Full init: reset CPU AND wipe instruction memory. */
EMSCRIPTEN_KEEPALIVE void cpu_init() {
    g_cpu = CPU(); // constructor fills inst[] with 0xFF and mem[] with 0x00
    g_last_opcode = g_last_operand = 0;
}

/** Load assembled bytes into instruction memory and reset execution state. */
EMSCRIPTEN_KEEPALIVE void cpu_load(uint8_t* data, int len) {
    cpu_reset();
    std::fill(std::begin(g_cpu.inst), std::end(g_cpu.inst), 0xFF);
    for (int i = 0; i < len && i < 256; ++i)
        g_cpu.inst[i] = data[i];
}

/** Execute one instruction. */
EMSCRIPTEN_KEEPALIVE void cpu_step() {
    if (g_cpu.halt) return;
    g_last_opcode  = g_cpu.inst[g_cpu.pc];
    g_last_operand = g_cpu.inst[(uint8_t)(g_cpu.pc + 1)];
    step(g_cpu);
}

EMSCRIPTEN_KEEPALIVE uint8_t cpu_get_r0()          { return g_cpu.r0; }
EMSCRIPTEN_KEEPALIVE uint8_t cpu_get_r1()          { return g_cpu.r1; }
EMSCRIPTEN_KEEPALIVE uint8_t cpu_get_pc()          { return g_cpu.pc; }
EMSCRIPTEN_KEEPALIVE int     cpu_is_halted()       { return g_cpu.halt ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE uint8_t cpu_get_last_opcode() { return g_last_opcode; }
EMSCRIPTEN_KEEPALIVE uint8_t cpu_get_last_operand(){ return g_last_operand; }

EMSCRIPTEN_KEEPALIVE uint8_t cpu_get_mem(int addr) {
    return (addr >= 0 && addr < 256) ? g_cpu.mem[addr] : 0;
}
EMSCRIPTEN_KEEPALIVE void cpu_set_mem(int addr, uint8_t val) {
    if (addr >= 0 && addr < 256) {
        g_cpu.mem[addr] = val;
    }
}
EMSCRIPTEN_KEEPALIVE uint8_t cpu_get_inst(int addr) {
    return (addr >= 0 && addr < 256) ? g_cpu.inst[addr] : 0xFF;
}

/** Snapshot all 256 data-memory bytes into caller-provided buffer. */
EMSCRIPTEN_KEEPALIVE void cpu_snapshot_mem(uint8_t* out) {
    std::copy(std::begin(g_cpu.mem), std::end(g_cpu.mem), out);
}
/** Snapshot all 256 instruction-memory bytes into caller-provided buffer. */
EMSCRIPTEN_KEEPALIVE void cpu_snapshot_inst(uint8_t* out) {
    std::copy(std::begin(g_cpu.inst), std::end(g_cpu.inst), out);
}

// ─── In-memory assembler ─────────────────────────────────────────────────────
/**
 * Assemble null-terminated source string.
 * Returns number of bytes written to g_assembled[], or -1 on error.
 * On error, g_error[] is populated. Call cpu_get_assembled_buf() to read bytes.
 */
EMSCRIPTEN_KEEPALIVE int cpu_assemble(const char* src) {
    using namespace ISA;
    g_assembled_len = 0;
    g_error[0]      = '\0';

    static const std::unordered_map<std::string, uint8_t> opMap = {
        {"NOP",        NOP},
        {"LOAD_R0",    LOAD_R0},   {"LOAD_R1",    LOAD_R1},
        {"MOV_R0_R1",  MOV_R0_TO_R1}, {"MOV_R1_R0", MOV_R1_TO_R0},
        {"ADD_R0_IMM", ADD_R0_IMM}, {"ADD_R0_R1",  ADD_R0_R1},
        {"SUB_R0_IMM", SUB_R0_IMM}, {"SUB_R0_R1",  SUB_R0_R1},
        {"LOADM_R0",   LOADM_R0},  {"STORE_R0",   STORE_R0},
        {"LOADM_R1",   LOADM_R1},  {"STORE_R1",   STORE_R1},
        {"LOADIND_R0_R1", LOADIND_R0_R1}, {"STOREIND_R0_R1", STOREIND_R0_R1},
        {"JMP",        JMP},  {"JZ", JZ},  {"JNZ", JNZ}, {"JGE_R0_R1", JGE_R0_R1},
        {"HALT",       HALT}
    };

    std::istringstream stream(src);
    std::string line;
    int lineNum = 0;

    while (std::getline(stream, line)) {
        ++lineNum;
        // strip comments
        auto cp = line.find(';');
        if (cp != std::string::npos) line = line.substr(0, cp);

        std::istringstream ss(line);
        std::string tok;
        ss >> tok;
        if (tok.empty()) continue;

        // uppercase
        for (auto& c : tok) c = (char)toupper((unsigned char)c);

        auto it = opMap.find(tok);
        if (it == opMap.end()) {
            snprintf(g_error, sizeof(g_error),
                     "Line %d: Unknown instruction '%s'", lineNum, tok.c_str());
            return -1;
        }

        if (g_assembled_len >= 255) {
            snprintf(g_error, sizeof(g_error), "Line %d: Program too large (max 256 bytes)", lineNum);
            return -1;
        }

        uint8_t op = it->second;
        g_assembled[g_assembled_len++] = op;

        bool needsOp = (op != NOP && op != MOV_R0_TO_R1 && op != MOV_R1_TO_R0 &&
                        op != ADD_R0_R1 && op != SUB_R0_R1 && 
                        op != LOADIND_R0_R1 && op != STOREIND_R0_R1 && op != HALT);

        if (needsOp) {
            int operand;
            if (!(ss >> operand)) {
                snprintf(g_error, sizeof(g_error),
                         "Line %d: Missing operand for '%s'", lineNum, tok.c_str());
                return -1;
            }
            if (operand < 0 || operand > 255) {
                snprintf(g_error, sizeof(g_error),
                         "Line %d: Operand %d out of range (0–255)", lineNum, operand);
                return -1;
            }
            g_assembled[g_assembled_len++] = (uint8_t)operand;
        } else {
            g_assembled[g_assembled_len++] = 0x00; // dummy
        }
    }

    return g_assembled_len;
}

EMSCRIPTEN_KEEPALIVE uint8_t*    cpu_get_assembled_buf() { return g_assembled; }
EMSCRIPTEN_KEEPALIVE int         cpu_get_assembled_len() { return g_assembled_len; }
EMSCRIPTEN_KEEPALIVE const char* cpu_get_error()         { return g_error; }

} // extern "C"
