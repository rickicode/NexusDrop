class DownloadManager {
    constructor() {
        this.form = document.getElementById('downloadForm');
        this.urlInput = document.getElementById('urlInput');
        this.expirationSelect = document.getElementById('expirationTime');
        this.downloadsList = document.getElementById('downloadsList');
        this.downloads = new Map();
        this.ownedDownloads = new Map(JSON.parse(localStorage.getItem('ownedDownloads') || '[]'));
        this.previousProgress = new Map();
        this.lastUpdateTime = new Map();

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

            this.downloads.clear();
            Object.entries(data).forEach(([id, download]) => {
                // Calculate download speed if downloading
                if (download.state === 'downloading') {
                    const prevProgress = this.previousProgress.get(id) || 0;
                    const lastUpdate = this.lastUpdateTime.get(id) || Date.now();
                    const timeDiff = (Date.now() - lastUpdate) / 1000; // Convert to seconds

                    if (timeDiff > 0) {
                        const progressDiff = download.progress - prevProgress;
                        download.speed = Math.round((progressDiff / timeDiff) * 100) / 100; // % per second
                    }

                    this.previousProgress.set(id, download.progress);
                    this.lastUpdateTime.set(id, Date.now());
                } else {
                    // Clean up tracking for completed/failed downloads
                    this.previousProgress.delete(id);
                    this.lastUpdateTime.delete(id);
                }

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

    formatTimeLeft(expiresAt) {
        const now = Date.now();
        const timeLeft = new Date(expiresAt) - now;

        if (timeLeft <= 0) return 'Expired';

        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} day${days !== 1 ? 's' : ''} left`;
        }

        if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min left`;
        }

        return `${minutes} minutes left`;
    }

    renderDownloads() {
        this.downloadsList.innerHTML = '';

        if (this.downloads.size === 0) {
            this.downloadsList.innerHTML = '<p class="text-center">No downloads yet</p>';
            return;
        }

        const sortedDownloads = Array.from(this.downloads.values())
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

            // Add speed information if downloading
            if (download.state === 'downloading' && download.speed !== undefined) {
                statusText += ` - ${download.speed}%/s`;
            }

            const isOwner = this.ownedDownloads.has(download.id);
            const timeLeft = this.formatTimeLeft(download.expiresAt);

            item.innerHTML = `
                <div class="url">${download.url}</div>
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
                <div class="download-meta">
                    <div class="download-actions">
                        ${download.state === 'completed' ?
                    `<a href="${download.url}" class="btn btn-small" download>
                                <i class="fas fa-download"></i> Download
                            </a>` : ''}
                        ${download.state === 'error' && isOwner ?
                    `<button class="btn btn-small btn-retry" data-action="retry">
                                <i class="fas fa-redo"></i> Retry
                            </button>` : ''}
                        ${isOwner ?
                    `<button class="btn btn-small btn-delete" data-action="delete">
                                <i class="fas fa-trash"></i> Delete
                            </button>` : ''}
                    </div>
                    <div class="expires-at">
                        <i class="fas fa-clock"></i> ${timeLeft}
                    </div>
                </div>
            `;

            this.downloadsList.appendChild(item);
        });
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
        const ownerId = this.ownedDownloads.get(id);

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
}

// Initialize the download manager when the page loads
new DownloadManager();
