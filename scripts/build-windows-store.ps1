#!/usr/bin/env pwsh
# Build Subspace Lattice MSIX for Microsoft Store (via tauri-windows-bundle).
# Usage: .\scripts\build-windows-store.ps1
# Prefer: yarn build:windows:store (from repo root, on Windows).

param(
    [string]$CertFile = "",
    [string]$CertPassword = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Building Subspace Lattice MSIX for Microsoft Store..." -ForegroundColor Cyan

Push-Location $PSScriptRoot\..

try {
    Write-Host "`nBuilding web frontend..." -ForegroundColor Yellow
    yarn nx build web

    Write-Host "`nSyncing MSIX assets + bundling..." -ForegroundColor Yellow
    yarn workspace @subspace-lattice/desktop tauri:windows:build

    $msixPath = "apps\desktop\src-tauri\target\release\bundle\msix"
    if (-not (Test-Path $msixPath)) {
        $msixPath = "apps\desktop\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\msix"
    }
    $msixFile = Get-ChildItem -Path $msixPath -Filter "*.msix" -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $msixFile) {
        throw "MSIX file not found under apps/desktop/src-tauri/target/**/bundle/msix"
    }

    Write-Host "`nMSIX created: $($msixFile.Name)" -ForegroundColor Green

    if ($CertFile -and $CertPassword) {
        Write-Host "`nSigning MSIX..." -ForegroundColor Yellow
        signtool sign /fd SHA256 /a /f $CertFile /p $CertPassword $msixFile.FullName
        Write-Host "MSIX signed" -ForegroundColor Green
    }
    else {
        Write-Host "`nMSIX not signed (provide -CertFile and -CertPassword to sign)" -ForegroundColor Yellow
    }

    Write-Host "`nMSIX location:" -ForegroundColor Cyan
    Write-Host "  $($msixFile.FullName)" -ForegroundColor White
    Write-Host "`nNext: upload to Microsoft Partner Center." -ForegroundColor Cyan
}
catch {
    Write-Host "`nBuild failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
