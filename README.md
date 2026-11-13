# @efrencode/pi-status-footer

Pi 的状态脚注：默认两行，第一行 cwd / git 分支 / session 名，第二行模型、思考等级、上下文占用、token 用量、缓存命中率和成本。

```text
~/Workspace/project/pi/pi-status-footer (main) • 迁移 footer
(opencode-go) deepseek-v4.1-flash • high 18.7%/128k ↑12.3k ↓4.2k R89k W1.2k CH92.4% $0.034
```

只读取会话里已有的 usage 数据，不改工具执行、模型上下文或会话历史。

- 累计整个会话（含其他分支）的 assistant、toolResult、独立 usage、压缩和分支摘要用量。
- 统计和上下文用量在会话、条目、分支或模型变化时重算，重复重绘复用缓存。
- CH 使用最后一条 assistant 的缓存读取占提示 token 的比例；仅有缓存读写用量且该比例可计算时显示。
- 窄终端优先保留模型与上下文，省略 provider、截短过长模型，再按空间显示次要指标；不显示自动压缩标记。
- 有 `setStatus()` 状态时追加第三行，按 key 排序并合并为单行，保留 ANSI 配色，超宽截断；无状态不加空行。

## 安装

```sh
pi install npm:@efrencode/pi-status-footer
```

本地开发时可直接指向项目目录：

```sh
pi install ~/Workspace/project/pi/pi-status-footer
```

## 配置

无配置项，非 TUI 模式不注册。

## 开发

```sh
npm install
npm run typecheck
npm run pack:check
```

显示效果需在终端中人工确认，包括窄屏、中文、ANSI 配色、主题及会话切换。

## 许可证

[MIT](LICENSE)
