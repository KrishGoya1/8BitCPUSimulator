#pragma once
#include <cstdint>

namespace ISA {

    // NOP
    constexpr uint8_t NOP = 0x00;

    // LOAD immediate
    constexpr uint8_t LOAD_R0 = 0x01;
    constexpr uint8_t LOAD_R1 = 0x02;

    // MOV
    constexpr uint8_t MOV_R0_TO_R1 = 0x03;
    constexpr uint8_t MOV_R1_TO_R0 = 0x04;

    // ARITHMETIC
    constexpr uint8_t ADD_R0_IMM = 0x10;
    constexpr uint8_t ADD_R0_R1  = 0x11;
    constexpr uint8_t SUB_R0_IMM = 0x12;
    constexpr uint8_t SUB_R0_R1  = 0x13;

    // MEMORY
    constexpr uint8_t LOADM_R0  = 0x20;
    constexpr uint8_t STORE_R0  = 0x21;
    constexpr uint8_t LOADM_R1  = 0x22;
    constexpr uint8_t STORE_R1       = 0x23;
    constexpr uint8_t LOADIND_R0_R1  = 0x24;
    constexpr uint8_t STOREIND_R0_R1 = 0x25;

    // CONTROL FLOW
    constexpr uint8_t JMP  = 0x30;
    constexpr uint8_t JZ   = 0x31; // jump if R0 == 0
    constexpr uint8_t JNZ  = 0x32; // jump if R0 != 0
    constexpr uint8_t JGE_R0_R1 = 0x33; // jump if R0 >= R1
    
    // HALT
    constexpr uint8_t HALT = 0xFF;


    inline bool isValid(uint8_t opcode) {
        switch(opcode) {
            case NOP:
            case LOAD_R0:
            case LOAD_R1:
            case MOV_R0_TO_R1:
            case MOV_R1_TO_R0:
            case ADD_R0_IMM:
            case ADD_R0_R1:
            case SUB_R0_IMM:
            case SUB_R0_R1:
            case LOADM_R0:
            case STORE_R0:
            case LOADM_R1:
            case STORE_R1:
            case LOADIND_R0_R1:
            case STOREIND_R0_R1:
            case JMP:
            case JZ:
            case JNZ:
            case JGE_R0_R1:
            case HALT:
                return true;
            default:
                return false;
        }
    }
}