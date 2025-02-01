import express from 'express';
import axios from 'axios';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';
import schedule from 'node-schedule';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

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

// Run initial cleanup for any expired downloads
cleanupExpiredFiles();

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
            // Auto retry if under max retries
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

    // Delete expired files and downloads
    for (const [id, download] of downloads.entries()) {
        if (download.expiresAt && now > download.expiresAt) {
            const filePath = path.join(uploadsDir, download.filename);
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

    // Save updates to state file if any deletions occurred
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

        const filePath = path.join(uploadsDir, download.filename);
        const fileStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        const downloadedBytes = fileStats ? fileStats.size : 0;
        download.downloadedBytes = downloadedBytes;

        const mirrorUrl = transformToMirrorUrl(url);
        console.log(`Original URL: ${url}`);
        console.log(`Mirror URL: ${mirrorUrl}`);
        console.log(`Resuming from byte: ${downloadedBytes}`);

        const headers = {};
        if (downloadedBytes > 0) {
            headers.Range = `bytes=${downloadedBytes}-`;
        }

        const response = await axios({
            method: 'get',
            url: mirrorUrl,
            headers,
            responseType: 'stream',
            validateStatus: status => (status >= 200 && status < 300) || status === 206,
            onDownloadProgress: (progressEvent) => {
                const progress = Math.round(((progressEvent.loaded + downloadedBytes) * 100) / progressEvent.total);
                download.progress = progress;
            }
        });

        const totalSize = parseInt(response.headers['content-length'], 10) + downloadedBytes;
        let lastTime = Date.now();
        let lastSize = downloadedBytes;

        const writer = fs.createWriteStream(filePath, { flags: downloadedBytes > 0 ? 'a' : 'w' });
        response.data.pipe(writer);

        response.data.on('data', (chunk) => {
            download.downloadedBytes += chunk.length;
            download.progress = Math.round((download.downloadedBytes * 100) / totalSize);

            // Calculate speed in bytes per second
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000;
            if (timeDiff >= 1) {
                const sizeDiff = download.downloadedBytes - lastSize;
                download.speed = Math.round(sizeDiff / timeDiff);
                lastTime = now;
                lastSize = download.downloadedBytes;
            }
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
        download.retryCount = (download.retryCount || 0) + 1;

        // Auto retry if under max retries
        if (download.retryCount < MAX_RETRIES) {
            console.log(`Auto retrying download ${id}, attempt ${download.retryCount}`);
            setTimeout(() => startDownload(id, url), 1000); // Wait 1s before retry
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
        let originalFilename = 'download';

        try {
            // First try to get filename from URL path
            const urlPath = new URL(url).pathname;
            if (urlPath && urlPath !== '/') {
                originalFilename = path.basename(urlPath);
            }

            // Make a HEAD request to get headers without downloading the full file
            const headResponse = await axios.head(url);
            const contentType = headResponse.headers['content-type'];
            const disposition = headResponse.headers['content-disposition'];

            // Try to get filename from content-disposition header
            if (disposition) {
                const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch && filenameMatch[1]) {
                    // Remove quotes if present
                    originalFilename = filenameMatch[1].replace(/['"]/g, '');
                }
            }

            // If we still don't have a proper extension, try to get it from content-type
            if (!path.extname(originalFilename) && contentType) {
                const ext = getExtensionFromMimeType(contentType);
                if (ext) {
                    originalFilename = `${originalFilename}${ext}`;
                }
            }

            // Special handling for known download services
            if (url.includes('drive.google.com')) {
                originalFilename = getGoogleDriveFilename(headResponse.headers, originalFilename);
            }
        } catch (error) {
            console.warn('Error detecting filename:', error);
            originalFilename = path.basename(new URL(url).pathname) || 'download';
        }

        const now = new Date();
        const randomText = Math.random().toString(36).substring(2, 6).toUpperCase();
        const filename = `NexusDrop_${randomText}-${originalFilename}`;
        const expiresAt = Date.now() + (hours * 60 * 60 * 1000);
        const ownerId = crypto.randomBytes(16).toString('hex');

        downloads.set(id, {
            id,
            url: transformToMirrorUrl(url),
            originalUrl: url,
            filename,
            originalFilename,
            state: DOWNLOAD_STATES.PENDING,
            progress: 0,
            createdAt: Date.now(),
            expiresAt,
            error: null,
            ownerId,
            downloadUrl: DOWNLOADS_BASE_URL + filename,
            retryCount: 0,
            downloadedBytes: 0
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

    // Reset retry count for manual retry
    download.retryCount = 0;

    startDownload(id, download.originalUrl);
    res.json({
        message: 'Download retry initiated',
        expiresAt: new Date(download.expiresAt).toISOString()
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Files will be stored in: ${uploadsDir}`);
});

process.on('SIGINT', () => {
    console.log('Server shutting down...');
    fs.writeFileSync(stateFile, JSON.stringify(Object.fromEntries(downloads), null, 2));
    process.exit();
});
