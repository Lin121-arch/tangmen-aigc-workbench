# Windows CLI 操作参考

本机 CLI 已通过 `codex exec --help` 核对支持 `-C`、`--skip-git-repo-check`、`-s`、`--add-dir`、`-m`、`-c`、`-i` 和从标准输入读取 `-`。以下路径是运行时变量，不能写死旧版本 hash。

## 先创建画布节点

当前任务有 AIGC CANVAS 项目时，先调用 `GetCanvasCapabilities`，再为每张图片调用 `CreateCanvasNodes`。创建时写入提示词和目标画幅，暂时不设置 `sourcePath`：

```json
{"nodes":[{"kind":"image","title":"场景基础环境底图","prompt":"本次实际生图提示词"}]}
```

记录返回的真实 `createdNodeIds`，把每个节点 ID 与本次 CLI 日志、会话 ID 和目标文件名对应起来。若节点已存在，先用 `GetCanvasNode` 确认 ID，再更新提示词，后续写回该节点。参考生图时先核对底图节点已有有效 `sourcePath`，从项目内文件读取该 PNG 并以 `-i` 传给 CLI。

## 定位 CLI

```powershell
$codexHomeDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex' }
$codexCommand = Get-Command codex -ErrorAction SilentlyContinue
$codexExePath = if ($codexCommand) { $codexCommand.Source } else { $null }
$hostExePath = if ($codexExePath) { Join-Path (Split-Path -Parent $codexExePath) 'codex-code-mode-host.exe' } else { $null }

if (-not $codexExePath -or -not (Test-Path -LiteralPath $codexExePath -PathType Leaf) -or -not (Test-Path -LiteralPath $hostExePath -PathType Leaf)) {
  $codexBinRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
  $codexExePath = Get-ChildItem -LiteralPath $codexBinRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object {
      $candidateExe = Join-Path $_.FullName 'codex.exe'
      $candidateHost = Join-Path $_.FullName 'codex-code-mode-host.exe'
      if ((Test-Path -LiteralPath $candidateExe -PathType Leaf) -and (Test-Path -LiteralPath $candidateHost -PathType Leaf)) { $candidateExe }
    } | Select-Object -First 1
}
if (-not $codexExePath) { throw '没有找到 codex.exe 与 codex-code-mode-host.exe 齐备的安装目录' }
```

开始新批次时重做定位。若 CLI 能启动却报 `failed to spawn code-mode host` 或无图，优先复核这两个文件。

## 调用与日志

下面的 `$projectRoot`、`$promptFile`、`$logFile` 应由当前任务设为真实绝对路径；不要把用户的提示词拼成 shell 命令，先写入 UTF-8 文件。每次调用使用独立日志文件。

提示词应写明“请调用内置 `image_gen` 生成图片，按下列画面要求执行；若工具不可用请直接报告，不调用其他图片服务”，随后放入本次真实画面要求。参考生图时加入“先查看输入参考图片，以它为唯一视觉参考”，并明确保留项与改动项。

```powershell
$codexArgs = @('exec', '-C', $projectRoot, '--skip-git-repo-check', '-s', 'workspace-write', '--add-dir', $codexHomeDir, '-m', 'IMAGE_CAPABLE_MODEL_ID', '-c', 'model_reasoning_effort=none', '-')
Get-Content -LiteralPath $promptFile -Raw -Encoding UTF8 | & $codexExePath @codexArgs 2>&1 | Tee-Object -FilePath $logFile
```

参考图可在 `'-m'` 之前加入 `'-i', '<参考图绝对路径>'`，让后续选项明确结束图片参数。多个会话可并发，但各自必须有独立的日志和产物归属。

从该调用的日志确认会话 ID（UUID），在 `<Codex Home>/generated_images/<UUID>/` 下查找 PNG。不要用全局目录差值判断，因为其他并发会话会混入，而且旧脚本中的结尾斜杠 glob 曾导致误判。先检查 PNG 实际存在、可解码、尺寸和 alpha，再复制到当前项目内；CLI 会话内的文件搬运可能失败，复制由调用方执行。

项目内复制示例（`$pngPath` 是已经核验的原图路径，`$fileName` 为本次唯一文件名）：

```powershell
$imageDir = Join-Path $projectRoot 'uploads\images\codex-cli'
New-Item -ItemType Directory -Path $imageDir -Force | Out-Null
$targetPath = Join-Path $imageDir $fileName
Copy-Item -LiteralPath $pngPath -Destination $targetPath
```

复制成功后，用先前记录的真实节点 ID 调用 `UpdateCanvasNodes`，将项目相对 `sourcePath` 写回原节点：

```json
{"updates":[{"id":"先前创建的真实节点 ID","sourcePath":"uploads/images/codex-cli/scene-base-001.png"}]}
```

画布会从 `sourcePath` 自动派生 `workspace://` 预览地址；无需把 PNG 字节传给画布工具。用 `GetCanvasNode` 核对原节点已经有路径与预览。建立底图→派生图关系时调用 `ConnectCanvasNodes`，保留两个阶段各自的节点。

## 历史故障记录

- 2026-09 的本机记录中，Codex 自动更新曾留下可启动的旧 `codex.exe`，但同目录的 `codex-code-mode-host.exe` 消失，导致零出图。
- 同一批出图曾出现 `1672×941`、`1370×1148` 和 `1536×1024`，其中一张是 RGBA。尺寸不可由这批记录推断为固定规格；实际尺寸和画幅每张都要检查。
- 当时 `IMAGE_CAPABLE_MODEL_ID` 的 `model_reasoning_effort=minimal` 在服务端被拒；使用明确记录的 `none`。模型可用性将来可能变化，报不支持时应报告并核对当前 CLI/模型，不自行静默换模型。
- `ERROR: Reconnecting...` 曾在成功出图的日志出现。以可打开的 PNG 为成功依据。
