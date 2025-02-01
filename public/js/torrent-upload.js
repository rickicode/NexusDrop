import { notifications } from '../notifications.js';

export class TorrentUploader {
    constructor(form, urlInput) {
        this.form = form;
        this.urlInput = urlInput;

        if (this.form) {
            this.fileInput = this.form.querySelector('input[type="file"]');
            this.fileLabel = this.form.querySelector('.file-name');
            this.expirationSelect = this.form.querySelector('#torrentExpirationTime');
            this.initEventListeners();
        }
    }

    initEventListeners() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', async (e) => {
                const fileName = e.target.files[0]?.name || 'No file chosen';
                if (this.fileLabel) {
                    this.fileLabel.textContent = fileName;
                }
                await this.handleFileUpload();
            });
        }
    }

    async handleFileUpload() {

        if (!this.fileInput.files.length) return;

        const formData = new FormData();
        formData.append('torrent', this.fileInput.files[0]);
        formData.append('expirationTime', '1'); // Default to 1 hour

        try {
            const response = await fetch('/api/upload/torrent', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to upload torrent');
            }

            const result = await response.json();

            // Set magnet link and expiration in URL input form
            this.urlInput.value = result.magnetUri;
            document.getElementById('expirationTime').value = '1'; // Default to 1 hour

            // Reset form and show message
            this.fileInput.value = '';
            this.fileLabel.textContent = 'No file chosen';
            notifications.success('Torrent converted to magnet link - Click Download to start');
        } catch (error) {
            console.error('Torrent upload error:', error);
            notifications.error('Failed to upload torrent file');
        }
    }
}
