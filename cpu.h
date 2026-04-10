#pragma once
#include <cstdint>
#include <iostream>
#include "instructionset.h"

struct CPU {
    uint8_t r0 = 0;
    uint8_t r1 = 0;
    uint8_t pc = 0;
    uint8_t mem[256] = {0};
    // Initialize entire instruction memory to 0xFF (HALT) so any unloaded
    // region safely stops execution instead of running as NOP or invalid opcode.
    uint8_t inst[256];
    bool halt = false;

    CPU() : r0(0), r1(0), pc(0), halt(false) {
        std::fill(std::begin(mem),  std::end(mem),  0x00);
        std::fill(std::begin(inst), std::end(inst), 0xFF);
    }
};

void step(CPU &cpu) {
    uint8_t opcode  = cpu.inst[cpu.pc];
    uint8_t operand = cpu.inst[(uint8_t)(cpu.pc + 1)];

    switch (opcode) {

        // --------------------
        // 0x00 NOP
        // --------------------
        case 0x00:
            cpu.pc += 2;
            break;

        // --------------------
        // LOAD immediate
        // --------------------
        case 0x01: // LOAD R0
            cpu.r0 = operand;
            cpu.pc += 2;
            break;

        case 0x02: // LOAD R1
            cpu.r1 = operand;
            cpu.pc += 2;
            break;

        // --------------------
        // MOV
        // --------------------
        case 0x03: // MOV R0 -> R1
            cpu.r1 = cpu.r0;
            cpu.pc += 2;
            break;

        case 0x04: // MOV R1 -> R0
            cpu.r0 = cpu.r1;
            cpu.pc += 2;
            break;

        // --------------------
        // ARITHMETIC
        // --------------------
        case 0x10: // ADD R0 += imm
            cpu.r0 += operand;
            cpu.pc += 2;
            break;

        case 0x11: // ADD R0 += R1
            cpu.r0 += cpu.r1;
            cpu.pc += 2;
            break;

        case 0x12: // SUB R0 -= imm
            cpu.r0 -= operand;
            cpu.pc += 2;
            break;

        // --------------------
        // MEMORY
        // --------------------
        case 0x20: // LOADM R0
            cpu.r0 = cpu.mem[operand];
            cpu.pc += 2;
            break;

        case 0x21: // STORE R0
            cpu.mem[operand] = cpu.r0;
            cpu.pc += 2;
            break;

        case 0x22: // LOADM R1
            cpu.r1 = cpu.mem[operand];
            cpu.pc += 2;
            break;

        case 0x23: // STORE R1
            cpu.mem[operand] = cpu.r1;
            cpu.pc += 2;
            break;

        // --------------------
        // CONTROL FLOW
        // --------------------
        case 0x30: // JMP
            cpu.pc = operand;
            break;

        case 0x31: // JZ (if R0 == 0)
            if (cpu.r0 == 0)
                cpu.pc = operand;
            else
                cpu.pc += 2;
            break;

        case 0x32: // JNZ (if R0 != 0)
            if (cpu.r0 != 0)
                cpu.pc = operand;
            else
                cpu.pc += 2;
            break;

        // --------------------
        // HALT
        // --------------------
        case 0xFF:
            cpu.halt = true;
            break;

        // --------------------
        // INVALID OPCODE
        // --------------------
        default:
            std::cout << "Invalid opcode at PC: " << (int)cpu.pc << "\n";
            cpu.halt = true;
            break;
    }
}

void run(CPU &cpu, uint8_t start_addr) {
    cpu.pc = start_addr;
    while (!cpu.halt) {
        // Guard against PC overflow wrapping silently into already-executed code
        uint8_t prev_pc = cpu.pc;
        step(cpu);

        // Debug view (VERY useful)
        std::cout << "PC=" << (int)cpu.pc
                  << " R0=" << (int)cpu.r0
                  << " R1=" << (int)cpu.r1
                  << "\n";

        // Detect infinite PC-overflow loop: if pc wrapped past 254 unexpectedly
        if (!cpu.halt && cpu.pc < prev_pc &&
            cpu.inst[prev_pc] != ISA::JMP &&
            cpu.inst[prev_pc] != ISA::JZ  &&
            cpu.inst[prev_pc] != ISA::JNZ) {
            std::cout << "PC overflow detected at " << (int)prev_pc << ", halting.\n";
            cpu.halt = true;
        }
    }
}