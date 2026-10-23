# dsh-subagent-output-sanitizer

Version 0.1.5 requires DSH 0.2.1-rc.3 or a compatible host. See [compatibility details](docs/dsh-0.2-compatibility.md).

清理子代理消息中的孤立工具块。

在 `agent/created` 完成进入会话后，通过公开 `sessionQuery.readSurface` 一次读取当前模型可见事件，并持久替换不安全的子代理投递。异步读取期间已替换的节点不会恢复；读取失败会中止该次创建。步骤前清洗继续保留，不写入会话创建通知阶段，也不使用已移除的 `session.events`。

## 安装

锁定公开仓库的提交后，通过 DSH 官方入口安装：

```powershell
pnpm dsh plugin --profile web add github:vb2250158/dsh-subagent-output-sanitizer#<commit>
```

插件包声明 `dsh.bundle`，安装后会把自己的配置层加入 profile。

## 配置

插件配置保存在 DSH profile 的 `cordis.patch.yml`。多电脑同步仓库只保存仓库地址、固定提交、启停状态和配置，不保存本仓库源码。

## 验证

```powershell
npm test
npm pack --dry-run
```

Run the source-based rc.3 lifecycle check with `DSH_SOURCE_ROOT=<checkout> node --test tests/session-lifecycle.rc3.integration.mjs`. It covers the real SessionStore announcement, exact surface query, durable replacement and repeated creation notification.

## 许可证

MIT

## Plugin display metadata

The plugin list shows **Subagent output cleanup** in English and **子代理输出清理** in Chinese, following the DSH interface language. `locale/en.json` and `locale/zh.json` provide the title and description; `icon.svg` supplies self-contained artwork. The package exports and publishes these resources. The icon is adapted from Lucide; see [ICON_LICENSE.txt](ICON_LICENSE.txt).

The icon uses a centered 36 × 36 viewBox to leave more space around the artwork inside the plugin icon frame.
