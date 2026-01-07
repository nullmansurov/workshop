@echo off
title Workspace Dependency Installer

echo ========================================================
echo         Workspace - Dependency Installation
echo ========================================================
echo.
echo This script will install all required Python libraries from the requirements.txt file.
echo Please wait for the process to complete.
echo.

python -m pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo -----------------------------------------------------
    echo ERROR: Installation failed. Please review the errors above.
    echo Make sure Python is installed and added to PATH.
    echo -----------------------------------------------------
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Success! All dependencies are installed.
echo ============================================
echo.
echo You can now close this window and run the main application.
echo.
pause
exit /b 0