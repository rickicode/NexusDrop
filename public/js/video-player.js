export class VideoPlayer {
    constructor() {
        this.player = null;
        this.modal = document.getElementById('videoModal');
        this.closeBtn = this.modal.querySelector('.close');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.closeBtn.onclick = () => this.closePlayer();
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                this.closePlayer();
            }
        };

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closePlayer();
            }
        });
    }

    playVideo(download) {
        // Reset player if exists
        if (this.player) {
            this.player.dispose();
        }

        // Initialize video.js
        this.player = videojs('videoPlayer', {
            controls: true,
            autoplay: false,
            preload: 'auto',
            fluid: true,
            aspectRatio: '16:9'
        });

        // Set video source based on download state
        this.player.src({
            type: 'video/mp4', // Default to mp4, browser will handle other formats
            src: download.state === 'completed' ? `/downloads/${download.filename}` : download.url
        });

        // Show modal
        this.modal.style.display = 'block';
    }

    closePlayer() {
        this.modal.style.display = 'none';
        if (this.player) {
            this.player.pause();
        }
    }

    isVideoFile(filename) {
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
        return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    }
}
