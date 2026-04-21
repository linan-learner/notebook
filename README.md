# 多多记账

前后端分离的 Web 记账应用：支持多账本（本人 / 协作）、好友关系、收支流水与报表；协作场景下含实时通知与数据同步。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3、Vue Router（Hash 模式）、Pinia、Vite |
| 后端 | Node.js、Express、SQLite、WebSocket（协作推送） |
| 鉴权 | JWT |

## 目录结构

```
notebook/
├── frontend/          # 前端（Vite + Vue）
├── backend/           # 后端 API + WebSocket
├── docs/              # 补充文档（如部署说明）
└── README.md
```

## 环境要求

- [Node.js](https://nodejs.org/) 建议 **18+**
- npm（随 Node 安装）

## 本地运行

### 1. 后端

```bash
cd backend
npm install
npm run dev
```

默认监听 **http://localhost:3000**。  
数据库文件位于 `backend/data/`（首次运行会自动创建，已在 `.gitignore` 中忽略，勿提交到 Git）。

可选环境变量（生产环境务必修改密钥）：

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 服务端口 | `3000` |
| `JWT_SECRET` | JWT 签名密钥 | 开发用占位字符串 |
| `DB_PATH` | SQLite 文件路径（建议生产挂载持久磁盘目录） | `backend/data/notebook.db` |

示例（PowerShell）：

```powershell
$env:JWT_SECRET="你的强随机字符串"; npm run dev
```

### 2. 前端

另开一个终端：

```bash
cd frontend
npm install
npm run dev
```

默认 **http://localhost:5173**。  
开发时通过 `vite.config.js` 将 `/api`、`/ws` **代理到** `http://localhost:3000`，与后端联调。

### 3. 生产构建（前端）

```bash
cd frontend
npm run build
```

产物在 `frontend/dist/`。  
部署到 **GitHub Pages** 时，仓库名为 `notebook`，已配置 `base: '/notebook/'`，且路由为 **Hash 模式**，避免子路径刷新 404。

## GitHub 仓库

- 主页：<https://github.com/linan-learner/notebook>

## 线上地址（已部署）

- 前端（GitHub Pages）：<https://linan-learner.github.io/notebook/#/login>
- 后端（Render API）：<https://notebook-backend-n8d1.onrender.com/api/health>

## 线上部署

前端需静态托管，后端需单独部署；完整步骤见：**[docs/DEPLOY.md](docs/DEPLOY.md)**（含环境变量、`gh-pages` 发布与常见问题）。

Render（或同类平台）使用 SQLite 时，建议为后端服务挂载 **Persistent Disk**，并设置：

```bash
DB_PATH=/var/data/notebook.db
```

这样实例重启/重新部署后，用户与流水数据不会因为临时文件系统而丢失。

### 线上环境变量（后端）

| 变量 | 示例值 | 说明 |
|------|--------|------|
| `PORT` | `3000`（由 Render 注入） | 服务监听端口 |
| `JWT_SECRET` | `请替换为强随机密钥` | 登录态签名密钥 |
| `DB_PATH` | `/var/data/notebook.db` | SQLite 持久化数据库路径 |

### 前端发布更新（已验证）

```bash
cd frontend
npm run build
npx gh-pages -d dist
```

发布后若页面仍请求旧地址，先使用无痕窗口或强制刷新（`Ctrl + Shift + R`）清缓存再测试。

---

## 许可证

个人学习 / 项目使用请按需补充许可证说明。
