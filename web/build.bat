@echo off
echo ============================================
echo  Building CPU WASM module
echo ============================================

REM Activate Emscripten environment
call "..\emsdk\emsdk_env.bat" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Could not find emsdk. Run install_emsdk.bat from the CPU root first.
    pause
    exit /b 1
)

echo Compiling cpu_wasm.cpp to WebAssembly...

emcc cpu_wasm.cpp ^
    -I.. ^
    -std=c++17 ^
    -O2 ^
    -s MODULARIZE=1 ^
    -s EXPORT_NAME="CPUModule" ^
    -s EXPORTED_FUNCTIONS="['_cpu_init','_cpu_reset','_cpu_load','_cpu_step','_cpu_get_r0','_cpu_get_r1','_cpu_get_pc','_cpu_is_halted','_cpu_get_mem','_cpu_get_inst','_cpu_snapshot_mem','_cpu_snapshot_inst','_cpu_assemble','_cpu_get_assembled_buf','_cpu_get_assembled_len','_cpu_get_error','_cpu_get_last_opcode','_cpu_get_last_operand','_malloc','_free']" ^
    -s EXPORTED_RUNTIME_METHODS="['stringToUTF8','lengthBytesUTF8','UTF8ToString','HEAPU8']" ^
    -s ALLOW_MEMORY_GROWTH=1 ^
    -s ENVIRONMENT=web ^
    -o cpu.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed. See errors above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  BUILD SUCCESS!
echo  cpu.js and cpu.wasm generated.
echo  Now run:  python serve.py
echo  Then open: http://localhost:8080
echo ============================================
pause
