<div align="center">

# 🐿️ 松鼠FM · SongshuFM

**浏览器里的播客收听新方式** —— 搜索、订阅、收听、缓存、跨设备同步，一个扩展全搞定。

[![✨ Vibe Coded](https://img.shields.io/badge/✨_Vibe_Coded-AI%20Assisted-8A2BE2)](https://z.ai)
[![Preact](https://img.shields.io/badge/Preact-signals-673AB7?logo=preact&logoColor=white)](https://preactjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

> 🌰 像松鼠囤坚果一样，把喜欢的播客都攒起来。开箱即用，数据自托管，收听不设限。

## ✨ 为什么是松鼠FM

完整的播客体验，塞进一个浏览器扩展里：**点开即用、关掉弹窗音乐不停、订阅与进度多端同步**，且所有数据都存在你自己的设备上——无需注册、无需登录、无人追踪。兼容任意标准 RSS 源，是你浏览网页时的最佳"背景音"伴侣。

## 🎯 核心功能

**🔍 智能发现** — 基于 iTunes 全网检索（单次最多 200 条，模糊匹配）；可按"播客 / 单集"双维度搜索，结果 24 小时本地缓存。

**📻 订阅与更新** — 兼容任意 RSS / Atom 源；定时更新检查配合桌面通知，新单集不再错过；支持 OPML 批量导入（可勾选），从其他客户端无缝迁移订阅。

**🎧 沉浸式播放** — 基于 Offscreen Document 的后台持续播放；1× / 1.5× / 2× 三档变速、±30 秒跳转；自动播放列表、跨设备智能续播、自动连播下一期。

**📥 离线缓存** — 单集音频一键下载，实时进度反馈，缓存管理（查看 / 删除 / 定位文件）。

**☁️ 跨设备同步（WebDAV）** — 支持任意 WebDAV 服务端（坚果云、Nextcloud、自建等）；基于时间戳的字段级智能合并；本地 / 远端同时变更时提供手动裁决；播放停止或定时自动后台同步。

**📊 收听洞察** — 月度收听时长、活跃天数、收听集数统计；按播客的时长排行，看清时间花在哪。

**🎨 体验细节** — 浅色 / 深色 / 跟随系统主题；中文 / English 一键切换；侧边栏常驻与弹窗双模式；收藏与历史支持树形 / 列表双视图。

## 🚀 安装

**从商店安装（推荐）**

- **Microsoft Edge Add-ons**：_(审核中，敬请期待)_
- **Chrome Web Store**：_(即将上线)_

**从源码构建**

```bash
git clone https://github.com/deluo/songshuFM.git
cd songshuFM
npm install

# 构建目标平台（任选其一）
npm run build:edge       # Edge
npm run build:chrome     # Chrome
npm run build:firefox    # Firefox
```

以 Chrome / Edge 为例加载：访问 `chrome://extensions` → 打开"开发者模式" → "加载已解压的扩展程序" → 选择 `dist/chrome` 目录。

打包成 `.zip` 提交商店：`npm run package:edge` / `package:chrome`，产物输出到 `dist/`。

## ⚙️ 开发

```bash
npm run dev          # 启动 Vite 开发服务器（HMR）
npm test             # 运行单元测试
npm run test:watch   # 测试监听模式
npm run typecheck    # TypeScript 类型检查
```

```
src/
├── background/      # Service Worker：消息处理、同步、更新、迁移
│   ├── handlers/    #   按领域拆分的消息处理器
│   └── migrations/  #   IndexedDB 版本迁移
├── offscreen/       # Offscreen 音频引擎
├── popup/           # 弹窗 / 侧边栏 UI（Preact）
│   ├── pages/       #   各功能页面
│   ├── components/  #   可复用组件
│   └── lib/         #   纯函数工具（含单元测试）
├── sidepanel/       # 侧边栏入口
├── data/            # IndexedDB 数据访问层 + Repository
├── feed/            # RSS 解析、搜索、抓取
├── services/        # 业务服务（评论、Feed 同步）
└── lib/             # 跨层共享工具与常量
```

## 🔒 隐私优先

- ✅ **数据本地存储** —— 订阅、历史、收藏全部存于本机 IndexedDB
- ✅ **无需注册账号** —— 开箱即用，不收集任何个人信息
- ✅ **同步你做主** —— 仅在你主动配置 WebDAV 时上传，且数据只发往**你自己**的服务器
- ✅ **开源透明** —— 代码完全公开，可自行审计与构建

## 📄 许可证

本项目基于 MIT License 开源，欢迎自由使用、修改与分发。

---

<div align="center">

**🎧 把播客装进浏览器，让收听回归简单。**

如果松鼠FM对你有帮助，欢迎 ⭐ Star 支持一下！

</div>
