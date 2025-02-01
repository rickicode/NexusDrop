import express from 'express';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import schedule from 'node-schedule';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// Create necessary directories
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
[uploadsDir, dataDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('uploads'));

// Store download states
const downloads = new Map();
const DOWNLOAD_STATES = {
    PENDING: 'pending',
    DOWNLOADING: 'downloading',
    COMPLETED: 'completed',
    ERROR: 'error'
};

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
            download.state = DOWNLOAD_STATES.ERROR;
            download.error = 'Download timed out';
        }
    }
}

function cleanupExpiredFiles() {
    const now = Date.now();
    for (const [id, download] of downloads.entries()) {
        if (download.expiresAt && now > download.expiresAt) {
            const filePath = path.join(uploadsDir, download.filename);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                downloads.delete(id);
                console.log(`Deleted expired file: ${download.filename}`);
            } catch (error) {
                console.error(`Error deleting file ${download.filename}:`, error);
            }
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

    const filePath = path.join(uploadsDir, download.filename);
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

function transformToMirrorUrl(originalUrl) {
    try {
        // If URL is already using get.0ms.dev, return it as is
        if (originalUrl.includes('get.0ms.dev')) {
            return originalUrl;
        }

        const urlObj = new URL(originalUrl);
        // Remove protocol (http:// or https://) and use the rest of the URL
        const pathWithHost = urlObj.host + urlObj.pathname + urlObj.search;
        return `https://get.0ms.dev/${pathWithHost}`;
    } catch (error) {
        console.error('URL transformation error:', error);
        return originalUrl;
    }
}

async function startDownload(id, url) {
    const download = downloads.get(id);
    if (!download) return;

    try {
        download.state = DOWNLOAD_STATES.DOWNLOADING;
        download.startTime = Date.now();
        download.progress = 0;

        const mirrorUrl = transformToMirrorUrl(url);
        console.log(`Original URL: ${url}`);
        console.log(`Mirror URL: ${mirrorUrl}`);

        const response = await axios({
            method: 'get',
            url: mirrorUrl,
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                download.progress = progress;
            }
        });

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        const writer = fs.createWriteStream(path.join(uploadsDir, download.filename));
        response.data.pipe(writer);

        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;
            download.progress = Math.round((downloadedSize * 100) / totalSize);
        });

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        download.state = DOWNLOAD_STATES.COMPLETED;
        download.completedAt = Date.now();
        download.error = null;

    } catch (error) {
        download.state = DOWNLOAD_STATES.ERROR;
        download.error = error.message || 'Download failed';
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
        const originalFilename = path.basename(new URL(url).pathname) || 'download';
        const filename = `${id}-${originalFilename}`;
        const expiresAt = Date.now() + (hours * 60 * 60 * 1000);
        const ownerId = crypto.randomBytes(16).toString('hex');

        downloads.set(id, {
            id,
            url,
            filename,
            originalFilename,
            state: DOWNLOAD_STATES.PENDING,
            progress: 0,
            createdAt: Date.now(),
            expiresAt,
            error: null,
            ownerId
        });

        // Start download process
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

    // Start new download
    startDownload(id, download.url);
    res.json({
        message: 'Download retry initiated',
        expiresAt: new Date(download.expiresAt).toISOString()
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Files will be stored in: ${uploadsDir}`);
});

// Handle cleanup on server shutdown
process.on('SIGINT', () => {
    console.log('Server shutting down...');
    fs.writeFileSync(stateFile, JSON.stringify(Object.fromEntries(downloads), null, 2));
    process.exit();
});
