#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <unordered_map>
#include "instructionset.h"

using namespace std;
using namespace ISA;

int main(int argc, char* argv[]) {

    if (argc < 2) {
        cout << "Usage: " << argv[0] << " <input.asm>\n";
        return 1;
    }

    ifstream infile(argv[1]);
    if (!infile) {
        cout << "Cannot open file: " << argv[1] << "\n";
        return 1;
    }

    vector<uint8_t> program;
    string line;

    unordered_map<string, uint8_t> opcodeMap = {
        {"NOP", NOP},
        {"LOAD_R0", LOAD_R0},
        {"LOAD_R1", LOAD_R1},
        {"MOV_R0_R1", MOV_R0_TO_R1},
        {"MOV_R1_R0", MOV_R1_TO_R0},
        {"ADD_R0_IMM", ADD_R0_IMM},
        {"ADD_R0_R1", ADD_R0_R1},
        {"SUB_R0_IMM", SUB_R0_IMM},
        {"LOADM_R0", LOADM_R0},
        {"STORE_R0", STORE_R0},
        {"LOADM_R1", LOADM_R1},
        {"STORE_R1", STORE_R1},
        {"JMP", JMP},
        {"JZ", JZ},
        {"JNZ", JNZ},
        {"HALT", HALT}
    };

    while (getline(infile, line)) {
        auto commentPos = line.find(';');
        if (commentPos != string::npos)
            line = line.substr(0, commentPos);

        stringstream ss(line);
        string instr;
        ss >> instr;
        if (instr.empty()) continue;

        auto it = opcodeMap.find(instr);
        if (it == opcodeMap.end()) {
            cout << "Unknown instruction: " << instr << "\n";
            return 1;
        }

        program.push_back(it->second);

        if (it->second != NOP && it->second != MOV_R0_TO_R1 &&
            it->second != MOV_R1_TO_R0 && it->second != ADD_R0_R1 &&
            it->second != HALT) {

            int operand;
            if (!(ss >> operand)) {
                cout << "Missing operand for instruction: " << instr << "\n";
                return 1;
            }

            if (operand < 0 || operand > 255) {
                cout << "Operand out of range (0-255): " << operand << "\n";
                return 1;
            }

            program.push_back(static_cast<uint8_t>(operand));
        } else {
            program.push_back(0);
        }
    }
    ofstream outfile("program.bin", ios::binary);
    if (!outfile) {
        cout << "Error: cannot open program.bin for writing\n";
        return 1;
    }
    outfile.write(reinterpret_cast<const char*>(program.data()), program.size());
    if (!outfile) {
        cout << "Error: failed to write program.bin\n";
        return 1;
    }

    cout << "Program assembled successfully! Bytes: " << program.size() << "\n";
}