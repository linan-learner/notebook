# 线上部署说明

项目是 **前端静态资源 + 后端 Node 服务**，需要分开部署：  
**GitHub Pages 只托管前端**；数据库、HTTP API、WebSocket 要在 **云主机 / PaaS** 上运行后端。

整体流程：**先部署后端拿到 HTTPS 地址 → 再带环境变量构建前端 → 把 `dist` 发布到 GitHub Pages（或其它静态托管）。**

---

## 第一步：部署后端（任选一种平台）

常见选择：[Render](https://render.com/)、[Railway](https://railway.app/)、[Fly.io](https://fly.io/) 等，思路相同：

1. 新建 **Web Service**，连接你的 GitHub 仓库。
2. **Root Directory** 选 `backend`（若平台支持）。
3. **Build**：`npm install`
4. **Start**：`npm start`（即 `node index.js`）
5. **环境变量**（在平台面板里设置）：
   - `PORT`：多数平台会自动注入，可不写或填平台给的端口。
   - `JWT_SECRET`：**务必改成随机长字符串**（不要用仓库里的默认值）。

部署成功后你会得到一个公网地址，例如：`https://notebook-api-xxxx.onrender.com`（下文用 `https://你的后端` 代替）。

说明：

- 默认使用 **SQLite** 文件库；部分云平台磁盘**重启会清空**，只适合演示。正式运营建议换云数据库。
- 后端已开启 **CORS**（`origin: true`），一般允许浏览器从 `https://linan-learner.github.io` 访问你的 API。

---

## 第二步：本地构建前端（写入线上后端地址）

在 `frontend` 目录新建 **`.env.production`**（可参考 `frontend/.env.production.example`）：

```env
VITE_API_BASE=https://你的后端
VITE_WS_URL=wss://你的后端
```

注意：

- 页面是 **HTTPS** 时，接口也必须是 **HTTPS**，WebSocket 用 **wss://**（与 `https://` 同主机，只是把协议换成 `wss`）。
- **不要**在末尾多加一个 `/`。

然后构建：

```bash
cd frontend
npm install
npm run build
```

生成目录：`frontend/dist/`。  
本仓库已为 GitHub Pages 配置 `base: '/notebook/'` 与 **Hash 路由**，访问形态为：  
`https://linan-learner.github.io/notebook/#/...`

---

## 可选：用 Vercel 部署前端（替代 GitHub Pages）

与 GitHub Pages 二选一即可。Vercel 上站点通常在**域名根路径**，构建时需指定 `VITE_BASE=/`：

1. 登录 [vercel.com](https://vercel.com)，用 GitHub 授权。
2. **Add New Project** → 导入仓库 `notebook`。
3. **Root Directory** 选 **`frontend`**。
4. **Environment Variables**（构建前配置）：
   - `VITE_BASE` = `/`（静态资源从根路径加载，必配）
   - `VITE_API_BASE` = `https://你的 Render 后端`（不要末尾 `/`）
   - `VITE_WS_URL` = `wss://你的 Render 后端`
5. **Build Command**：`npm run build`，**Output Directory**：`dist`（Vite 默认）。
6. Deploy。

完成后访问形如 `https://xxx.vercel.app`。后端仍建议部署在 **Render**（见上文）。

---

## 第三步：发布 `dist` 到 GitHub Pages

### 做法 A：用 `gh-pages` 工具（推荐）

```bash
cd frontend
npm run build
npx gh-pages -d dist
```

然后在 GitHub 仓库 **Settings → Pages**：

- **Source**：选分支 **`gh-pages`**，目录 **`/ (root)`**
- 保存后等待几分钟，访问：  
  **https://linan-learner.github.io/notebook/**

### 做法 B：手动

把 `dist` 里**所有文件**拷到仓库的 `gh-pages` 分支根目录，推送即可。

---

## 常见问题

| 现象 | 可能原因 |
|------|----------|
| 页面空白、JS 404 | `vite.config.js` 里 `base` 与仓库名不一致，或 Pages 源分支不对。 |
| 能打开页，但登录请求失败 | 未设置 `VITE_API_BASE`，或地址写错、混用 http/https。 |
| 协作不实时 | 未设置 `VITE_WS_URL`，或用了 `ws://` 而页面是 `https`。 |
