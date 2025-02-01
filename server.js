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
        let lastTime = Date.now();
        let lastSize = 0;

        const writer = fs.createWriteStream(path.join(uploadsDir, download.filename));
        response.data.pipe(writer);

        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;
            download.progress = Math.round((downloadedSize * 100) / totalSize);

            // Calculate speed in bytes per second
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000; // Convert to seconds
            if (timeDiff >= 1) { // Update speed every second
                const sizeDiff = downloadedSize - lastSize;
                download.speed = Math.round(sizeDiff / timeDiff); // bytes per second
                lastTime = now;
                lastSize = downloadedSize;
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
            // Add more special cases here for other services
        } catch (error) {
            console.warn('Error detecting filename:', error);
            // Fallback to URL basename or 'download' if that fails
            originalFilename = path.basename(new URL(url).pathname) || 'download';
        }

        // Generate timestamp-based prefix
        const now = new Date();
        const timestamp = now.toLocaleString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/:/g, '');

        const filename = `NexusDrop_${timestamp}-${originalFilename}`;
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
            downloadUrl: DOWNLOADS_BASE_URL + filename
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

// Helper function to get file extension from mime type
function getExtensionFromMimeType(mimeType) {
    const mimeToExt = {
        // Archives
        'application/zip': '.zip',
        'application/x-zip-compressed': '.zip',
        'application/x-rar-compressed': '.rar',
        'application/x-7z-compressed': '.7z',
        'application/x-ace-compressed': '.ace',
        'application/x-arj': '.arj',
        'application/x-sea': '.sea',
        'application/x-tar': '.tar',
        'application/x-gzip': '.gz',
        'application/gzip': '.gzip',
        'application/x-bzip2': '.bz2',
        'application/x-lzh': '.lzh',
        'application/x-sit': '.sit',
        'application/x-sitx': '.sitx',
        'application/x-z-compressed': '.z',

        // Executables
        'application/x-msdownload': '.exe',
        'application/x-msi': '.msi',
        'application/x-msu': '.msu',

        // Images
        'application/x-iso9660-image': '.iso',
        'image/tiff': '.tif',
        'image/x-tiff': '.tiff',
        'application/x-raw-disk-image': '.img',
        'application/x-xz': '.img.xz',

        // Audio
        'audio/aac': '.aac',
        'audio/x-aiff': '.aif',
        'audio/mpeg': '.mp3',
        'audio/mp4': '.m4a',
        'audio/x-realaudio': '.ra',
        'audio/x-pn-realaudio': '.rm',
        'audio/wav': '.wav',
        'audio/x-ms-wma': '.wma',
        'audio/ogg': '.ogg',

        // Video
        'video/x-ms-asf': '.asf',
        'video/x-msvideo': '.avi',
        'video/mp4': '.mp4',
        'video/x-matroska': '.mkv',
        'video/quicktime': '.mov',
        'video/x-m4v': '.m4v',
        'video/mpeg': '.mpeg',
        'video/mpg': '.mpg',
        'video/x-mpeg': '.mpe',
        'video/ogg': '.ogv',
        'video/x-realvideo': '.rmvb',
        'video/x-ms-wmv': '.wmv',

        // Documents
        'application/pdf': '.pdf',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.ms-powerpoint.presentation.macroEnabled.12': '.pps',
        'application/vnd.ms-powerpoint.slideshow.macroEnabled.12': '.pps',

        // Android Package
        'application/vnd.android.package-archive': '.apk',

        // Binary
        'application/octet-stream': '.bin',

        // Additional formats from R0* to R1*
        'application/x-r0': '.r00',
        'application/x-r1': '.r01',
        'application/x-r2': '.r02',
        'application/x-r3': '.r03',
        'application/x-r4': '.r04',
        'application/x-r5': '.r05',
        'application/x-plj': '.plj'
    };
    return mimeToExt[mimeType] || '';
}

// Helper function to handle Google Drive files
function getGoogleDriveFilename(headers, fallbackName) {
    // Google Drive specific logic
    const contentType = headers['content-type'];
    if (contentType && !path.extname(fallbackName)) {
        const ext = getExtensionFromMimeType(contentType);
        if (ext) {
            return `${fallbackName}${ext}`;
        }
    }
    return fallbackName;
}

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
