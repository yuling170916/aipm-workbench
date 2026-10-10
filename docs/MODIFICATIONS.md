# 本分支修改记录

产品设计、开发与维护：yuling。

以下修改基线清单通过记录时的源码与本机上游检出基线逐文件比对生成。“新增”指相对基线新增，不表示文件中的所有内容均独立原创。版权署名仅覆盖作者享有权利的贡献；上游版权声明保留。

## 2026-10-10 README 与品牌介绍

按蓝绒獭配图方向，重写仓库首页 README，加入 Logo、品牌场景插画和已确认的首页设计图（示例内容）。正文围绕需求整理、PRD 起草、评审、变更核对与模型比较展开，明确快捷卡预填草稿、助手与模型分别选择、需求卡由使用者保存和确认。

新增 `docs/readme-assets/aipm-product-intro.png` 与 `docs/开发与GitHub上传.md`，将完整 Mac 后端打包和 GitHub 上传步骤放到独立指南；产品署名继续统一为 yuling。此次仅更新文档与介绍素材，不改变应用代码。

## 2026-10-10 已确认 UI 落地与 GitHub 交付

本轮按用户确认的 UI 图与规范调整界面，产品设计、开发与维护署名继续统一为 yuling。

- 通用按钮使用白底浅蓝边框的默认态、实蓝白字的选中/主操作态；统一 16px 图标、22px 图标槽、8px 图文间距与 12px 圆角。保留明暗主题、禁用和加载反馈。
- 首页与设置侧栏使用同一导航样式。首页将助手、材料、模型/权限、项目和发送入口整理到输入卡底部，保留原有上传、语音、技能/MCP、草稿和快捷工作流行为。
- 桌面宠物改用 Logo 同款蓝绒獭，当前为静态 IP 加轻量交互反馈；保留拖拽、尺寸调整、勿扰和确认气泡。
- 新文案覆盖全部 13 个语言包。仓库加入 50 张已确认的 UI 参考图、可离线浏览的索引与首页/设置规范；PNG 保留原始确认稿示例内容，实际界面读取本机配置与真实数据。
- GitHub 源码包包含前后端、资源、测试、文档与锁文件，移除安装依赖、构建缓存、私人配置、密钥和会话数据。包内不包含嵌套 Git 历史；保留原有许可证与版权声明。

验证：相关首页/导航、设置/需求、宠物测试分别通过；全仓 TypeScript、i18n、Lint、CSS/格式检查和桌面端生产构建通过。使用独立临时配置实测首页、4 个主要入口和 10 个设置页面，检查选中态、真实草稿填充、yuling 关于页及桌面宠物图片加载；无页面脚本错误、横向溢出或损坏图片。

主要源码范围：`AionUi/packages/desktop/src/renderer/pages/guid`、`components/layout/Sider`、`pages/settings/components/SettingsSider.tsx`、通用主题与 Arco 控件样式、需求/模型对比页面样式、`pages/settings/PetSettings.tsx`、`pet`、13 个语言包及相关测试。

## 2026-10-09 产品署名更新

产品文档、应用关于页、软件包作者、应用版权与 Linux 维护者统一使用 yuling 署名；移除旧个人账号与联系方式。Mac 应用资源中附带本项目 NOTICE 及根目录、AionUi、AionCore 的 LICENSE。产品截图展示实际蓝绒獭界面。上游和第三方的许可证、版权声明与归属继续保留。

## 2026-09-18 修改基线

当次文档更新新增产品 README、作者与版权说明及实际产品界面截图，未改变功能源码。以下文件清单记录该日期与上游基线的比对结果。

## AionUi

上游： https://github.com/iOfficeAI/AionUi

比较基线：`6744099b279b991c17e31c243f0920477bd31cb6`。共 92 个新增或修改文件。

