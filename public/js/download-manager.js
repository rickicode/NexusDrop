import { formatSpeed, formatSize, formatTimeLeft, formatTimeRemaining } from './formatters.js';
import { notifications } from '../notifications.js';
import { TorrentUploader } from './torrent-upload.js';
import { VideoPlayer } from './video-player.js';

export class DownloadManager {
    constructor() {
        this.form = document.getElementById('downloadForm');
        this.urlInput = document.getElementById('urlInput');
        this.expirationSelect = document.getElementById('expirationTime');
        this.downloadsList = document.getElementById('downloadsList');
        this.downloads = new Map();
        this.ownedDownloads = new Map(JSON.parse(localStorage.getItem('ownedDownloads') || '[]'));

        // Initialize components
        this.videoPlayer = new VideoPlayer();
        this.torrentUploader = new TorrentUploader(
            document.getElementById('torrentUploadForm'),
            this.urlInput
        );

        this.initEventListeners();
        this.loadDownloads();
        this.startPolling();
    }

    initEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.downloadsList.addEventListener('click', (e) => this.handleDownloadAction(e));
    }

    async loadDownloads() {
        try {
            const response = await fetch('/api/downloads');
            const data = await response.json();

            // Clean up expired downloads from localStorage
            const now = Date.now();
            for (const [id, download] of Object.entries(data)) {
                if (download.expiresAt <= now) {
                    this.ownedDownloads.delete(id);
                }
            }
            localStorage.setItem('ownedDownloads', JSON.stringify([...this.ownedDownloads]));

            this.downloads.clear();
            Object.entries(data).forEach(([id, download]) => {
                this.downloads.set(id, download);

                // Show notifications for state changes
                const prevDownload = this.downloads.get(id);
                if (prevDownload && prevDownload.state !== download.state) {
                    this.showStateChangeNotification(download);
                }
            });

            this.renderDownloads();
        } catch (error) {
            console.error('Failed to load downloads:', error);
            notifications.error('Failed to load downloads');
        }
    }

    showStateChangeNotification(download) {
        switch (download.state) {
            case 'completed':
                notifications.success('Download completed successfully');
                break;
            case 'error':
                notifications.error(download.error || 'Download failed');
                break;
            case 'downloading':
                notifications.info('Download started');
                break;
        }
    }

    startPolling() {
        setInterval(() => this.loadDownloads(), 1000);
    }

    async handleSubmit(e) {
        e.preventDefault();
        const url = this.urlInput.value.trim();
        const hours = parseInt(this.expirationSelect.value);

        if (!url) return;

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url, hours })
            });

            if (!response.ok) {
                throw new Error('Failed to start download');
            }

            const { id, ownerId } = await response.json();

            // Store owner ID
            this.ownedDownloads.set(id, ownerId);
            localStorage.setItem('ownedDownloads', JSON.stringify([...this.ownedDownloads]));

            notifications.success('Download request submitted successfully');
            this.urlInput.value = '';
            await this.loadDownloads();
        } catch (error) {
            console.error('Download error:', error);
            notifications.error('Failed to start download. Please try again.');
        }
    }

    async handleDownloadAction(e) {
        const button = e.target.closest('button');
        if (!button) return;

        const { action } = button.dataset;
        const downloadItem = button.closest('.download-item');
        const { id } = downloadItem.dataset;
        const download = this.downloads.get(id);
        const ownerId = this.ownedDownloads.get(id);

        if (button.dataset.action === 'play' && this.videoPlayer.isVideoFile(download.originalFilename)) {
            this.videoPlayer.playVideo(download);
            return;
        }

        if (!ownerId) return;

        try {
            if (action === 'delete') {
                await fetch(`/api/downloads/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ownerId })
                });
                this.ownedDownloads.delete(id);
                localStorage.setItem('ownedDownloads', JSON.stringify([...this.ownedDownloads]));
            } else if (action === 'retry') {
                await fetch(`/api/download/${id}/retry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ownerId })
                });
            }
            if (action === 'delete') {
                notifications.info('Download deleted successfully');
            } else if (action === 'retry') {
                notifications.info('Download retry initiated');
            }
            await this.loadDownloads();
        } catch (error) {
            console.error('Action failed:', error);
            notifications.error(`Failed to ${action} download. Please try again.`);
        }
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            // Video
            mp4: 'fas fa-video',
            webm: 'fas fa-video',
            mkv: 'fas fa-video',
            // Audio
            mp3: 'fas fa-music',
            wav: 'fas fa-music',
            // Images
            jpg: 'fas fa-image',
            jpeg: 'fas fa-image',
            png: 'fas fa-image',
            gif: 'fas fa-image',
            // Documents
            pdf: 'fas fa-file-pdf',
            doc: 'fas fa-file-word',
            docx: 'fas fa-file-word',
            txt: 'fas fa-file-alt',
            // Archives
            zip: 'fas fa-file-archive',
            rar: 'fas fa-file-archive',
            '7z': 'fas fa-file-archive',
            // Code
            js: 'fas fa-file-code',
            css: 'fas fa-file-code',
            html: 'fas fa-file-code',
            // Default
            default: 'fas fa-file'
        };

        return icons[ext] || icons.default;
    }

    renderDownloadActions(download, isOwner) {
        let actions = '';

        // Show play button for video files in any state
        if (this.videoPlayer.isVideoFile(download.originalFilename)) {
            actions += `
                <button class="btn btn-small" data-action="play">
                    <i class="fas fa-play"></i> Play
                </button>
            `;
        }

        // Show download button only when completed
        if (download.state === 'completed') {
            actions += `
                <a href="/downloads/${download.filename}" class="btn btn-small" download>
                    <i class="fas fa-download"></i> Download
                </a>
            `;
        }

        if (download.state === 'error' && isOwner && download.retryCount >= 7) {
            actions += `
                <button class="btn btn-small btn-retry" data-action="retry">
                    <i class="fas fa-redo"></i> Retry
                </button>
            `;
        }

        if (isOwner) {
            actions += `
                <button class="btn btn-small btn-delete" data-action="delete">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        }

        return actions;
    }

    renderTorrentInfo(download) {
        if (!download.isTorrent || !download.torrentInfo) return '';

        const { peers, ratio, uploaded, uploadSpeed, timeRemaining } = download.torrentInfo;

        return `
            <div class="torrent-info">
                <div><i class="fas fa-users"></i> ${peers} peers</div>
                <div><i class="fas fa-exchange-alt"></i> Ratio: ${ratio.toFixed(2)}</div>
                <div><i class="fas fa-upload"></i> ${formatSize(uploaded)} (${formatSpeed(uploadSpeed)})</div>
                <div><i class="fas fa-clock"></i> ETA: ${formatTimeRemaining(timeRemaining)}</div>
            </div>
        `;
    }

    renderDownloads() {
        this.downloadsList.innerHTML = '';

        if (this.downloads.size === 0) {
            this.downloadsList.innerHTML = '<p class="text-center">No downloads yet</p>';
            return;
        }

        const now = Date.now();
        const sortedDownloads = Array.from(this.downloads.values())
            .filter(download => download.expiresAt > now)
            .sort((a, b) => b.createdAt - a.createdAt);

        sortedDownloads.forEach(download => {
            const item = document.createElement('div');
            item.className = 'download-item';
            item.dataset.id = download.id;

            const statusClass = {
                pending: 'status-pending',
                downloading: 'status-pending',
                completed: 'status-success',
                error: 'status-error'
            }[download.state];

            let statusText = {
                pending: 'Pending...',
                downloading: `Downloading (${download.progress}%)`,
                completed: 'Completed',
                error: download.error || 'Failed'
            }[download.state];

            if (download.state === 'downloading' && download.speed !== undefined) {
                statusText += ` - ${formatSpeed(download.speed)}`;
            }

            const isOwner = this.ownedDownloads.has(download.id);
            const timeLeft = formatTimeLeft(download.expiresAt);

            const torrentBadge = download.isTorrent ?
                '<span class="torrent-badge"><i class="fas fa-magnet"></i> Torrent</span>' : '';

            item.innerHTML = `
                <div class="url">
                    ${torrentBadge}
                    <i class="${this.getFileIcon(download.originalFilename)}"></i>
                    <a href="${download.url}" target="_blank">${download.originalFilename}</a>
                </div>
                <div class="status">
                    ${download.state === 'downloading' ?
                    `<div class="download-progress">
                        <div class="progress-bar" style="width: ${download.progress}%"></div>
                    </div>` : ''}
                    <span class="status-text ${statusClass}">
                        ${download.state === 'downloading' ? `<span class="loading-spinner"></span>` : ''}
                        ${statusText}
                    </span>
                </div>
                ${download.isTorrent ? this.renderTorrentInfo(download) : ''}
                <div class="download-meta">
                    <div class="download-actions">
                        ${this.renderDownloadActions(download, isOwner)}
                    </div>
                    <div class="expires-at">
                        <i class="fas fa-clock"></i> ${timeLeft}
                    </div>
                </div>
            `;

            this.downloadsList.appendChild(item);
        });
    }
}
