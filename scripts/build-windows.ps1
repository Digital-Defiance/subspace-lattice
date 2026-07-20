#!/usr/bin/env pwsh
# Build Subspace Lattice for Windows (MSI/NSIS via Tauri).
# Usage: .\scripts\build-windows.ps1
# Prefer: yarn build:windows (from repo root, on Windows).

$ErrorActionPreference = "Stop"

Write-Host "Building Subspace Lattice for Windows..." -ForegroundColor Cyan

Push-Location $PSScriptRoot\..

try {
    Write-Host "`nBuilding web frontend..." -ForegroundColor Yellow
    yarn nx build web

    Write-Host "`nBuilding Tauri app..." -ForegroundColor Yellow
    Set-Location apps\desktop
    yarn tauri build

    Write-Host "`nBuild complete!" -ForegroundColor Green
    Write-Host "`nInstallers typically at:" -ForegroundColor Cyan
    Write-Host "  • src-tauri\target\release\bundle\msi\" -ForegroundColor White
    Write-Host "  • src-tauri\target\release\bundle\nsis\" -ForegroundColor White
}
catch {
    Write-Host "`nBuild failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
