# 开发与 GitHub 上传

维护者：yuling。本文说明如何上传源码、在本机启动，以及构建包含定制后端的 Mac 应用。

源码包含桌面端和后端。可以按本文在本机启动，或构建包含当前源码功能的 Mac 应用。

解压后，请保留以下目录关系。后面的命令都以 `aipm-workbench` 为项目根目录。

```text
aipm-workbench/
├── README.md
├── AionUi/       # Electron 桌面端与前端
├── AionCore/     # Rust 后端与接口
├── docs/         # 产品与开发资料
├── LICENSE
└── NOTICE
```

## 1. 上传到自己的 GitHub

上传源码不需要先安装开发环境。

1. 从[下载页](https://github.com/yuling170916/aipm-workbench/releases/tag/aipm-2026.10.10)获取 `AIPM-workbench-yuling-source.zip` 并解压，找到其中的 `aipm-workbench` 文件夹。本地交付的同一源码包名为 `AIPM工作台-yuling-GitHub源码.zip`。
2. 打开 GitHub Desktop，登录自己的 GitHub 账号。
3. 选择 **File → Add Local Repository**，选中这个文件夹。若提示它还不是 Git 仓库，按提示在此创建仓库；确认仓库根目录直接包含 `README.md`、`AionUi` 和 `AionCore`，避免额外嵌套一层空目录。
4. 查看待提交文件，填写提交说明并提交。源码包已排除依赖、编译缓存和个人数据；继续开发时也请保留 `.gitignore`，不要提交 API Key、账号凭据或私人会话。
5. 点击 **Publish repository**。仓库名可以使用 `aipm-workbench`，选择发布到自己的账号，并按需要选择公开或私有。
6. 发布后打开仓库网页，确认首页显示根目录的 README，且 `AionUi`、`AionCore`、`docs`、`LICENSE` 与 `NOTICE` 都在同一层。

本项目的源码位于 [AIPM工作台仓库](https://github.com/yuling170916/aipm-workbench)，仓库根目录直接包含 `README.md`、`AionUi`、`AionCore` 和 `docs`。安装包 `AIPM-workbench-mac-arm64.dmg`、源码压缩包 `AIPM-workbench-yuling-source.zip`、UI 设计包及手册位于 [GitHub 下载页](https://github.com/yuling170916/aipm-workbench/releases/tag/aipm-2026.10.10)。上述 GitHub Desktop 步骤也适用于将源码单独发布到自己的仓库。GitHub Desktop 操作可参照 [GitHub 官方上传说明](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop)。

源码包没有嵌套 `.git`，两个子项目可以放在一个仓库中。上游 CI 工作流保留在各自子目录，尚未改造成此合并仓库的自动发布流程；发布源码后不会自动构建 Mac 应用。

## 2. 准备本地开发环境

以下启动与打包命令面向 **Apple 芯片 Mac**。准备 Node.js 22～24、Bun 和 Rust；Rust 版本由 [rust-toolchain.toml](../AionCore/rust-toolchain.toml) 固定。首次构建还需要 macOS 命令行开发工具，尚未安装时执行：

```bash
xcode-select --install
```

下载依赖和准备运行时需要联网。`AionUi` 与 `AionCore` 必须保留同级目录关系，桌面端才能使用本文指定的本地后端。

## 3. 在本机启动

在解压后的 `aipm-workbench` 目录打开终端，依次执行：

```bash
cd AionCore
cargo build --bin aioncore --locked
cd ../AionUi
bun install --frozen-lockfile
AIONUI_BACKEND_BIN="../AionCore/target/debug/aioncore" bun run start
```

最后一行会打开桌面应用。`AIONUI_BACKEND_BIN` 明确指定刚编译的定制后端，确保后端与当前桌面端源码配套。

首次安装若提示 `better-sqlite3` 的 Electron 版本不匹配，在 `AionUi` 目录执行以下命令，然后重新运行上面的最后一行：

```bash
bunx electron-builder install-app-deps
```

需求手工编辑、规则体检、版本记录与导出可以直接使用。AI 对话、AI 整理、AI 体检及模型对比需要在设置中填写自己的模型服务与 API Key；本源码包不附带服务额度。密钥保存在应用本机数据中，请勿上传到 GitHub。模型对比的接口支持范围见[使用说明](../AionUi/docs/guides/model-bench.zh-CN.md)。

## 4. 构建带定制后端的 Mac 应用

重新在 `aipm-workbench` 根目录打开终端。先编译 Rust，再导出完整本地后端包，最后打包桌面端：

```bash
cd AionCore
cargo build --release --bin aioncore --locked
cd ..
mkdir -p AionCore/target/local-bundle
cp AionCore/target/release/aioncore AionCore/target/local-bundle/aioncore
AionCore/target/release/aioncore \
  --data-dir AionCore/target/bundle-preparation \
  prepare-managed-resources \
  --bundle-out AionCore/target/local-bundle/managed-resources
cd AionUi
bun install --frozen-lockfile
AIONUI_BACKEND_LOCAL_BUNDLE_DIR="$(cd ../AionCore/target/local-bundle && pwd)" \
  CSC_IDENTITY_AUTO_DISCOVERY=false \
  bun run build-mac:arm64
```

成品位于 `AionUi/out`。`AIONUI_BACKEND_LOCAL_BUNDLE_DIR` 指向的目录同时包含 `aioncore` 和 `managed-resources`，打包脚本会优先采用这份完整本地包。

请保留 `prepare-managed-resources` 步骤，它提供应用运行需要的配套资源。只设置 `AIONUI_BACKEND_LOCAL_BINARY` 会进入下载失败后的后备路径，完整本地后端包请使用 `AIONUI_BACKEND_LOCAL_BUNDLE_DIR` 指定。

上述命令生成本地签名的应用。面向公众分发所需的 Apple 开发者签名与公证，需要由仓库维护者另行配置。

## 5. 源码范围与相关资料

源码包保留运行源代码、必要资源、测试、文档、许可证，以及 `Cargo.lock` / `bun.lock`。安装后的依赖、编译缓存、个人配置、密钥、聊天记录和自动下载的后端二进制不随源码提供。

上游 README 使用的大体积 GIF/MP4 演示文件已从源码包移除，相应演示入口改为上游在线链接；这些文件不参与应用运行或构建。完整范围见[打包说明](../打包说明.md)。

- [产品介绍与使用场景](../README.md)
- [桌面端文档](../AionUi/readme.md) · [前端脚本](../AionUi/package.json)
- [后端架构](../AionCore/ARCHITECTURE.zh-CN.md) · [后端任务](../AionCore/justfile)

AIPM工作台由 yuling 设计、开发与维护，基于 AionUi / AionCore 的开源基础架构与通用能力。上传、修改或分发时，请保留上游版权声明以及 [LICENSE](../LICENSE)、[NOTICE](../NOTICE)、[AionUi/LICENSE](../AionUi/LICENSE) 和 [AionCore/LICENSE](../AionCore/LICENSE)。产品署名不改变上游代码与素材的版权归属。
