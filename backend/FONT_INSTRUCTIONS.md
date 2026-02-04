# 字体文件说明

## 需要下载的字体文件

由于网络限制，请手动下载 Noto Sans SC 字体文件：

### 方法1：从 Google Fonts 下载
1. 访问：https://fonts.google.com/noto/specimen/Noto+Sans+SC
2. 点击 "Download all"
3. 解压后找到 `NotoSansSC-Regular.ttf` 或类似文件
4. 将文件重命名为 `font.ttf`
5. 放入 `backend/` 文件夹

### 方法2：从 GitHub 下载
1. 访问：https://github.com/googlefonts/noto-cjk/tree/main/Sans/OTF/SimplifiedChinese
2. 下载 `NotoSansCJKsc-Regular.otf` 文件
3. 将文件重命名为 `font.ttf`
4. 放入 `backend/` 文件夹

### 方法3：直接下载链接
- GitHub Raw: https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf

## 下载完成后

1. 确保文件名为 `font.ttf`
2. 文件位于 `backend/` 文件夹中
3. 运行 `git add backend/font.ttf` 添加到版本控制

## 字体配置

字体文件将被用于 PDF 导出时的中文字体支持，确保中文内容在 PDF 中正确显示。
