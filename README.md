# 个人名片网站

在线地址：https://charlie4399828-cpu.github.io/person-web/

## 功能

- 响应式名片展示，手机 / 电脑均可浏览
- 页面内展示**扫码访问二维码**（固定链接）
- 图片本地上传（头像、微信二维码）
- 密码保护编辑（双击标题「个人名片」）
- **云端同步**：保存后写入 `card-data.json`，所有设备看到相同内容

## 全设备数据同步（必做一步）

网页编辑默认只存本机。要手机改、电脑也能看到，需配置 **GitHub Token**：

1. 打开 GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. 生成 Token，勾选 **`repo`** 权限
3. 编辑 `data.js`，填入：

```javascript
githubSync: {
  token: "你的Token",
  owner: "charlie4399828-cpu",
  repo: "person-web",
  branch: "main",
  path: "card-data.json",
},
```

4. 提交并推送 `data.js`（Token 只提交一次）
5. 之后在任意设备编辑并保存，会自动同步到 `card-data.json`
6. 其他设备**刷新页面**即可看到最新内容

> Token 会出现在公开仓库代码中，请使用仅用于此项目的 Token，可随时在 GitHub 撤销。

## 部署更新

```powershell
cd D:\Code\person_web
git add .
git commit -m "更新说明"
git push
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `data.js` | 默认数据、密码、站点 URL、GitHub 同步配置 |
| `card-data.json` | 云端共享的名片数据（自动生成/更新） |
| `index.html` | 页面结构 |
| `app.js` | 逻辑 |
| `styles.css` | 样式 |
