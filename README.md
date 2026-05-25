# Love Note Flashcards

一个静态网页心情记录器，入口文件是 `index.html`，可直接部署到 GitHub Pages。

## 数据保存

- 心情次数、文字记录和上传图片会保存在访问者当前浏览器的 `localStorage` 中。
- 上传图片会转成 base64 后和记录一起保存，因此刷新页面后仍可查看。
- GitHub Pages 是静态托管，不能把用户在网页里上传的图片直接写回 GitHub 仓库。若需要多人共享、云端同步或真正保存到项目文件中，需要增加后端服务或对象存储。

## 本地预览

直接用浏览器打开 `index.html` 即可。
