# 个人名片网站

在线地址：https://charlie4399828-cpu.github.io/person-web/

## 全设备数据同步

**GitHub Token 不能写进网页**（会被公开，且 GitHub 会拦截推送）。

请使用 **Supabase 云端同步**，详细步骤见：

👉 **[supabase/云端同步配置说明.md](./supabase/云端同步配置说明.md)**

你需要手动粘贴到 **`data.js`** 的只有这三项（均为公开、可提交到 GitHub）：

```javascript
cloudSync: {
  supabaseUrl: "",       // Supabase → Settings → API → Project URL
  supabaseAnonKey: "",   // Supabase → Settings → API → anon public
  saveFunctionUrl: "",   // 部署 save-card 函数后的地址
},
```

写入密码 `763560` 配置在 **Supabase 服务端 Secrets**（`CARD_EDIT_PASSWORD`），不会出现在前端代码里。

## 部署更新

```powershell
cd D:\Code\person_web
git add .
git commit -m "更新说明"
git push
```
