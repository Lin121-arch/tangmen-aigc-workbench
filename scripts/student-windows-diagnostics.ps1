param([Parameter(Mandatory=$true)][string]$Program)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $Program).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path ([Environment]::GetFolderPath('Desktop')) ('Tangmen-Diagnostics-' + $stamp)
New-Item -ItemType Directory -Path $target | Out-Null
$started = Get-Date
$report = [ordered]@{ Started=$started.ToString('o'); OS=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture); Program=$exe; SHA256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash; Signature=(Get-AuthenticodeSignature -LiteralPath $exe).Status.ToString() }
$native = @()
Get-ChildItem -LiteralPath (Split-Path -LiteralPath $exe) -File | Where-Object {$_.Extension -in @('.dll','.exe')} | ForEach-Object {
  $stream=[IO.File]::OpenRead($_.FullName)
  try { $reader=New-Object IO.BinaryReader($stream); $stream.Position=60; $pe=$reader.ReadInt32(); $stream.Position=$pe+4; $machine=$reader.ReadUInt16(); $native += [ordered]@{Name=$_.Name;Machine=('0x{0:X4}' -f $machine);SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash} } finally {$stream.Dispose()}
}
$report.NativeFiles=$native
try {
  $profile=Join-Path $target 'clean-profile'
  $proc=Start-Process -FilePath $exe -ArgumentList ('--user-data-dir="'+$profile+'"') -PassThru -WindowStyle Hidden
  if($proc.WaitForExit(20000)) { $report.ExitCode=$proc.ExitCode; $report.ExitHex=('0x{0:X8}' -f ($proc.ExitCode -band 0xffffffffL)) } else { $report.ProcessId=$proc.Id; $report.Status='Still running after 20 seconds. Close the application normally after checking it.' }
} catch { $report.StartError=$_.Exception.Message }
$events=@()
foreach($log in @('Microsoft-Windows-CodeIntegrity/Operational','Microsoft-Windows-Windows Defender/Operational','Application')) {
  try { $events += @(Get-WinEvent -FilterHashtable @{LogName=$log;StartTime=$started.AddSeconds(-5)} -MaxEvents 200 -ErrorAction Stop | Where-Object {$_.Message -like ('*'+[IO.Path]::GetFileName($exe)+'*') -or $_.Message -like '*Tangmen*'} | Select-Object TimeCreated,Id,ProviderName,Message) } catch {}
}
$report.Events=$events
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $target 'diagnostic.json') -Encoding UTF8
Write-Output ('Diagnostics saved: '+$target)
