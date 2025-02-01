import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';
import schedule from 'node-schedule';
import multer from 'multer';
import { fileURLToPath } from 'url';
import HttpHandler from './handlers/http-handler.js';
import TorrentHandler from './handlers/torrent-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Get download paths from environment variables or use defaults
const downloadsDir = process.env.PATH_DOWNLOAD || path.join(__dirname, 'uploads');
const torrentsDir = process.env.PATH_TORRENT || path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');

// Create necessary directories
[downloadsDir, torrentsDir, dataDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

// Configure multer for torrent file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        // Accept only .torrent files
        if (!file.originalname.endsWith('.torrent')) {
            return cb(new Error('Only .torrent files are allowed'));
        }
        cb(null, true);
    }
});

// Initialize handlers with appropriate directories
const httpHandler = new HttpHandler(downloadsDir);
const torrentHandler = new TorrentHandler(torrentsDir);

// Middleware
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: 'File upload error' });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});
app.use(express.json());
app.use(express.static('public'));
// Serve files from both directories
app.use('/downloads', express.static(downloadsDir));
app.use('/torrents', express.static(torrentsDir));

// Store download states
const downloads = new Map();
const DOWNLOAD_STATES = {
    PENDING: 'pending',
    DOWNLOADING: 'downloading',
    COMPLETED: 'completed',
    ERROR: 'error'
};

const MAX_RETRIES = 7;

// Configure downloads URL prefix
const DOWNLOADS_BASE_URL = '/downloads/';

// Load saved download states
const stateFile = path.join(dataDir, 'downloads.json');
try {
    if (fs.existsSync(stateFile)) {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        Object.entries(data).forEach(([id, download]) => {
            downloads.set(id, download);
        });
    }
} catch (error) {
    console.error('Error loading download states:', error);
}

// Cleanup orphaned files and expired downloads on startup
cleanupOrphanedFiles();
cleanupExpiredFiles();

// Function to cleanup orphaned files
function cleanupOrphanedFiles() {
    const checkDirectory = (dir) => {
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                // Recursively check directories
                checkDirectory(filePath);
                // Remove empty directories
                if (fs.readdirSync(filePath).length === 0) {
                    fs.rmdirSync(filePath);
                }
            } else {
                // Check if file exists in downloads map
                const fileExists = Array.from(downloads.values()).some(
                    download => download.filename === file
                );
                if (!fileExists) {
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`Removed orphaned file: ${file}`);
                    } catch (error) {
                        console.error(`Error removing orphaned file ${file}:`, error);
                    }
                }
            }
        });
    };

    // Check both download directories
    checkDirectory(downloadsDir);
    checkDirectory(torrentsDir);
}

// Save download states periodically
setInterval(() => {
    const data = Object.fromEntries(downloads);
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
}, 5000);

// Cleanup jobs
schedule.scheduleJob('*/1 * * * *', cleanupStuckDownloads);  // Every minute
schedule.scheduleJob('0 0 * * *', cleanupExpiredFiles);      // Every day at midnight

function cleanupStuckDownloads() {
    const now = Date.now();
    for (const [id, download] of downloads.entries()) {
        if (download.state === DOWNLOAD_STATES.DOWNLOADING &&
            now - download.startTime > 60000) { // 1 minute timeout
            if (download.retryCount < MAX_RETRIES) {
                startDownload(id, download.originalUrl);
            } else {
                download.state = DOWNLOAD_STATES.ERROR;
                download.error = 'Download timed out';
            }
        }
    }
}

async function cleanupExpiredFiles() {
    const now = Date.now();
    let hasDeleted = false;

    for (const [id, download] of downloads.entries()) {
        if (download.expiresAt && now > download.expiresAt) {
            const filePath = path.join(download.isTorrent ? torrentsDir : downloadsDir, download.filename);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                downloads.delete(id);
                console.log(`Deleted expired file: ${download.filename}`);
                hasDeleted = true;
            } catch (error) {
                console.error(`Error deleting file ${download.filename}:`, error);
            }
        }
    }

    if (hasDeleted) {
        try {
            fs.writeFileSync(stateFile, JSON.stringify(Object.fromEntries(downloads), null, 2));
            console.log('Updated downloads state after cleanup');
        } catch (error) {
            console.error('Error saving downloads state:', error);
        }
    }
}

app.get('/api/downloads', (req, res) => {
    res.json(Object.fromEntries(downloads));
});

