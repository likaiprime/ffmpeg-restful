const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 42162;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Ensure output directory exists
const outputDir = 'outputs';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'FFmpeg RESTful API',
    endpoints: {
      'GET /': 'API information',
      'GET /health': 'Health check endpoint',
      'POST /convert': 'Convert media file (supports format parameter)',
      'POST /info': 'Get media file information',
      'POST /random-screenshot': 'Generate random screenshot from video (supports format: jpg, jpeg, png, webp, avif)'
    },
    examples: {
      convert: 'curl -X POST -F "file=@video.mp4" -F "format=webm" /convert',
      screenshot: 'curl -X POST -F "file=@video.mp4" -F "format=avif" /random-screenshot',
      info: 'curl -X POST -F "file=@video.mp4" /info'
    }
  });
});

// Health check endpoint (绿灯测试)
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'FFmpeg RESTful API',
    version: '1.2.0',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    }
  };

  // 检查 FFmpeg 是否可用
  const ffmpeg = require('fluent-ffmpeg');
  
  ffmpeg.getAvailableFormats((err, formats) => {
    if (err) {
      healthCheck.status = 'ERROR';
      healthCheck.ffmpeg = {
        available: false,
        error: err.message
      };
      return res.status(503).json(healthCheck);
    }
    
    healthCheck.ffmpeg = {
      available: true,
      formatsCount: Object.keys(formats).length
    };
    
    res.status(200).json(healthCheck);
  });
});

// Get media file information
app.post('/info', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.json(metadata);
  });
});

// Convert media file
app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { format = 'mp4' } = req.body;
  const outputFileName = `${Date.now()}-output.${format}`;
  const outputPath = path.join(outputDir, outputFileName);

  ffmpeg(req.file.path)
    .toFormat(format)
    .on('end', () => {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      // Send the converted file
      res.download(outputPath, (err) => {
        if (err) {
          console.error('Download error:', err);
        }
        // Clean up output file after download
        fs.unlinkSync(outputPath);
      });
    })
    .on('error', (err) => {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      res.status(500).json({ error: err.message });
    })
    .save(outputPath);
});

// Generate random screenshot from video
app.post('/random-screenshot', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Get format parameter (default to jpg)
  const format = req.body.format || 'jpg';
  const supportedFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
  
  if (!supportedFormats.includes(format.toLowerCase())) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ 
      error: `Unsupported format: ${format}. Supported formats: ${supportedFormats.join(', ')}` 
    });
  }

  // First, get video duration
  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    if (err) {
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Failed to get video metadata: ' + err.message });
    }

    const duration = metadata.format.duration;
    if (!duration || duration <= 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid video duration' });
    }

    // Generate random timestamp (not at the very beginning or end)
    const randomTime = Math.random() * (duration - 1) + 0.5;
    const outputFileName = `${Date.now()}-screenshot.${format}`;
    const outputPath = path.join(outputDir, outputFileName);

    // Create ffmpeg command
    let command = ffmpeg(req.file.path)
      .seekInput(randomTime)
      .frames(1);

    // Set format-specific options
    if (format.toLowerCase() === 'avif') {
      command = command
        .outputOptions([
          '-c:v', 'libaom-av1',
          '-crf', '30',
          '-cpu-used', '8'
        ]);
    } else if (format.toLowerCase() === 'webp') {
      command = command
        .outputOptions([
          '-c:v', 'libwebp',
          '-quality', '80'
        ]);
    }

    // Extract frame at random timestamp
    command
      .output(outputPath)
      .on('end', () => {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        // Send the screenshot
        res.download(outputPath, (err) => {
          if (err) {
            console.error('Download error:', err);
          }
          // Clean up output file after download
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', (err) => {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to generate screenshot: ' + err.message });
      })
      .run();
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`FFmpeg RESTful API running on http://localhost:${PORT}`);
});