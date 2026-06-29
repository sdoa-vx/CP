@echo off
REM ============================================================================
REM SDOA suite build for Windows / MSVC 2022 (single static sdoa.exe).
REM
REM Zero external dependencies:
REM   * SDOA_STATIC      -> no dllexport/dllimport (one statically linked exe)
REM   * SDOA_NO_SIGNING  -> signing compiled out, so libsodium is NOT required
REM   * NOMINMAX         -> stop <windows.h> clobbering std::min / std::max
REM
REM USAGE
REM   Easiest:  open "x64 Native Tools Command Prompt for VS 2022",
REM             cd into this folder, run:  build.bat
REM   This script will also try to locate and load vcvars64.bat itself if
REM   cl.exe is not already on the PATH.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Project root WITHOUT a trailing backslash. A trailing "\" right before a
REM closing quote (e.g. /I "C:\dir\") is parsed by MSVC as an escaped quote,
REM which swallows the following arguments - so strip it.
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

REM --- locate the MSVC compiler -------------------------------------------------
REM NOTE: do NOT reference %ProgramFiles(x86)% inside a parenthesised block -
REM the literal ')' in the name prematurely closes the block in cmd. We use
REM vswhere (shipped with every modern VS installer) to find the toolchain.
where cl.exe >nul 2>nul
if not errorlevel 1 goto have_cl
echo cl.exe not on PATH - locating Visual Studio via vswhere...
REM These lines are NOT inside a parenthesised block, so the literal ')' in
REM %ProgramFiles(x86)% is safe here.
REM vswhere ships at a fixed location with the VS installer. (Do not rely on
REM %ProgramFiles(x86)% - that variable is not always present in the env.)
set "VSWHERE=C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" set "VSWHERE=C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto no_vcv
set "VCV="
for /f "usebackq tokens=*" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VCV=%%I\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCV goto no_vcv
if not exist "%VCV%" goto no_vcv
echo Loading "%VCV%"
call "%VCV%"
goto have_cl

:no_vcv
echo.
echo ERROR: Could not locate vcvars64.bat via vswhere.
echo Open the "x64 Native Tools Command Prompt for VS 2022" and run build.bat from there.
exit /b 1

:have_cl
where cl.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: cl.exe still not available after loading vcvars. Aborting.
    exit /b 1
)

REM --- output / object directory -----------------------------------------------
if not exist "build" mkdir "build"

REM --- include paths -----------------------------------------------------------
set INCLUDES=/I "%ROOT%" /I "%ROOT%\core" /I "%ROOT%\third_party" /I "%ROOT%\abi\include"

REM --- compiler flags ----------------------------------------------------------
REM /std:c++20  C++20    /EHsc exceptions    /O2 optimize
REM /bigobj     nlohmann/json.hpp pushes past the default section limit
REM /utf-8      source + execution charset    /MD release CRT
set "CXXFLAGS=/nologo /std:c++20 /EHsc /O2 /bigobj /utf-8 /MD /W3 /DSDOA_STATIC /DSDOA_NO_SIGNING /DNOMINMAX"

REM --- engine core + ABI + CLI sources (plain appends; caret-continued
REM     `set` is unreliable under enabledelayedexpansion) ----------------------
set "SOURCES="
set "SOURCES=%SOURCES% core\model\model_parser.cpp"
set "SOURCES=%SOURCES% core\model\model_validator.cpp"
set "SOURCES=%SOURCES% core\pipeline\pipeline_parser.cpp"
set "SOURCES=%SOURCES% core\pipeline\pipeline_validator.cpp"
set "SOURCES=%SOURCES% core\runtime\registry.cpp"
set "SOURCES=%SOURCES% core\runtime\scheduler.cpp"
set "SOURCES=%SOURCES% core\runtime\engine.cpp"
set "SOURCES=%SOURCES% core\runtime\resolve.cpp"
set "SOURCES=%SOURCES% core\runtime\merge.cpp"
set "SOURCES=%SOURCES% core\runtime\schema.cpp"
set "SOURCES=%SOURCES% core\capabilities\capabilities.cpp"
set "SOURCES=%SOURCES% core\capabilities\string\string.cpp"
set "SOURCES=%SOURCES% core\capabilities\math\math.cpp"
set "SOURCES=%SOURCES% core\capabilities\json\json.cpp"
set "SOURCES=%SOURCES% core\capabilities\filesystem\filesystem.cpp"
set "SOURCES=%SOURCES% core\capabilities\system\system.cpp"
set "SOURCES=%SOURCES% abi\src\sdoa_c_api.cpp"
set "SOURCES=%SOURCES% cli\main.cpp"

echo.
echo === Compiling SDOA suite (sdoa.exe) ===
cl %CXXFLAGS% %INCLUDES% %SOURCES% /Fobuild\ /Fesdoa.exe
if errorlevel 1 (
    echo.
    echo BUILD FAILED. Copy the first few errors above and send them over.
    exit /b 1
)

echo.
echo === BUILD OK : produced sdoa.exe ===
echo Try it:  sdoa.exe --help
endlocal
