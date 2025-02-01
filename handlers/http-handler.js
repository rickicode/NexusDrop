import axios from 'axios';
import path from 'path';
import fs from 'fs';

class HttpHandler {
    constructor(uploadsDir) {
        this.uploadsDir = uploadsDir;
    }

    transformToMirrorUrl(originalUrl) {
        try {
            if (originalUrl.includes('get.0ms.dev')) {
                return originalUrl;
            }

            const urlObj = new URL(originalUrl);
            const pathWithHost = urlObj.host + urlObj.pathname + urlObj.search;
            return `https://get.0ms.dev/${pathWithHost}`;
        } catch (error) {
            console.error('URL transformation error:', error);
            return originalUrl;
        }
    }

    async getFileInfo(url) {
        try {
            let originalFilename = 'download';

            // Get filename from URL path
            const urlPath = new URL(url).pathname;
            if (urlPath && urlPath !== '/') {
                originalFilename = path.basename(urlPath);
            }

            // Get headers without downloading
            const headResponse = await axios.head(url);
            const contentType = headResponse.headers['content-type'];
            const disposition = headResponse.headers['content-disposition'];

            // Get filename from content-disposition
            if (disposition) {
                const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch && filenameMatch[1]) {
                    originalFilename = filenameMatch[1].replace(/['"]/g, '');
                }
            }

            // Add extension from content-type if needed
            if (!path.extname(originalFilename) && contentType) {
                const ext = this.getExtensionFromMimeType(contentType);
                if (ext) {
                    originalFilename = `${originalFilename}${ext}`;
                }
            }

            return {
                filename: originalFilename,
                contentType,
                contentLength: headResponse.headers['content-length']
            };
        } catch (error) {
            console.warn('Error getting file info:', error);
            return { filename: path.basename(new URL(url).pathname) || 'download' };
        }
    }

    async startDownload(download, onProgress) {
        try {
            const filePath = path.join(this.uploadsDir, download.filename);
            const fileStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
            const downloadedBytes = fileStats ? fileStats.size : 0;

            const mirrorUrl = this.transformToMirrorUrl(download.originalUrl);
            console.log(`Original URL: ${download.originalUrl}`);
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
                validateStatus: status => (status >= 200 && status < 300) || status === 206
            });

            const totalSize = parseInt(response.headers['content-length'], 10) + downloadedBytes;
            let lastTime = Date.now();
            let lastSize = downloadedBytes;
            let currentBytes = downloadedBytes;

            const writer = fs.createWriteStream(filePath, { flags: downloadedBytes > 0 ? 'a' : 'w' });

            response.data.on('data', (chunk) => {
                currentBytes += chunk.length;

                // Calculate progress and speed
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;
                if (timeDiff >= 1) {
                    const sizeDiff = currentBytes - lastSize;
                    if (onProgress) {
                        onProgress({
                            downloadedBytes: currentBytes,
                            progress: Math.round((currentBytes * 100) / totalSize),
                            speed: Math.round(sizeDiff / timeDiff)
                        });
                    }
                    lastTime = now;
                    lastSize = currentBytes;
                }
            });

            // Return promise that resolves when download completes
            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
                response.data.pipe(writer);
            });

        } catch (error) {
            throw error;
        }
    }

    getExtensionFromMimeType(mimeType) {
        const mimeToExt = {
            'application/pdf': '.pdf',
            'application/zip': '.zip',
            'application/x-rar-compressed': '.rar',
            'application/x-7z-compressed': '.7z',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'text/plain': '.txt'
        };
        return mimeToExt[mimeType] || '';
    }
}

export default HttpHandler;