| 状态 | 文件 |
| --- | --- |
| 修改 | [.gitignore](../AionUi/.gitignore) |
| 新增 | [docs/guides/model-bench.zh-CN.md](../AionUi/docs/guides/model-bench.zh-CN.md) |
| 修改 | [mobile/assets/images/icon.png](../AionUi/mobile/assets/images/icon.png) |
| 修改 | [package.json](../AionUi/package.json) |
| 修改 | [packages/desktop/electron-builder.yml](../AionUi/packages/desktop/electron-builder.yml) |
| 新增 | [packages/desktop/src/common/branding.ts](../AionUi/packages/desktop/src/common/branding.ts) |
| 修改 | [packages/desktop/src/common/config/i18n-config.json](../AionUi/packages/desktop/src/common/config/i18n-config.json) |
| 修改 | [packages/desktop/src/index.ts](../AionUi/packages/desktop/src/index.ts) |
| 修改 | [packages/desktop/src/process/resources/builtinMcp/cdpBridge.ts](../AionUi/packages/desktop/src/process/resources/builtinMcp/cdpBridge.ts) |
| 修改 | [packages/desktop/src/process/resources/builtinMcp/cdpTargetProtocol.ts](../AionUi/packages/desktop/src/process/resources/builtinMcp/cdpTargetProtocol.ts) |
| 修改 | [packages/desktop/src/process/services/i18n/index.ts](../AionUi/packages/desktop/src/process/services/i18n/index.ts) |
| 修改 | [packages/desktop/src/process/utils/appMenu.ts](../AionUi/packages/desktop/src/process/utils/appMenu.ts) |
| 修改 | [packages/desktop/src/process/utils/runBackendMigrations.ts](../AionUi/packages/desktop/src/process/utils/runBackendMigrations.ts) |
| 修改 | [packages/desktop/src/process/utils/tray.ts](../AionUi/packages/desktop/src/process/utils/tray.ts) |
| 修改 | [packages/desktop/src/renderer/assets/logos/brand/app.png](../AionUi/packages/desktop/src/renderer/assets/logos/brand/app.png) |
| 修改 | [packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx](../AionUi/packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx) |
| 修改 | [packages/desktop/src/renderer/components/base/ButlerDiagnoseButton.tsx](../AionUi/packages/desktop/src/renderer/components/base/ButlerDiagnoseButton.tsx) |
| 修改 | [packages/desktop/src/renderer/components/chat/MobileActionSheet/useAttachEntry.tsx](../AionUi/packages/desktop/src/renderer/components/chat/MobileActionSheet/useAttachEntry.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/DocumentTitle.tsx](../AionUi/packages/desktop/src/renderer/components/layout/DocumentTitle.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Layout.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Layout.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Router.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Router.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Sider/index.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Sider/index.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Titlebar/index.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Titlebar/index.tsx) |
| 修改 | [packages/desktop/src/renderer/components/media/FileAttachButton.tsx](../AionUi/packages/desktop/src/renderer/components/media/FileAttachButton.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx) |
| 修改 | [packages/desktop/src/renderer/hooks/assistant/useTalkToButler.ts](../AionUi/packages/desktop/src/renderer/hooks/assistant/useTalkToButler.ts) |
| 新增 | [packages/desktop/src/renderer/hooks/file/useAttachProjectFolders.ts](../AionUi/packages/desktop/src/renderer/hooks/file/useAttachProjectFolders.ts) |
| 修改 | [packages/desktop/src/renderer/hooks/file/useOpenFileSelector.ts](../AionUi/packages/desktop/src/renderer/hooks/file/useOpenFileSelector.ts) |
| 修改 | [packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts](../AionUi/packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts) |
| 修改 | [packages/desktop/src/renderer/hooks/system/notification/useDesktopTurnNotification.ts](../AionUi/packages/desktop/src/renderer/hooks/system/notification/useDesktopTurnNotification.ts) |
| 修改 | [packages/desktop/src/renderer/index.html](../AionUi/packages/desktop/src/renderer/index.html) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/ModelBench.module.css](../AionUi/packages/desktop/src/renderer/pages/ModelBench/ModelBench.module.css) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/client.ts](../AionUi/packages/desktop/src/renderer/pages/ModelBench/client.ts) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/index.tsx](../AionUi/packages/desktop/src/renderer/pages/ModelBench/index.tsx) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/stream.ts](../AionUi/packages/desktop/src/renderer/pages/ModelBench/stream.ts) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/types.ts](../AionUi/packages/desktop/src/renderer/pages/ModelBench/types.ts) |
| 修改 | [packages/desktop/src/renderer/pages/TestShowcase.tsx](../AionUi/packages/desktop/src/renderer/pages/TestShowcase.tsx) |
| 修改 | [packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx](../AionUi/packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx) |
| 修改 | [packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx](../AionUi/packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx) |
| 修改 | [packages/desktop/src/renderer/pages/guid/components/AssistantSelectionArea.tsx](../AionUi/packages/desktop/src/renderer/pages/guid/components/AssistantSelectionArea.tsx) |
| 修改 | [packages/desktop/src/renderer/services/feedback/resolveFeedbackModule.ts](../AionUi/packages/desktop/src/renderer/services/feedback/resolveFeedbackModule.ts) |
| 修改 | [packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts](../AionUi/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts) |
| 修改 | [packages/desktop/src/renderer/services/i18n/index.ts](../AionUi/packages/desktop/src/renderer/services/i18n/index.ts) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/de-DE/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/de-DE/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/en-US/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/en-US/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/es-ES/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/es-ES/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/fa-IR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/fa-IR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/fr-FR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/fr-FR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/ja-JP/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/ja-JP/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/ko-KR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/ko-KR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/pt-BR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/pt-BR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/ru-RU/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/ru-RU/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/tr-TR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/tr-TR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/uk-UA/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/uk-UA/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/zh-TW/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/zh-TW/common.json) |
| 新增 | [packages/desktop/src/renderer/services/i18n/startupLanguage.ts](../AionUi/packages/desktop/src/renderer/services/i18n/startupLanguage.ts) |
| 修改 | [packages/desktop/src/renderer/utils/file/fileSelection.ts](../AionUi/packages/desktop/src/renderer/utils/file/fileSelection.ts) |
| 修改 | [packages/shared-scripts/src/prepare-aioncore.js](../AionUi/packages/shared-scripts/src/prepare-aioncore.js) |
| 修改 | [public/manifest.webmanifest](../AionUi/public/manifest.webmanifest) |
| 修改 | [public/pwa/icon-180.png](../AionUi/public/pwa/icon-180.png) |
| 修改 | [public/pwa/icon-192.png](../AionUi/public/pwa/icon-192.png) |
| 修改 | [public/pwa/icon-512.png](../AionUi/public/pwa/icon-512.png) |
| 修改 | [resources/app.icns](../AionUi/resources/app.icns) |
| 修改 | [resources/app.ico](../AionUi/resources/app.ico) |
| 修改 | [resources/app.png](../AionUi/resources/app.png) |
| 修改 | [resources/app_dev.png](../AionUi/resources/app_dev.png) |
| 修改 | [resources/icon.png](../AionUi/resources/icon.png) |
| 修改 | [tests/unit/assets/prepareAioncoreLocalBundle.test.ts](../AionUi/tests/unit/assets/prepareAioncoreLocalBundle.test.ts) |
| 新增 | [tests/unit/common/branding.test.ts](../AionUi/tests/unit/common/branding.test.ts) |
| 修改 | [tests/unit/common/i18n.test.ts](../AionUi/tests/unit/common/i18n.test.ts) |
| 修改 | [tests/unit/cron/cronUtils.test.ts](../AionUi/tests/unit/cron/cronUtils.test.ts) |
| 修改 | [tests/unit/cron/useCronJobs.dom.test.ts](../AionUi/tests/unit/cron/useCronJobs.dom.test.ts) |
| 修改 | [tests/unit/feedback/resolveFeedbackModule.test.ts](../AionUi/tests/unit/feedback/resolveFeedbackModule.test.ts) |
| 修改 | [tests/unit/releasePackagingConfig.test.ts](../AionUi/tests/unit/releasePackagingConfig.test.ts) |
| 修改 | [tests/unit/renderer/conversation/sendBoxFolderChip.dom.test.tsx](../AionUi/tests/unit/renderer/conversation/sendBoxFolderChip.dom.test.tsx) |
| 修改 | [tests/unit/renderer/documentTitle.dom.test.tsx](../AionUi/tests/unit/renderer/documentTitle.dom.test.tsx) |
| 修改 | [tests/unit/renderer/i18nFormat.test.ts](../AionUi/tests/unit/renderer/i18nFormat.test.ts) |
| 新增 | [tests/unit/renderer/i18nStartup.test.ts](../AionUi/tests/unit/renderer/i18nStartup.test.ts) |
| 修改 | [tests/unit/renderer/layout/LayoutSiderBrandHome.dom.test.tsx](../AionUi/tests/unit/renderer/layout/LayoutSiderBrandHome.dom.test.tsx) |
| 新增 | [tests/unit/renderer/modelBench/comparison.test.ts](../AionUi/tests/unit/renderer/modelBench/comparison.test.ts) |
| 新增 | [tests/unit/renderer/modelBench/page.dom.test.tsx](../AionUi/tests/unit/renderer/modelBench/page.dom.test.tsx) |
| 新增 | [tests/unit/renderer/modelBench/stream.test.ts](../AionUi/tests/unit/renderer/modelBench/stream.test.ts) |
| 修改 | [tests/unit/renderer/updateMigrationInterception.dom.test.tsx](../AionUi/tests/unit/renderer/updateMigrationInterception.dom.test.tsx) |
| 修改 | [tests/unit/renderer/useBrowserNotification.dom.test.tsx](../AionUi/tests/unit/renderer/useBrowserNotification.dom.test.tsx) |
| 修改 | [tests/unit/renderer/useDesktopTurnNotification.dom.test.tsx](../AionUi/tests/unit/renderer/useDesktopTurnNotification.dom.test.tsx) |
| 修改 | [tests/unit/renderer/utils/fileSelection.test.ts](../AionUi/tests/unit/renderer/utils/fileSelection.test.ts) |
| 修改 | [tests/unit/settings/AboutModalContent.dom.test.tsx](../AionUi/tests/unit/settings/AboutModalContent.dom.test.tsx) |
| 修改 | [tests/unit/settings/AssistantSelectionArea.dom.test.tsx](../AionUi/tests/unit/settings/AssistantSelectionArea.dom.test.tsx) |

