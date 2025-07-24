# FFmpeg RESTful API

一个基于 Node.js 和 FFmpeg 的 RESTful API，用于处理音视频文件。

## 功能

- 获取媒体文件信息
- 转换媒体格式
- 生成视频随机截图

## API 端点

- `GET /` - API 信息
- `POST /info` - 获取媒体文件信息
- `POST /convert` - 转换媒体文件格式
- `POST /random-screenshot` - 生成视频随机截图

## 部署到 Dokploy

### 方法 1: Docker Compose

1. 克隆或上传项目文件到服务器
2. 在 Dokploy 中创建新应用
3. 选择 "Docker Compose" 部署方式
4. 使用项目中的 `docker-compose.yml` 文件

### 方法 2: Dockerfile

1. 在 Dokploy 中创建新应用
2. 选择 "Dockerfile" 部署方式
3. 设置以下环境变量：
   - `PORT=42162`
   - `NODE_ENV=production`

### 配置说明

- **端口**: 42162
- **内存限制**: 1GB
- **CPU 限制**: 1.0 核心
- **健康检查**: 已配置自动健康检查
- **数据持久化**: 使用 Docker volumes 存储临时文件

### 使用示例

```bash
# 获取视频信息
curl -X POST -F "file=@video.mp4" http://your-domain/info

# 转换视频格式
curl -X POST -F "file=@video.mp4" -F "format=webm" http://your-domain/convert -o output.webm

# 生成随机截图
curl -X POST -F "file=@video.mp4" http://your-domain/random-screenshot -o screenshot.jpg
```

## 支持的格式

- 输入格式：MP4, AVI, MOV, MKV, WebM 等
- 输出格式：MP4, WebM, AVI, MOV 等

## 注意事项

- 上传文件大小限制根据服务器配置
- 处理大文件时可能需要较长时间
- 临时文件会在处理完成后自动清理