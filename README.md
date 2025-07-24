# FFmpeg RESTful API

一个基于 Node.js 和 FFmpeg 的现代化 RESTful API，提供强大的音视频处理功能。

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-%23171717.svg?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org)

## ✨ 功能特性

- 🎥 **媒体信息获取** - 获取音视频文件的详细元数据
- 🔄 **格式转换** - 支持多种音视频格式互相转换
- 📸 **智能截图** - 生成视频随机时间点的高质量截图
- 🖼️ **多格式支持** - 支持 JPEG、PNG、WebP、AVIF 等现代图片格式
- 🐳 **容器化部署** - 完整的 Docker 支持，生产环境就绪
- ⚡ **高性能** - 基于 FFmpeg 的底层优化
- 🔒 **安全性** - 非 root 用户运行，包含健康检查

## 🚀 快速开始

### 使用 Docker 运行

```bash
# 拉取并运行容器
git clone <your-repo-url>
cd ffmpeg-restful

# 使用 Docker Compose（推荐）
docker-compose up -d

# 或使用 Docker 直接运行
docker build -t ffmpeg-restful .
docker run -d -p 42162:42162 --name ffmpeg-api ffmpeg-restful
```

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 或生产模式
pnpm start
```

**前置要求**: 系统需要安装 FFmpeg

## 📡 API 端点

### 🏠 基础信息
```http
GET /
```
获取 API 基本信息和使用说明

### 📋 媒体信息
```http
POST /info
Content-Type: multipart/form-data

file: <媒体文件>
```

**响应示例:**
```json
{
  "streams": [{
    "codec_name": "h264",
    "width": 1280,
    "height": 720,
    "duration": 8,
    "bit_rate": 2655964
  }],
  "format": {
    "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
    "duration": 8,
    "size": 2659080
  }
}
```

### 🔄 格式转换
```http
POST /convert
Content-Type: multipart/form-data

file: <媒体文件>
format: <目标格式> (可选，默认: mp4)
```

**支持格式:** mp4, webm, avi, mov, mkv, flv, 3gp 等

### 📸 随机截图
```http
POST /random-screenshot
Content-Type: multipart/form-data

file: <视频文件>
format: <图片格式> (可选，默认: jpg)
```

**支持格式:** jpg, jpeg, png, webp, avif

## 💡 使用示例

### 获取视频信息
```bash
curl -X POST \
  -F "file=@video.mp4" \
  http://localhost:42162/info
```

### 转换为 WebM 格式
```bash
curl -X POST \
  -F "file=@input.mp4" \
  -F "format=webm" \
  http://localhost:42162/convert \
  -o output.webm
```

### 生成 AVIF 截图
```bash
curl -X POST \
  -F "file=@video.mp4" \
  -F "format=avif" \
  http://localhost:42162/random-screenshot \
  -o screenshot.avif
```

### 批量处理示例
```bash
#!/bin/bash
# 批量转换目录中的所有 MP4 文件为 WebM

for file in *.mp4; do
  echo "Converting $file..."
  curl -X POST \
    -F "file=@$file" \
    -F "format=webm" \
    http://localhost:42162/convert \
    -o "${file%.*}.webm"
done
```

## 📊 性能对比

| 格式 | 文件大小 | 质量 | 兼容性 | 推荐场景 |
|------|----------|------|--------|----------|
| JPEG | 基准 | 标准 | 极佳 | 通用截图 |
| PNG | +200% | 无损 | 极佳 | 需要透明度 |
| WebP | -30% | 优秀 | 良好 | 现代浏览器 |
| AVIF | -70% | 极佳 | 一般 | 最新浏览器 |

## 🐳 部署指南

### Dokploy 部署

#### 方法 1: Docker Compose（推荐）
1. 在 Dokploy 中创建新应用
2. 选择 "Docker Compose" 部署方式
3. 连接 Git 仓库或上传项目文件
4. Dokploy 会自动使用 `docker-compose.yml`

#### 方法 2: Dockerfile
1. 在 Dokploy 中创建新应用
2. 选择 "Dockerfile" 部署方式
3. 设置环境变量：
```env
PORT=42162
NODE_ENV=production
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 42162 | 服务端口 |
| `NODE_ENV` | development | 运行环境 |
| `MEMORY_LIMIT` | 1G | 内存限制 |
| `CPU_LIMIT` | 1.0 | CPU 限制 |

### 资源配置

- **内存**: 1GB（可调整）
- **CPU**: 1.0 核心（可调整）
- **存储**: 临时文件自动清理
- **端口**: 42162
- **健康检查**: 30秒间隔

## 🔧 高级配置

### Nginx 反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:42162;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 100M;  # 调整上传限制
    }
}
```

### 自定义 FFmpeg 参数
如需自定义 FFmpeg 参数，可以修改 `index.js` 中的相关配置：

```javascript
// AVIF 截图质量调整
.outputOptions([
  '-c:v', 'libaom-av1',
  '-crf', '25',  // 降低数值提高质量
  '-cpu-used', '6'  // 降低数值提高质量但增加编码时间
])
```

## 📈 监控和日志

### 健康检查
```bash
curl http://localhost:42162/
```

### Docker 日志
```bash
docker logs ffmpeg-api
```

### 性能监控
```bash
# 查看容器资源使用
docker stats ffmpeg-api
```

## 🛠️ 开发指南

### 项目结构
```
ffmpeg-restful/
├── index.js              # 主应用文件
├── package.json           # 项目配置
├── Dockerfile            # Docker 配置
├── docker-compose.yml    # Docker Compose 配置
├── .env                  # 环境变量
├── .gitignore           # Git 忽略规则
└── README.md            # 项目文档
```

### 添加新功能
1. 在 `index.js` 中添加新的路由
2. 使用 `fluent-ffmpeg` API 实现功能
3. 添加错误处理和文件清理
4. 更新 API 文档

### 测试
```bash
# 安装测试依赖
pnpm install --dev

# 运行测试
pnpm test
```

## 🚨 故障排除

### 常见问题

**1. FFmpeg 命令失败**
- 检查输入文件格式是否支持
- 确认 FFmpeg 编解码器可用
- 查看容器日志获取详细错误

**2. 内存不足**
- 增加 Docker 内存限制
- 处理大文件时分批上传
- 考虑使用更高配置的服务器

**3. 上传文件过大**
- 调整 Nginx `client_max_body_size`
- 检查 Express 文件大小限制
- 考虑实现分片上传

**4. AVIF 格式不支持**
- 确认 FFmpeg 版本支持 AV1 编码
- 检查系统是否安装了 `libaom-av1`

## 📝 更新日志

### v1.2.0 (Latest)
- ✨ 新增 AVIF 截图格式支持
- 🎨 改进多格式截图 API
- 🔧 优化 Docker 配置
- 📚 完善 API 文档

### v1.1.0
- ✨ 添加视频截图功能
- 🐳 Docker 容器化支持
- 🔒 安全性改进

### v1.0.0
- 🎉 初始版本发布
- 📊 媒体信息获取
- 🔄 格式转换功能

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 🔗 相关链接

- [FFmpeg 官方文档](https://ffmpeg.org/documentation.html)
- [fluent-ffmpeg API](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)
- [Docker 官方文档](https://docs.docker.com/)
- [Dokploy 部署指南](https://dokploy.com/)---

⭐ 如果这个项目对你有帮助，请给个 Star！