## AionCore

上游： https://github.com/iOfficeAI/AionCore

比较基线：`f11be9166fd235944ed8214fc18ee1ff254fa324`。共 20 个新增或修改文件。

| 状态 | 文件 |
| --- | --- |
| 修改 | [Cargo.lock](../AionCore/Cargo.lock) |
| 修改 | [crates/aionui-api-types/src/lib.rs](../AionCore/crates/aionui-api-types/src/lib.rs) |
| 修改 | [crates/aionui-api-types/src/provider.rs](../AionCore/crates/aionui-api-types/src/provider.rs) |
| 修改 | [crates/aionui-app/tests/agent_provider_health_e2e.rs](../AionCore/crates/aionui-app/tests/agent_provider_health_e2e.rs) |
| 修改 | [crates/aionui-system/Cargo.toml](../AionCore/crates/aionui-system/Cargo.toml) |
| 修改 | [crates/aionui-system/src/provider.rs](../AionCore/crates/aionui-system/src/provider.rs) |
| 新增 | [crates/aionui-system/src/provider/benchmark.rs](../AionCore/crates/aionui-system/src/provider/benchmark.rs) |
| 新增 | [crates/aionui-system/src/provider/benchmark_tests.rs](../AionCore/crates/aionui-system/src/provider/benchmark_tests.rs) |
| 修改 | [crates/aionui-system/src/routes.rs](../AionCore/crates/aionui-system/src/routes.rs) |
| 修改 | [crates/aionui-system/tests/provider_routes.rs](../AionCore/crates/aionui-system/tests/provider_routes.rs) |
| 修改 | [scripts/just/aionrs-changelog-footer.ps1](../AionCore/scripts/just/aionrs-changelog-footer.ps1) |
| 修改 | [scripts/just/aionrs-changelog-footer.test.ps1](../AionCore/scripts/just/aionrs-changelog-footer.test.ps1) |
| 修改 | [scripts/just/auto-commit-fixes.ps1](../AionCore/scripts/just/auto-commit-fixes.ps1) |
| 修改 | [scripts/just/build.ps1](../AionCore/scripts/just/build.ps1) |
| 修改 | [scripts/just/cargo.ps1](../AionCore/scripts/just/cargo.ps1) |
| 修改 | [scripts/just/cat-config.ps1](../AionCore/scripts/just/cat-config.ps1) |
| 修改 | [scripts/just/install.ps1](../AionCore/scripts/just/install.ps1) |
| 修改 | [scripts/just/update-aionrs.ps1](../AionCore/scripts/just/update-aionrs.ps1) |
| 修改 | [scripts/migration/check-immutability.ps1](../AionCore/scripts/migration/check-immutability.ps1) |
| 修改 | [scripts/migration/check-immutability.test.ps1](../AionCore/scripts/migration/check-immutability.test.ps1) |
