@echo off
echo ============================================
echo  Emscripten SDK Installer
echo ============================================
echo  This will download ~200MB and may take
echo  several minutes. Please be patient.
echo ============================================
echo.

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: git is not installed or not on PATH.
    echo Please install Git from https://git-scm.com/
    pause
    exit /b 1
)

if not exist "emsdk" (
    echo Cloning Emscripten SDK...
    git clone https://github.com/emscripten-core/emsdk.git emsdk
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to clone emsdk. Check your internet connection.
        pause
        exit /b 1
    )
) else (
    echo emsdk directory already exists, pulling latest...
    cd emsdk
    git pull
    cd ..
)

echo.
echo Installing latest Emscripten toolchain...
cd emsdk
call emsdk.bat install latest
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: emsdk install failed.
    pause
    exit /b 1
)

call emsdk.bat activate latest
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: emsdk activate failed.
    pause
    exit /b 1
)
cd ..

echo.
echo ============================================
echo  SUCCESS! Emscripten SDK is ready.
echo  Next step: cd web ^&^& build.bat
echo ============================================
pause
