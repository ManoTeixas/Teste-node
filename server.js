const express = require('express');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const NodeCache = require('node-cache'); // Import node-cache

const app = express();
const port = 3000;
const videoHistory = [];
const cache = new NodeCache({ stdTTL: 3600 }); // Cache com tempo de vida padrão de 1 hora

// Assuming a bitrate of 128 kbps (16 KB/s)
const BITRATE = 128 * 1024 / 8; // bytes per second
const CHUNK_DURATION = 30; // seconds
const CHUNK_SIZE = BITRATE * CHUNK_DURATION; // bytes per chunk

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Use morgan to log HTTP requests
app.use(morgan('combined'));

app.get('/videos', (req, res) => {
  const videoDir = path.join(__dirname, 'videos');
  fs.readdir(videoDir, (err, files) => {
    if (err) {
      return res.status(500).send('Unable to scan videos directory');
    }
    const videos = files.filter(file => file.endsWith('.mp4'));
    res.json(videos);
  });
});

app.get('/video/:name', (req, res) => {
  const videoName = req.params.name;
  const filePath = path.resolve(__dirname, 'videos', videoName);

  // Verifica se o vídeo está em cache
  const cachedVideo = cache.get(videoName);
  if (cachedVideo) {
    console.log('Serving from cache');
    sendVideoStream(cachedVideo, req, res, { size: fs.statSync(cachedVideo).size });
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      return res.status(404).send('Video not found');
    }

    // Armazena o vídeo no cache
    cache.set(videoName, filePath);
    sendVideoStream(filePath, req, res, stat);
  });
});

function sendVideoStream(filePath, req, res, stat) {
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };

    // Calculate the duration of the chunk in seconds
    const chunkDuration = (chunksize / BITRATE).toFixed(2);

    console.log(`Serving video chunk: ${filePath}, range: ${start}-${end}, duration: ${chunkDuration} seconds`);

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };

    console.log(`Serving full video: ${filePath}`);

    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

app.post('/history', (req, res) => {
  const { video } = req.body;
  if (video) {
    videoHistory.push(video);
    res.status(200).send('Video added to history');
  } else {
    res.status(400).send('Invalid request');
  }
});

app.get('/history', (req, res) => {
  res.json(videoHistory);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});
