#include <cstdint>
#include <iostream>
#include <fstream>
#include "instructionset.h"
#include "cpu.h"

using namespace std;

int main() {
    CPU cpu;
    ifstream f("program.bin", ios::binary);
    if (!f) {
        cout << "Cannot open program.bin\n";
        return 1;
    }

    f.read(reinterpret_cast<char*>(cpu.inst), 256);
    streamsize bytesRead = f.gcount();
    f.close();

    cout << "Program loaded successfully! (" << bytesRead << " bytes)\n";

    while (!cpu.halt) {
        uint8_t prev_pc = cpu.pc;
        step(cpu);

        cout << "PC=" << (int)cpu.pc
             << " R0=" << (int)cpu.r0
             << " R1=" << (int)cpu.r1 << "\n";

        if (!cpu.halt && cpu.pc < prev_pc &&
            cpu.inst[prev_pc] != ISA::JMP &&
            cpu.inst[prev_pc] != ISA::JZ  &&
            cpu.inst[prev_pc] != ISA::JNZ) {
            cout << "PC overflow detected at " << (int)prev_pc << ", halting.\n";
            cpu.halt = true;
            break;
        }

        cout << "Press ENTER to execute next instruction...";
        cin.get();
    }

    cout << "Program halted!\n";

    cout << "Memory snapshot:\n";
    for (int i = 0; i < 256; i++) {
        cout << (int)cpu.mem[i] << "\t";
        if ((i + 1) % 16 == 0) cout << "\n";
    }

    cout << "Instruction snapshot:\n";
    for (int i = 0; i < 256; i++) {
        cout << (int)cpu.inst[i] << "\t";
        if ((i + 1) % 16 == 0) cout << "\n";
    }

    return 0;
}