# Blocky

React + TypeScript + Vite + Cloudflare Workers 头像站。Worker 名称保持 `blocky`，沿用 GitHub / Cloudflare 自动部署。

现已支持上传照片 → RTX 5090 生成 Blocky 3D 人物和 Minecraft 风格背景 → 预览、下载 1024 × 1024 PNG。其他三种风格显示 Soon。人物相似度与细节受模型能力影响。

## 网站与本地 GPU

网站：https://blocky.wd1998313.workers.dev

浏览器通过同源 Worker 接口提交图片；电脑主动建立经过密钥认证的 WebSocket，调用本机 ComfyUI。无需开放路由器端口，无需 R2，无需公开 ComfyUI。

1. 打开 ComfyUI Desktop 的本地实例，确认地址为 `http://127.0.0.1:8188`。
2. 在项目目录运行 `npm run runner:start`，后台连接网站。
3. 打开网站上传照片并生成；日志在 `.blocky/runner.log` 和 `.blocky/runner-error.log`。
4. 停止网站使用 GPU 时运行 `npm run runner:stop`。它不会关闭 ComfyUI。

电脑重启后需重新打开 ComfyUI 并启动连接程序。本版没有安装开机服务。也可运行 `npm run runner` 在当前终端查看日志。电脑休眠、ComfyUI 关闭或连接程序断线时，网站显示离线，无法生成或读取结果。

## 数据保留

- 不将照片或结果写入云端存储。图片经过 Cloudflare 实时中转；这并非浏览器内生成。
- ComfyUI 在本机 input / output 保存照片和结果，**本版不会自动删除这些图片**。请管理员定期清理。
- 云端 SQLite Durable Object 仅保存任务状态、会话所有权、限额计数和在线状态。任务链接 24 小时后过期，清理闹钟随后移除元数据。没有云端图片历史。
- `.blocky/jobs.json` 保存本地任务与 ComfyUI 文件的对应关系，便于连接程序重启后读取结果；`.blocky/active.json` 保存未完成任务。均不提交 Git。
- 浏览器通过 HttpOnly cookie 读取自己的任务。关闭页面不会取消已提交的生成；刷新后没有历史恢复界面。请及时下载结果。
- 图片上限 10 MB，仅支持 JPG / PNG / WebP。每会话最多一个生成中任务，全局最多三个；每 IP 每小时最多十次，全站每日最多一百次（按时间窗口），失败提交也计入限额。适合第一版试运行。

## 首次配置或迁移电脑

需要 Node.js 22.13+、ComfyUI 和以下模型：

- `diffusion_models/flux-2-klein-base-4b-fp8.safetensors`
- `text_encoders/qwen_3_4b.safetensors`
- `vae/full_encoder_small_decoder.safetensors`

执行 `npm ci`。将 `.env.runner.example` 复制为 `.env.runner.local`，填写网站地址和随机密钥。该文件已被 Git 忽略。使用 `wrangler secret put GPU_RUNNER_TOKEN` 在 Worker 配置相同密钥。不要将真实密钥放入前端、Git 或聊天。

工作流模板为 `server/workflows/minecraft.json`；提示词与方形输出位于 `server/workflow.ts`。原始 `blocky-minecraft-api.json` 含个人照片文件名，已忽略，不发布。

## 开发与验证

```powershell
npm run dev
npm run build
npm run lint
npm run test:local
```

开发页面通过 `/local-api` 直接调用本机 ComfyUI，不经过公网。可在 `.env.local` 设置 `COMFYUI_URL`。接口只接受本机地址和同源调用。

构建后的页面调用 `/api/generation`。测试云端中转时，将 `.dev.vars.example` 复制为 `.dev.vars`，填写测试密钥，运行 `npm run preview`；另开连接程序，指向预览地址并使用相同测试密钥。接口测试使用模拟 ComfyUI，不消耗 GPU。

```powershell
npm run cf-typegen
npm run deploy
```

Worker 使用 `ASSETS` 静态资源与 `GENERATION_RELAY` SQLite Durable Object，首次部署应用 `v1-generation-relay` 迁移。不需要 R2。生产密钥由 Cloudflare Secrets 管理，不注入前端。不要把测试密钥用作生产密钥。
