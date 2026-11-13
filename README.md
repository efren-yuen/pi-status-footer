# @efrencode/pi-status-footer

Pi 的两行状态脚注：第一行 cwd / git 分支 / session 名，第二行模型、思考等级、token 用量、缓存命中率、成本和上下文占用。

```text
~/Workspace/project/pi/status-footer (main) • 迁移 footer
(opencode-go) deepseek-v4.1-flash • high ↑12.3k ↓4.2k R89k W1.2k CH92.4% $0.034 18.7%/128k (auto)
```

只读取会话里已有的 usage 数据，不改工具执行、模型上下文或会话历史。

## 安装

```sh
pi install npm:@efrencode/pi-status-footer
```

本地开发时可直接指向项目目录：

```sh
pi install ~/Workspace/project/pi/status-footer
```

## 配置

无配置项。行为与原 `~/.pi/agent/extensions/status-footer.ts` 一致，非 TUI 模式不注册。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run pack:check
```

## 许可证

[MIT](LICENSE)
