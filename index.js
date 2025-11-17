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

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const clientIP = req.ip || req.connection.remoteAddress || 'Unknown';
  
  // Log request start
  console.log(`[${timestamp}] ${method} ${url} - IP: ${clientIP} - User-Agent: ${userAgent}`);
  
  // Log file upload info if present
  if (req.files || (req.file && req.route)) {
    console.log(`[${timestamp}] File upload detected on ${url}`);
  }

  // Capture response details
  const originalSend = res.send;
  const originalDownload = res.download;
  
  res.send = function(data) {
    const responseTime = Date.now() - req.startTime;
    const statusCode = res.statusCode;
    const contentLength = data ? Buffer.byteLength(data, 'utf8') : 0;
    
    console.log(`[${timestamp}] ${method} ${url} - ${statusCode} - ${contentLength} bytes - ${responseTime}ms`);
    
    originalSend.call(this, data);
  };
  
  res.download = function(path, callback) {
    const responseTime = Date.now() - req.startTime;
    console.log(`[${timestamp}] ${method} ${url} - File download started - Total processing time: ${responseTime}ms`);
    
    originalDownload.call(this, path, callback);
  };

  req.startTime = Date.now();
  next();
});

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
      'POST /probe': 'Get complete media metadata via ffprobe (supports URL parameter and thumbnail generation)',
      'POST /random-screenshot': 'Generate random screenshot from video (supports format: jpg, jpeg, png, webp, avif)',
      'POST /remove-letterbox': 'Remove black bars (letterbox/pillarbox) from video'
    },
    examples: {
      convert: 'curl -X POST -F "file=@video.mp4" -F "format=webm" /convert',
      screenshot: 'curl -X POST -F "file=@video.mp4" -F "format=avif" /random-screenshot',
      info: 'curl -X POST -F "file=@video.mp4" /info',
      probe: 'curl -X POST -H "Content-Type: application/json" -d \'{"url":"https://example.com/video.mp4"}\' /probe',
      'probe-thumbnail': 'curl -X POST -H "Content-Type: application/json" -d \'{"url":"https://example.com/video.mp4","thumbnail":true,"format":"jpg"}\' /probe',
      'remove-letterbox': 'curl -X POST -F "file=@video.mp4" /remove-letterbox'
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

// Get complete media metadata via ffprobe (supports URL and thumbnail generation)
app.post('/probe', (req, res) => {
  const timestamp = new Date().toISOString();
  const { url, thumbnail, format = 'jpg', time } = req.body;

  if (!url) {
    console.log(`[${timestamp}] PROBE request failed: No URL provided`);
    return res.status(400).json({ error: 'No URL provided. Please provide a "url" parameter in the request body.' });
  }

  console.log(`[${timestamp}] Processing PROBE request - URL: ${url}${thumbnail ? ` (with thumbnail: ${format})` : ''}`);

  // Use ffprobe directly to get complete metadata (equivalent to: ffprobe -v quiet -print_format json -show_format -show_streams)
  ffmpeg.ffprobe(url, (err, metadata) => {
    if (err) {
      console.log(`[${timestamp}] PROBE request failed: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }

    const duration = metadata.format?.duration || 0;
    const streams = metadata.streams?.length || 0;
    console.log(`[${timestamp}] PROBE metadata retrieved - Duration: ${duration}s, Streams: ${streams}`);

    // If thumbnail is requested, generate it
    if (thumbnail) {
      const supportedFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
      const thumbnailFormat = format.toLowerCase();
      
      if (!supportedFormats.includes(thumbnailFormat)) {
        console.log(`[${timestamp}] PROBE thumbnail request failed: Unsupported format ${format}`);
        return res.status(400).json({ 
          error: `Unsupported thumbnail format: ${format}. Supported formats: ${supportedFormats.join(', ')}`,
          metadata: metadata
        });
      }

      // Determine the time to extract thumbnail (default: 1 second or middle of video)
      let thumbnailTime = time;
      if (thumbnailTime === undefined || thumbnailTime === null) {
        thumbnailTime = duration > 2 ? 1 : duration / 2;
      }
      thumbnailTime = Math.max(0.1, Math.min(thumbnailTime, duration - 0.1));

      const outputFileName = `${Date.now()}-thumbnail.${thumbnailFormat}`;
      const outputPath = path.join(outputDir, outputFileName);
      
      console.log(`[${timestamp}] Generating thumbnail at ${thumbnailTime.toFixed(2)}s from ${duration}s video`);

      // Create ffmpeg command to extract thumbnail
      let command = ffmpeg(url)
        .seekInput(thumbnailTime)
        .frames(1);

      // Set format-specific options
      if (thumbnailFormat === 'avif') {
        command = command
          .outputOptions([
            '-c:v', 'libaom-av1',
            '-crf', '30',
            '-cpu-used', '8'
          ]);
      } else if (thumbnailFormat === 'webp') {
        command = command
          .outputOptions([
            '-c:v', 'libwebp',
            '-quality', '80'
          ]);
      }

      // Extract frame at specified timestamp
      command
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`[${timestamp}] FFmpeg thumbnail extraction started: ${commandLine}`);
        })
        .on('end', () => {
          const outputStats = fs.statSync(outputPath);
          console.log(`[${timestamp}] PROBE request completed - Thumbnail: ${outputStats.size} bytes (${thumbnailFormat})`);
          
          // Send the thumbnail file
          res.download(outputPath, (err) => {
            if (err) {
              console.error(`[${timestamp}] Download error:`, err);
            }
            // Clean up output file after download
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
          });
        })
        .on('error', (err) => {
          console.log(`[${timestamp}] PROBE thumbnail generation failed: ${err.message}`);
          // If thumbnail generation fails, still return metadata
          res.status(500).json({ 
            error: 'Failed to generate thumbnail: ' + err.message,
            metadata: metadata
          });
        })
        .run();
    } else {
      // Return metadata only
      console.log(`[${timestamp}] PROBE request completed - Duration: ${duration}s, Streams: ${streams}`);
      res.json(metadata);
    }
  });
});

// Get media file information
app.post('/info', upload.single('file'), (req, res) => {
  const timestamp = new Date().toISOString();

  if (!req.file) {
    console.log(`[${timestamp}] INFO request failed: No file uploaded`);
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`[${timestamp}] Processing INFO request - File: ${req.file.originalname} (${req.file.size} bytes)`);

  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (err) {
      console.log(`[${timestamp}] INFO request failed: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }

    const duration = metadata.format?.duration || 0;
    const streams = metadata.streams?.length || 0;
    console.log(`[${timestamp}] INFO request completed - Duration: ${duration}s, Streams: ${streams}`);

    res.json(metadata);
  });
});

// Convert media file
app.post('/convert', upload.single('file'), (req, res) => {
  const timestamp = new Date().toISOString();
  const processStartTime = Date.now();
  
  if (!req.file) {
    console.log(`[${timestamp}] CONVERT request failed: No file uploaded`);
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { format = 'mp4' } = req.body;
  const outputFileName = `${Date.now()}-output.${format}`;
  const outputPath = path.join(outputDir, outputFileName);

  console.log(`[${timestamp}] Processing CONVERT request - File: ${req.file.originalname} (${req.file.size} bytes) -> ${format}`);

  ffmpeg(req.file.path)
    .toFormat(format)
    .on('start', (commandLine) => {
      console.log(`[${timestamp}] FFmpeg conversion started: ${commandLine}`);
    })
    .on('progress', (progress) => {
      if (progress.percent) {
        const elapsed = ((Date.now() - processStartTime) / 1000).toFixed(1);
        console.log(`[${timestamp}] Conversion progress: ${Math.round(progress.percent)}% - Elapsed: ${elapsed}s`);
      }
    })
    .on('end', () => {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      const totalProcessTime = ((Date.now() - processStartTime) / 1000).toFixed(1);
      const outputStats = fs.statSync(outputPath);
      console.log(`[${timestamp}] CONVERT request completed - Output: ${outputStats.size} bytes`);
      console.log(`[${timestamp}] Total conversion time: ${totalProcessTime}s`);
      
      // Send the converted file
      res.download(outputPath, (err) => {
        if (err) {
          console.error(`[${timestamp}] Download error:`, err);
        }
        // Clean up output file after download
        fs.unlinkSync(outputPath);
      });
    })
    .on('error', (err) => {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      console.log(`[${timestamp}] CONVERT request failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    })
    .save(outputPath);
});

// Generate random screenshot from video
app.post('/random-screenshot', upload.single('file'), (req, res) => {
  const timestamp = new Date().toISOString();
  
  if (!req.file) {
    console.log(`[${timestamp}] SCREENSHOT request failed: No file uploaded`);
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Get format parameter (default to jpg)
  const format = req.body.format || 'jpg';
  const supportedFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
  
  console.log(`[${timestamp}] Processing SCREENSHOT request - File: ${req.file.originalname} (${req.file.size} bytes) -> ${format}`);
  
  if (!supportedFormats.includes(format.toLowerCase())) {
    fs.unlinkSync(req.file.path);
    console.log(`[${timestamp}] SCREENSHOT request failed: Unsupported format ${format}`);
    return res.status(400).json({ 
      error: `Unsupported format: ${format}. Supported formats: ${supportedFormats.join(', ')}` 
    });
  }

  // First, get video duration
  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    if (err) {
      fs.unlinkSync(req.file.path);
      console.log(`[${timestamp}] SCREENSHOT request failed: ${err.message}`);
      return res.status(500).json({ error: 'Failed to get video metadata: ' + err.message });
    }

    const duration = metadata.format.duration;
    if (!duration || duration <= 0) {
      fs.unlinkSync(req.file.path);
      console.log(`[${timestamp}] SCREENSHOT request failed: Invalid video duration`);
      return res.status(400).json({ error: 'Invalid video duration' });
    }

    // Generate random timestamp (not at the very beginning or end)
    const randomTime = Math.random() * (duration - 1) + 0.5;
    const outputFileName = `${Date.now()}-screenshot.${format}`;
    const outputPath = path.join(outputDir, outputFileName);
    
    console.log(`[${timestamp}] Generating screenshot at ${randomTime.toFixed(2)}s from ${duration}s video`);

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
      .on('start', (commandLine) => {
        console.log(`[${timestamp}] FFmpeg screenshot started: ${commandLine}`);
      })
      .on('end', () => {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        const outputStats = fs.statSync(outputPath);
        console.log(`[${timestamp}] SCREENSHOT request completed - Output: ${outputStats.size} bytes (${format})`);
        
        // Send the screenshot
        res.download(outputPath, (err) => {
          if (err) {
            console.error(`[${timestamp}] Download error:`, err);
          }
          // Clean up output file after download
          fs.unlinkSync(outputPath);
        });
      })
      .on('error', (err) => {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        console.log(`[${timestamp}] SCREENSHOT request failed: ${err.message}`);
        res.status(500).json({ error: 'Failed to generate screenshot: ' + err.message });
      })
      .run();
  });
});

// Remove black bars (letterbox/pillarbox) from video
app.post('/remove-letterbox', upload.single('file'), (req, res) => {
  const timestamp = new Date().toISOString();
  const processStartTime = Date.now();
  
  if (!req.file) {
    console.log(`[${timestamp}] REMOVE-LETTERBOX request failed: No file uploaded`);
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { format = 'mp4' } = req.body;
  const outputFileName = `${Date.now()}-letterbox-removed.${format}`;
  const outputPath = path.join(outputDir, outputFileName);

  console.log(`[${timestamp}] Processing REMOVE-LETTERBOX request - File: ${req.file.originalname} (${req.file.size} bytes) -> ${format}`);

  // Use ffprobe to analyze and detect crop parameters more reliably
  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    if (err) {
      fs.unlinkSync(req.file.path);
      console.log(`[${timestamp}] REMOVE-LETTERBOX probe failed: ${err.message}`);
      return res.status(500).json({ error: 'Failed to analyze video: ' + err.message });
    }

    // Run cropdetect to find optimal crop parameters
    const tempOutput = `/tmp/cropdetect_${Date.now()}.log`;
    
    ffmpeg(req.file.path)
      .videoFilters('cropdetect=24:16:0')
      .format('null')
      .output('-')
      .on('start', (commandLine) => {
        console.log(`[${timestamp}] FFmpeg cropdetect started: ${commandLine}`);
      })
      .on('stderr', (stderrLine) => {
        // Collect all crop detection results
        if (stderrLine.includes('crop=')) {
          fs.appendFileSync(tempOutput, stderrLine + '\n');
        }
      })
      .on('end', () => {
        try {
          // Read and analyze crop detection results
          const cropLog = fs.readFileSync(tempOutput, 'utf8');
          const cropMatches = cropLog.match(/crop=(\d+):(\d+):(\d+):(\d+)/g);
          
          if (cropMatches && cropMatches.length > 0) {
            // Get the most common crop parameters (last few should be stable)
            const lastCrop = cropMatches[cropMatches.length - 1];
            const [, width, height, x, y] = lastCrop.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
            
            console.log(`[${timestamp}] Detected crop parameters: ${width}:${height}:${x}:${y}`);
            
            // Apply the crop filter to remove black bars
            const cropStartTime = Date.now();
            console.log(`[${timestamp}] Starting crop processing with parameters: ${width}:${height}:${x}:${y}`);
            
            ffmpeg(req.file.path)
              .videoFilters(`crop=${width}:${height}:${x}:${y}`)
              .toFormat(format)
              .on('start', (commandLine) => {
                console.log(`[${timestamp}] FFmpeg black bar removal started: ${commandLine}`);
              })
              .on('progress', (progress) => {
                if (progress.percent) {
                  const elapsed = ((Date.now() - cropStartTime) / 1000).toFixed(1);
                  console.log(`[${timestamp}] Black bar removal progress: ${Math.round(progress.percent)}% - Elapsed: ${elapsed}s`);
                }
              })
              .on('end', () => {
                // Clean up files
                fs.unlinkSync(req.file.path);
                if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                
                const totalProcessTime = ((Date.now() - processStartTime) / 1000).toFixed(1);
                const cropProcessTime = ((Date.now() - cropStartTime) / 1000).toFixed(1);
                const outputStats = fs.statSync(outputPath);
                
                console.log(`[${timestamp}] REMOVE-LETTERBOX request completed - Output: ${outputStats.size} bytes`);
                console.log(`[${timestamp}] Processing times - Crop: ${cropProcessTime}s, Total: ${totalProcessTime}s`);
                
                // Send the processed file
                res.download(outputPath, (err) => {
                  if (err) {
                    console.error(`[${timestamp}] Download error:`, err);
                  }
                  // Clean up output file after download
                  fs.unlinkSync(outputPath);
                });
              })
              .on('error', (err) => {
                // Clean up files
                fs.unlinkSync(req.file.path);
                if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                console.log(`[${timestamp}] REMOVE-LETTERBOX request failed: ${err.message}`);
                res.status(500).json({ error: err.message });
              })
              .save(outputPath);
          } else {
            // No crop needed or detection failed
            fs.unlinkSync(req.file.path);
            if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
            console.log(`[${timestamp}] No black bars detected in video`);
            res.status(400).json({ error: 'No black bars detected in the video' });
          }
        } catch (readError) {
          fs.unlinkSync(req.file.path);
          if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
          console.log(`[${timestamp}] REMOVE-LETTERBOX analysis failed: ${readError.message}`);
          res.status(500).json({ error: 'Failed to analyze crop detection results' });
        }
      })
      .on('error', (err) => {
        // Clean up files
        fs.unlinkSync(req.file.path);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        console.log(`[${timestamp}] REMOVE-LETTERBOX detection failed: ${err.message}`);
        res.status(500).json({ error: 'Failed to detect black bars: ' + err.message });
      })
      .run();
  });
});

// Start server
app.listen(PORT, () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ==========================================`);
  console.log(`[${timestamp}] 🚀 FFmpeg RESTful API Server Started`);
  console.log(`[${timestamp}] 📍 Port: ${PORT}`);
  console.log(`[${timestamp}] 🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[${timestamp}] 📊 Node.js: ${process.version}`);
  console.log(`[${timestamp}] 🖥️  Platform: ${process.platform} ${process.arch}`);
  console.log(`[${timestamp}] 💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  console.log(`[${timestamp}] 🔗 Health Check: http://localhost:${PORT}/health`);
  console.log(`[${timestamp}] 📚 Documentation: http://localhost:${PORT}/`);
  console.log(`[${timestamp}] ==========================================`);
});