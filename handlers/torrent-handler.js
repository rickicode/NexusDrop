import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs';

class TorrentHandler {
    constructor(uploadsDir) {
        this.client = new WebTorrent();
        this.uploadsDir = uploadsDir;
    }

    removeTorrent(infoHash) {
        try {
            const torrent = this.client.torrents.find(t => t.infoHash === infoHash);
            if (torrent) {
                torrent.destroy();
            }
        } catch (error) {
            console.error('Error removing torrent:', error);
        }
    }

    async startDownload(download, onProgress) {
        try {
            const filePath = path.join(this.uploadsDir, download.filename);
            const torrent = this.client.add(download.originalUrl, { path: this.uploadsDir });

            torrent.on('download', () => {
                if (onProgress) {
                    onProgress({
                        downloadedBytes: torrent.downloaded,
                        progress: Math.round(torrent.progress * 100),
                        speed: torrent.downloadSpeed,
                        peers: torrent.numPeers,
                        ratio: torrent.ratio,
                        uploaded: torrent.uploaded,
                        uploadSpeed: torrent.uploadSpeed,
                        timeRemaining: torrent.timeRemaining
                    });
                }
            });

            return new Promise((resolve, reject) => {
                torrent.on('done', () => {
                    const mainFile = torrent.files.reduce((prev, current) =>
                        (prev.length > current.length) ? prev : current
                    );

                    const originalPath = path.join(this.uploadsDir, mainFile.path);
                    fs.renameSync(originalPath, filePath);

                    torrent.files.forEach(file => {
                        if (file !== mainFile) {
                            try {
                                fs.unlinkSync(path.join(this.uploadsDir, file.path));
                            } catch (e) {
                                console.error('Error cleaning up torrent file:', e);
                            }
                        }
                    });

                    this.removeTorrent(torrent.infoHash);
                    resolve();
                });

                torrent.on('error', (err) => {
                    this.removeTorrent(torrent.infoHash);
                    reject(err);
                });

                torrent.on('warning', (err) => {
                    console.warn('Torrent warning:', err);
                });
            });
        } catch (error) {
            throw error;
        }
    }

    async uploadTorrentFile(file) {
        return new Promise((resolve, reject) => {
            this.client.seed(file.buffer, { name: file.originalname }, torrent => {
                resolve({
                    magnetUri: torrent.magnetURI,
                    infoHash: torrent.infoHash,
                    name: torrent.name,
                    files: torrent.files.map(f => ({
                        name: f.name,
                        size: f.length
                    }))
                });
            });
        });
    }

    getNameFromMagnet(magnetUrl) {
        const nameMatch = magnetUrl.match(/&dn=([^&]+)/);
        if (nameMatch) {
            return decodeURIComponent(nameMatch[1]);
        }
        return 'download';
    }

    isMagnetLink(url) {
        return url.startsWith('magnet:');
    }
}

export default TorrentHandler;
