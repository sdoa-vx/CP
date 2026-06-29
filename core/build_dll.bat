@echo off
REM ============================================================================
REM Build libsdoa as a Windows DLL (sdoa.dll) - the shared engine library that
REM the Python / Node / Rust bindings load. Unlike build.bat (which makes the
REM standalone sdoa.exe), this exports the C ABI:
REM   * SDOA_ABI_EXPORTS  -> C ABI functions marked __declspec(dllexport)
REM   * NOMINMAX          -> keep <windows.h> from clobbering std::min/std::max
REM No external dependencies (signing lives only in the CLI, not the library).
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

REM --- locate the MSVC compiler (same approach as build.bat) -------------------
where cl.exe >nul 2>nul
if not errorlevel 1 goto have_cl
echo cl.exe not on PATH - locating Visual Studio via vswhere...
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
echo ERROR: Could not locate vcvars64.bat via vswhere.
exit /b 1

:have_cl
where cl.exe >nul 2>nul
if errorlevel 1 (echo ERROR: cl.exe still not available. & exit /b 1)

if not exist "dlbuild" mkdir "dlbuild"

set INCLUDES=/I "%ROOT%" /I "%ROOT%\core" /I "%ROOT%\third_party" /I "%ROOT%\abi\include"
set "CXXFLAGS=/nologo /std:c++20 /EHsc /O2 /bigobj /utf-8 /MD /W3 /DSDOA_ABI_EXPORTS /DNOMINMAX"

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

echo.
echo === Building sdoa.dll ===
cl %CXXFLAGS% %INCLUDES% %SOURCES% /LD /Fodlbuild\ /Fesdoa.dll
if errorlevel 1 (echo. & echo DLL BUILD FAILED. & exit /b 1)

echo.
echo === BUILD OK : produced sdoa.dll ===
endlocal
