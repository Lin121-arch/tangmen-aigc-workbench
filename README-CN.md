# 唐门 AIGC 工作台

[简体中文](README-CN.md) | [English](README-EN.md)

用于角色、图片、视频与运营内容创作的本地桌面工作台，包含智能创作对话、无限画布、3D导演台和操作教程。

## 下载与运行

请查看本仓库 Releases 页面中的版本说明和适用系统信息。源码下载与安装包是两种不同使用方式，下载源码后仍需安装依赖。

**兼容性状态：**0.1.1 Windows 11 x64 安装包已完成本机安装、启动和空数据检查。Windows 10 Home 22H2 上的 0xC000007B 故障尚未完成现场根因定位，不能将其视为已修复。当前安装包没有发行者签名。

请查看 [WorkBuddy 接手说明](docs/WORKBUDDY.md) 和 [Windows 故障处理](docs/WINDOWS.md)。

## 本地开发

需要 Git、Node.js 至少 22.12.0，以及 npm。Windows 使用与操作系统相符的 x64 环境；不要使用 --omit=optional 安装，否则原生依赖可能不完整。

~~~powershell
git clone https://github.com/Lin121-arch/tangmen-aigc-workbench.git
cd tangmen-aigc-workbench
npm.cmd ci
npm.cmd run setup:runtime
npm.cmd run dev
~~~

setup:runtime 显式完成 Electron 运行时安装；dev 和 test 也会先检查这一步，避免首次并行加载争抢下载。下载失败时先解决具体网络错误，不要跳过后声称已安装。

dev 与 build 默认使用 student 模式：应用初始模型服务为空，不预填维护者连接信息。对话、图片、视频需要使用者自行配置有相应权限的服务；读取到模型名称不代表已经获得生成权限。Codex 或 Claude 原生 Agent 还需要使用者自己的运行环境与认证。

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
~~~

build 生成渲染进程、主进程和 preload，不直接创建安装包。Windows 安装包使用 package:windows，并必须传入已按官方 SHA-256 校验的 Electron 42.11.18 x64 解压目录：

~~~powershell
npm.cmd run package:windows -- --electron-dist=C:\verified-electron-runtime
~~~

打包流程会从微软固定版本地址下载 VC++ 运行库，并在打包前校验 SHA-256；下载或校验失败会停止。不能把构建成功当作安装或启动成功。发布前还需检查实际安装包、Portable、独立用户数据目录与目标操作系统。

## 工作区

- 智能创作：对话、图片与视频共用输入区域，支持选择已配置模型和参考图。
- 无限画布：通过入口进入，可组织素材、提示词和节点连接。
- 3D 导演台：用于人物站位、空间路线和镜头预演；预演不等同于模型生成的最终成片。
- 内置教程：包含提示词、画布和导演台操作，案例效果仍需逐项检查。

修改中的源代码不保证稳定。更新前备份自己的项目与设置，先在独立副本中试用；暂未配置本仓库的自动更新发布渠道。

## 数据与隐私

仓库不包含维护者的账户、API 连接、密钥、项目、聊天或生成素材。应用运行后由使用者自行配置并保存本机数据。API 请求会发送到使用者选择的供应商，不保证所有供应商采用相同的数据政策。

提交前运行 npm.cmd run audit:source。不要提交 .env、settings/model-services、工作区、日志、截图或带密钥的接口示例。忽略规则不能代替审查已暂存文件。

## 来源与许可

本项目基于 AIGC CANVAS 的既有 Electron/React 工作台代码继续开发，保留原始 MIT 版权声明。唐门 AI 新增和调整智能创作界面、多供应商配置、教程、工作流模板及导演台功能；不将上游项目宣称为完全独立原创。

源码许可见 [LICENSE](LICENSE)，素材、模板、模型及其他依赖的来源和单独许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本公开版本不包含旧 UE 人物 GLB；内置演员使用随附许可的 Storyboarder 资源。软件许可不替使用者取得第三方模型账号、素材和生成内容的权利。
