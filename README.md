# 个人名片网站

响应式中文个人名片页，支持手机与电脑浏览，一键保存为 PNG 图片。

## 部署前准备

1. **编辑 `data.js`**，填入你的真实姓名、职位、联系方式等（部署后所有访客可见）
2. **准备图片**（可选，放到项目根目录）：
   - `avatar.jpg` — 头像
   - `wechat-qr.png` — 微信二维码
3. 修改 `data.js` 中的 `editPassword` 为你的管理密码（默认 `763560`）

## GitHub Pages 部署（方案一）

### 1. 创建 GitHub 仓库

登录 [GitHub](https://github.com)，新建仓库，例如 `person-web`，设为 **Public**。

### 2. 推送代码

在项目目录执行（将 `你的用户名` 换成你的 GitHub 用户名）：

```powershell
cd d:\Code\person_web
git init
git add .
git commit -m "个人名片网站上线"
git branch -M main
git remote add origin https://github.com/你的用户名/person-web.git
git push -u origin main
```

### 3. 开启 GitHub Pages

仓库 → **Settings** → **Pages** → **Build and deployment**：

- Source: **Deploy from a branch**
- Branch: **main** / **/ (root)**
- 点击 **Save**

约 1～2 分钟后访问：

```
https://你的用户名.github.io/person-web/
```

## 本地预览

```bash
npx serve .
```

## 使用说明

- **访客**：「获取联系方式」查看电话、微信号、二维码；「保存为图片」下载名片
- **管理员**：**双击页面标题「个人名片」** → 输入密码 → 编辑名片
- 网页内编辑的内容保存在**当前浏览器**；要让别人看到更新，请改 `data.js` 后重新 `git push`

## 文件说明

| 文件 | 说明 |
|------|------|
| `data.js` | 默认名片数据与管理密码 |
| `index.html` | 页面结构 |
| `styles.css` | 样式 |
| `app.js` | 渲染、验证与导出逻辑 |
