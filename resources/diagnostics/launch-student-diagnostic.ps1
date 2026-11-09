param(
  [Parameter(Mandatory = $true)][string]$AppPath
)

$ErrorActionPreference = 'Continue'
$logDir = Join-Path $env:LOCALAPPDATA 'tangmen-aigc\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir 'launcher.log'
$start = Get-Date
$osArchitecture = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
$processArchitecture = if ([Environment]::Is64BitProcess) { 'x64' } else { 'x86' }

function Write-Log([string]$Message) {
  "[$(Get-Date -Format o)] $Message" | Out-File -FilePath $logPath -Encoding utf8 -Append
}

Write-Log "diagnostic launcher start: AppPath=$AppPath"
$os = Get-CimInstance Win32_OperatingSystem
Write-Log "OS: $($os.Caption) build $($os.BuildNumber), architecture=$osArchitecture"
Write-Log "Process architecture=$processArchitecture"
Write-Log "VC runtime files: $((Get-ChildItem "$env:WINDIR\System32\vcruntime140*.dll" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName) -join '; ')"
foreach ($key in @('HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64')) {
  try { Write-Log "VC runtime registry ($key): $((Get-ItemProperty $key -ErrorAction Stop | Out-String).Trim())" }
  catch { Write-Log "VC runtime registry ($key): missing" }
}

try {
  $process = Start-Process -FilePath $AppPath -WorkingDirectory (Split-Path $AppPath) -PassThru
  $process.WaitForExit()
  Write-Log "app exited: code=$($process.ExitCode), elapsed=$((Get-Date) - $start)"
} catch {
  Write-Log "app launch exception: $($_.Exception | Out-String)"
}

if ($process -and $process.ExitCode -eq -1073741701) {
  Write-Log 'loader status 0xC000007B detected; likely invalid image format or architecture/dependency mismatch.'
  foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'concrt140.dll')) {
    foreach ($base in @("$env:WINDIR\System32", "$env:WINDIR\SysWOW64")) {
      $candidate = Join-Path $base $dll
      if (Test-Path $candidate) {
        $file = Get-Item $candidate
        Write-Log "runtime DLL present: $candidate version=$($file.VersionInfo.FileVersion)"
      } else {
        Write-Log "runtime DLL missing: $candidate"
      }
    }
  }
}

$since = $start.AddSeconds(-5)
foreach ($logName in @('Application', 'Microsoft-Windows-CodeIntegrity/Operational')) {
  try {
    Get-WinEvent -FilterHashtable @{ LogName = $logName; StartTime = $since } -ErrorAction Stop |
      Where-Object { $_.Id -in @(1000, 1001, 3077, 3033, 3089) } |
      Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message |
      Format-List | Out-File -FilePath $logPath -Encoding utf8 -Append
  } catch {
    Write-Log "event log read failed ($logName): $($_.Exception.Message)"
  }
}
Write-Log "diagnostic launcher end; send $logPath"
