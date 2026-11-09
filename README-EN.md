# TangMen AIGC Workbench

[简体中文](README-CN.md) | [English](README-EN.md)

A local desktop workbench for creating characters, images, videos, and operational content. It includes an AI chat workspace, an infinite canvas, a 3D director stage, and in-app guides.

## Download and Run

See the Releases page for release notes and supported-system information. Source code and installers are different ways to use the project; the source requires dependencies to be installed first.

**Compatibility status:** The 0.1.1 Windows x64 installer was installed and launched on our Windows 11 machine, and its empty-data state was checked. The root cause of the 0xC000007B failure reported on Windows 10 Home 22H2 has not yet been established, so this must not be considered fixed. The current installer is unsigned.

See [WorkBuddy handoff notes](docs/WORKBUDDY.md) and [Windows troubleshooting](docs/WINDOWS.md).

## Local Development

You need Git, Node.js 22.12.0 or later, and npm. On Windows, use the x64 runtime matching your operating system. Do not install with --omit=optional; native dependencies may be incomplete.

~~~powershell
git clone https://github.com/Lin121-arch/tangmen-aigc-workbench.git
cd tangmen-aigc-workbench
npm.cmd ci
npm.cmd run setup:runtime
npm.cmd run dev
~~~

setup:runtime explicitly installs the Electron runtime. dev and test also check this step first to prevent competing downloads on first launch. If the download fails, resolve the network error instead of skipping the step and assuming it succeeded.

dev and build use student mode by default: no model services or maintainer connection details are preconfigured. Users must configure services and credentials they are authorized to use for chat, image, and video generation. A listed model name does not guarantee generation access. Native Codex or Claude agents also require the user's own installation and authentication.

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
~~~

build creates the renderer, main-process, and preload outputs; it does not create an installer. To build a Windows installer, use package:windows and provide an extracted Electron 42.11.18 x64 runtime whose files have been verified against the official SHA-256 values:

~~~powershell
npm.cmd run package:windows -- --electron-dist=C:\verified-electron-runtime
~~~

The build downloads the VC++ runtime from Microsoft's version-pinned endpoint and verifies its SHA-256 before packaging. A failed download or hash check stops the build. A successful build does not prove that an installer launches correctly. Before distribution, test the actual installer and Portable build with an isolated user-data directory on the target operating system.

## Workspaces

- Creative workspace: chat, image, and video generation share one composer and support configured models and reference images.
- Infinite canvas: organize assets, prompts, and connected workflow nodes.
- 3D director stage: preview character placement, paths, and camera setups. A preview is not the final model-generated video.
- Built-in guides: cover prompts, the canvas, and the director stage. Review each generated result before use.

Source code may change and is not guaranteed to be stable. Back up projects and settings before updating, and try changes in a separate copy first. This repository does not currently provide an automatic update channel.

## Data and Privacy

The repository does not include the maintainer's accounts, API connections, keys, projects, chats, or generated media. The application stores user-configured data locally. API requests are sent to the provider selected by the user; provider data policies differ.

Before submitting changes, run npm.cmd run audit:source. Do not commit .env, settings or model-service files, workspaces, logs, screenshots, or API examples containing keys. Ignore rules do not replace reviewing the staged files.

## Attribution and License

This project builds on the existing Electron/React workbench code from AIGC CANVAS and retains its original MIT notice. TangMen has added and adapted the creative workspace, multi-provider settings, guides, workflow templates, and director-stage features; the upstream project is not represented as wholly original work.

See [LICENSE](LICENSE) for the source license and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for separate notices and licenses for assets, templates, models, and dependencies. This public source does not include the legacy UE character GLB. The included actor models are Storyboarder resources distributed with their license. The software license does not grant rights to third-party model accounts, media assets, or generated content.
