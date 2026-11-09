# 开发与发布约定

## 模型配置分区（2026-11-09）

- 设置分为模型服务、本机智能体、默认模型、高级设置四个入口；常用页只显示已添加厂商和当前用途，模型参数按行展开，旧版连接放入高级设置。
- `src/pages/settings.css` 使用现有语义主题变量，浅色与深色同步。厂商目录仅在添加服务时显示，唐门第三方品牌仍为 TangMen。
- 切换栏目时保持 ModelServicesSettings 挂载、配置草稿与发现结果；图片/视频密钥、provider/model ID、legacyAliases 和原项目绑定保持原语义。填写自定义地址不能自动收起正在编辑的连接表单。
- `test/e2e/settings-layout.spec.ts` 验证隔离 profile 下分区、草稿、独立密钥和默认模型保存；模型服务与关闭窗口测试继续覆盖本地模拟请求、旧绑定和失败保存保护。截图只使用测试数据，不输出真实 Key。



## 浅色 / 深色外观（2026-11-09）

- 标题栏 GitHub 图标旁提供主题切换，主题由 `src/stores/theme.store.ts` 管理，仅保存到当前用户数据目录的 localStorage（`tangmen.appearance.theme`）。默认保留深色；重启恢复用户选择，不写入模型配置和工程。
- `src/theme.css` 集中定义语义颜色及旧界面的浅色兼容；聊天、模型设置、画布、导演台操作面板和 Windows 标题栏同步切换。禁止通过 filter/invert 修改媒体、画板作品或 Three.js 场景颜色。
- `app:setTheme` 仅接受 light/dark，主进程核对发送窗口；preload、共享通道和主进程同时维护。启动遮罩读取同一外观选择。
- `test/e2e/theme.spec.ts` 在隔离 profile 验证切换、原生标题栏主题、重启记忆、配置不变、画布/导演台渲染和 3D 像素保持；可通过 TANGMEN_TEST_APP_ROOT 验证本机源代码构建。此验收不替代 Windows 10 安装包验收。


## 2026-11-09 模型预设与导演台渲染

- 用户已授权 TangMen 使用供应商公开接口作为预设：图片 `https://image.luna.it.com/v1`，视频 `https://img.luna.it.com`；仅地址可以公开，真实 Key、历史、画布和本机配置不得进入仓库。新用户的已连接服务商列表仍为空。
- 厂商目录位于 `shared/provider-presets.ts` 和 `components/ProviderCatalog.tsx`。第三方显示品牌仅为 TangMen；官方预设只添加当前适配的协议。Anthropic 原生 Messages 尚未适配，卡片引导本机 Claude Code，不能误报为云端已接通。
- `settings:detectLocalAgents` 只执行 Codex/Claude Code 的版本与登录状态查询，不提交模型请求。标准原生程序定位在 `agent-installations.ts`，检测与实际运行使用同一路径；未知状态不能推断为已登录。
- `DirectorViewport.tsx` 在导演台懒加载范围内管理首帧就绪、15秒加载失败提示、WebGL连接中断和局部重载。视图失败时仍可保存工程，未就绪禁止截图/导出。验收必须等待真正的画面，不能只断言 DOM 中存在 canvas，也不能在 Three.js 初始化前用 getContext 创建测试上下文。

本目录为唐门AIGC工作台的公开源码，不含维护者运行数据。不要在仓库中保存个人模型连接、密钥、聊天、项目、生成结果或诊断输出。

- `npm ci`安装依赖并保留optionalDependencies。`npm run dev`和`npm run build`默认student模式，保持初始供应商、密钥与连接地址为空。
- 主进程位于`electron/main`，preload位于`electron/preload`；共享IPC类型与通道位于`src/shared`。修改IPC应同时更新handler、共享类型、通道和preload。
- 界面位于`src`，导演台位于`src/features/director`，公开教程与模板随应用分发。
- 保存和异步回写应校验当前项目，不因保存失败清空用户数据；未知生成任务先查询，不能自动重复提交计费请求。
- 不添加未经许可的模型资源；保留第三方署名。旧UE GLB未分发，不要通过通用构建恢复该模型选项。
- 类型检查、测试和构建必须通过后再发布。源码测试不替代实际安装包在目标系统上的安装、启动、退出和空数据检查。
- Windows 10的0xC000007B尚未闭环，程序未签名，不得编造兼容性或签名结论。
- 提交前运行`npm run audit:source`并审查Git暂存清单。此扫描只提供辅助，不构成全部安全保证。
- 不把任何人的真实API Key填进测试。使用公开占位地址或本地模拟服务，不擅自调用计费生成。
- 当前没有本仓库的自动更新渠道。未经维护者确认，不将更新源指向上游仓库或其他发布者。
- 全局标题栏提供 GitHub 图标，使用现有 HTTPS 外链处理在系统浏览器打开本仓库；保留 no-drag 点击区域和 Windows 原生窗口按钮预留空间。
