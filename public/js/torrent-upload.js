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
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const fileName = e.target.files[0]?.name || 'No file chosen';
                if (this.fileLabel) {
                    this.fileLabel.textContent = fileName;
                }
            });
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (!this.fileInput.files.length) {
            notifications.error('Please select a torrent file');
            return;
        }

        const formData = new FormData(this.form);

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
            document.getElementById('expirationTime').value = this.expirationSelect.value;

            // Show success message
            notifications.success('Torrent uploaded successfully! Click Download to start.');

            // Reset form
            this.fileInput.value = '';
            if (this.fileLabel) {
                this.fileLabel.textContent = 'No file chosen';
            }
        } catch (error) {
            console.error('Torrent upload error:', error);
            notifications.error('Failed to upload torrent file');
        }
    }
}
