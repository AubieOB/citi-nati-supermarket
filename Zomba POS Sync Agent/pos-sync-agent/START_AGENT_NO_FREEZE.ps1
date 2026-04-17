$ErrorActionPreference = 'Stop'

try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ConsoleModeNative {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr GetStdHandle(int nStdHandle);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
}
"@

  $STD_INPUT_HANDLE = -10
  $ENABLE_QUICK_EDIT_MODE = 0x0040
  $ENABLE_EXTENDED_FLAGS = 0x0080

  $inputHandle = [ConsoleModeNative]::GetStdHandle($STD_INPUT_HANDLE)
  [uint32]$currentMode = 0

  if ([ConsoleModeNative]::GetConsoleMode($inputHandle, [ref]$currentMode)) {
    $newMode = ($currentMode -band (-bnot $ENABLE_QUICK_EDIT_MODE)) -bor $ENABLE_EXTENDED_FLAGS
    [void][ConsoleModeNative]::SetConsoleMode($inputHandle, [uint32]$newMode)
    Write-Host "[BOOT] QuickEdit disabled for this session."
  } else {
    Write-Warning "[BOOT] Could not read console mode; continuing without QuickEdit change."
  }
} catch {
  Write-Warning "[BOOT] QuickEdit setup failed: $($_.Exception.Message)"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

& node server.js
exit $LASTEXITCODE