app.delete('/api/downloads/:id', (req, res) => {
    const { id } = req.params;
    const { ownerId } = req.body;
    const download = downloads.get(id);

    if (!download) {
        return res.status(404).json({ error: 'Download not found' });
    }

    if (download.ownerId !== ownerId) {
        return res.status(403).json({ error: 'Not authorized to delete this download' });
    }

    const filePath = path.join(download.isTorrent ? torrentsDir : downloadsDir, download.filename);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        downloads.delete(id);
        res.json({ message: 'Download deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete download' });
    }
});

async function startDownload(id, url) {
    const download = downloads.get(id);
    if (!download) return;

    try {
        download.state = DOWNLOAD_STATES.DOWNLOADING;
        download.startTime = Date.now();

        const onProgress = (progress) => {
            download.downloadedBytes = progress.downloadedBytes;
            download.progress = progress.progress;
            download.speed = progress.speed;

            // Add torrent-specific info if available
            if (download.isTorrent) {
                download.torrentInfo = {
                    peers: progress.peers,
                    ratio: progress.ratio,
                    uploaded: progress.uploaded,
                    uploadSpeed: progress.uploadSpeed,
                    timeRemaining: progress.timeRemaining
                };
            }
        };

        if (download.isTorrent) {
            await torrentHandler.startDownload(download, onProgress);
        } else {
            await httpHandler.startDownload(download, onProgress);
        }

        download.state = DOWNLOAD_STATES.COMPLETED;
        download.completedAt = Date.now();
        download.error = null;

    } catch (error) {
        download.state = DOWNLOAD_STATES.ERROR;
        download.error = error.message || 'Download failed';
        download.retryCount = (download.retryCount || 0) + 1;

        if (download.retryCount < MAX_RETRIES) {
            console.log(`Auto retrying download ${id}, attempt ${download.retryCount}`);
            setTimeout(() => startDownload(id, url), 1000);
        }
        console.error('Download error:', error);
    }
}

app.post('/api/download', async (req, res) => {
    try {
        const { url, hours = 72 } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const id = crypto.randomBytes(8).toString('hex');
        const isTorrent = torrentHandler.isMagnetLink(url);

        let originalFilename;
        if (isTorrent) {
            originalFilename = torrentHandler.getNameFromMagnet(url) || 'download';
        } else {
            const fileInfo = await httpHandler.getFileInfo(url);
            originalFilename = fileInfo.filename;
        }

        const randomText = Math.random().toString(36).substring(2, 6).toUpperCase();
        const filename = `NexusDrop_${randomText}-${originalFilename}`;
        const expiresAt = Date.now() + (hours * 60 * 60 * 1000);
        const ownerId = crypto.randomBytes(16).toString('hex');

        downloads.set(id, {
            id,
            url: isTorrent ? url : httpHandler.transformToMirrorUrl(url),
            originalUrl: url,
            filename,
            originalFilename,
            state: DOWNLOAD_STATES.PENDING,
            progress: 0,
            createdAt: Date.now(),
            expiresAt,
            error: null,
            ownerId,
            downloadUrl: (isTorrent ? '/torrents/' : DOWNLOADS_BASE_URL) + filename,
            retryCount: 0,
            downloadedBytes: 0,
            isTorrent
        });

        startDownload(id, url);

        res.json({
            id,
            ownerId,
            expiresAt: new Date(expiresAt).toISOString()
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            error: 'Failed to start download: ' + (error.message || 'Unknown error')
        });
    }
});

// Endpoint for uploading torrent files
app.post('/api/upload/torrent', upload.single('torrent'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No torrent file provided' });
        }

        const result = await torrentHandler.uploadTorrentFile(req.file);
        res.json({
            magnetUri: result.magnetUri,
            name: result.name,
            files: result.files
        });
    } catch (error) {
        console.error('Torrent upload error:', error);
        res.status(500).json({ error: 'Failed to process torrent file' });
    }
});

app.post('/api/download/:id/retry', async (req, res) => {
    const { id } = req.params;
    const { ownerId } = req.body;
    const download = downloads.get(id);

    if (!download) {
        return res.status(404).json({ error: 'Download not found' });
    }

    if (download.ownerId !== ownerId) {
        return res.status(403).json({ error: 'Not authorized to retry this download' });
    }

    download.retryCount = 0;
    startDownload(id, download.originalUrl);
    res.json({
        message: 'Download retry initiated',
        expiresAt: new Date(download.expiresAt).toISOString()
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Regular downloads will be stored in: ${downloadsDir}`);
    console.log(`Torrent downloads will be stored in: ${torrentsDir}`);
});

process.on('SIGINT', () => {
    console.log('Server shutting down...');
    fs.writeFileSync(stateFile, JSON.stringify(Object.fromEntries(downloads), null, 2));
    process.exit();
});
