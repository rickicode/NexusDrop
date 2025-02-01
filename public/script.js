class DownloadManager {
    constructor() {
        this.form = document.getElementById('downloadForm');
        this.urlInput = document.getElementById('urlInput');
        this.expirationSelect = document.getElementById('expirationTime');
        this.downloadsList = document.getElementById('downloadsList');
        this.downloads = new Map();
        this.ownedDownloads = new Map(JSON.parse(localStorage.getItem('ownedDownloads') || '[]'));

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
                this.downloads.set(id, download);
            });

            this.renderDownloads();
        } catch (error) {
            console.error('Failed to load downloads:', error);
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

            const statusText = {
                pending: 'Pending...',
                downloading: `Downloading (${download.progress}%)`,
                completed: 'Completed',
                error: download.error || 'Failed'
            }[download.state];

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
                    `<a href="/downloads/${download.filename}" class="btn btn-small" download>
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

            this.urlInput.value = '';
            await this.loadDownloads();
        } catch (error) {
            console.error('Download error:', error);
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
            await this.loadDownloads();
        } catch (error) {
            console.error('Action failed:', error);
        }
    }
}

// Initialize the download manager when the page loads
new DownloadManager();
