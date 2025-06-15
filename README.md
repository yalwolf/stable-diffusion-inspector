# stable-diffusion-inspector

Stable Diffusion 生成的图片中读取 pnginfo 来获取生成的参数 / Stable Diffusion 模型类别解析
read pnginfo in stable diffusion generated images / inspect models

## 简介

这是一个用于解析 Stable Diffusion 模型文件和图像文件的工具库，可以从模型文件中识别模型类型，并从图像文件中提取生成参数。

## 安装

### NodeJs

```bash
npm install stable-diffusion-inspector
```

或

```bash
yarn add stable-diffusion-inspector
```

### Deno

```bash
deno add jsr:@alwolf/stable-diffusion-inspector
```

## 使用方法

### Node.js

JavaScript

```javascript
const SDMetadataParser = require('stable-diffusion-inspector');
const parser = new SDMetadataParser();
```

TypeScript

```typescript
import SDMetadataParser from 'stable-diffusion-inspector';

const parser = new SDMetadataParser();
```

## 功能特性

- 支持解析多种格式的模型文件（包括 .safetensors）
- 可以识别模型类型
- 能够从 PNG 图像中提取元数据
- 支持 WebP/JPEG/AVIF 格式的图像元数据提取

## API 文档

### 解析模型文件

```javascript
const modelResult = await parser.inspectModel('path/to/model.safetensors');
console.log('模型信息:', modelResult.fileInfo);
```

### 提取图像元数据

```javascript
const imageResult = await parser.inspectImage('path/to/image.png');
console.log('图片元数据:', imageResult.fileInfo);
console.log('图片尺寸:', imageResult.imageInfo);
```

## 贡献

欢迎提交 issue 和 PR！请遵循以下规范：

- 提交 issue 报告 bug 或提出功能请求
- 创建分支并提交 PR 实现新功能或修复问题
- 确保代码风格一致

## 仓库

[GitHub](https://github.com/yalwolf/stable-diffusion-inspector) | [Gitee](https://gitee.com/alwolf/stable-diffusion-inspector) | [NPM](https://www.npmjs.com/package/stable-diffusion-inspector) | [Done jsr.io](https://jsr.io/@alwolf/stable-diffusion-inspector)

## 鸣谢

原仓库：https://github.com/Akegarasu/stable-diffusion-inspector

## 许可证

GPL-3.0 license