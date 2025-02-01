export function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond === 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const exp = Math.floor(Math.log(bytesPerSecond) / Math.log(1024));
    const speed = (bytesPerSecond / Math.pow(1024, exp)).toFixed(2);
    return `${speed} ${units[exp]}`;
}

export function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exp = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, exp)).toFixed(2);
    return `${size} ${units[exp]}`;
}

export function formatTimeRemaining(ms) {
    if (!ms || ms < 0) return 'Unknown';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

export function formatTimeLeft(expiresAt) {
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
