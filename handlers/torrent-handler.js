import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs';

class TorrentHandler {
    constructor(uploadsDir) {
        this.client = new WebTorrent();
        this.uploadsDir = uploadsDir;
        this.activeTorrents = new Map(); // Track active torrents by infoHash
        this.magnetUrls = new Map(); // Track magnet URLs to prevent duplicates
    }

    removeTorrent(infoHash) {
        const existing = this.activeTorrents.get(infoHash);
        if (existing) {
            existing.destroy();
            this.activeTorrents.delete(infoHash);
            // Find and remove the magnet URL associated with this infoHash
            for (const [magnetUrl, hash] of this.magnetUrls.entries()) {
                if (hash === infoHash) {
                    this.magnetUrls.delete(magnetUrl);
                    break;
                }
            }
        }
    }

    async startDownload(download, onProgress) {
        try {
            const filePath = path.join(this.uploadsDir, download.filename);

            // Check if this magnet URL is already being downloaded
            const existingInfoHash = this.magnetUrls.get(download.originalUrl);
            const existingTorrent = existingInfoHash ? this.activeTorrents.get(existingInfoHash) : null;

            // If torrent is already being downloaded, return error
            if (existingTorrent) {
                throw new Error('A torrent with the same id is already being seeded');
            }

            const torrent = this.client.add(download.originalUrl, { path: this.uploadsDir });
            this.activeTorrents.set(torrent.infoHash, torrent);
            this.magnetUrls.set(download.originalUrl, torrent.infoHash);

            torrent.on('download', () => {
                if (onProgress) {
                    onProgress({
                        downloadedBytes: torrent.downloaded,
                        progress: Math.round(torrent.progress * 100),
                        speed: torrent.downloadSpeed,
                        // Add torrent-specific info
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
                    // Find the largest file (usually the main content)
                    const mainFile = torrent.files.reduce((prev, current) =>
                        (prev.length > current.length) ? prev : current
                    );

                    // Move/rename the file
                    const originalPath = path.join(this.uploadsDir, mainFile.path);
                    fs.renameSync(originalPath, filePath);

                    // Cleanup other files
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
            });
        } catch (error) {
            throw error;
        }
    }

    async uploadTorrentFile(file) {
        return new Promise((resolve, reject) => {
            this.client.seed(file.buffer, {
                name: file.originalname,
                announce: [
                    "wss://tracker.openwebtorrent.com",
                    "wss://tracker.btorrent.xyz",
                    "wss://tracker.files.fm:7073/announce",
                    "udp://tracker.opentrackr.org:1337/announce",
                    "http://tracker.opentrackr.org:1337/announce",
                    "udp://open.demonii.com:1337/announce",
                    "http://open.tracker.cl:1337/announce",
                    "udp://open.stealth.si:80/announce",
                    "udp://tracker.torrent.eu.org:451/announce",
                    "udp://explodie.org:6969/announce",
                    "udp://exodus.desync.com:6969/announce",
                    "udp://opentracker.io:6969/announce",
                    "udp://tracker.tiny-vps.com:6969/announce",
                    "udp://tracker.theoks.net:6969/announce",
                    "udp://tracker.qu.ax:6969/announce",
                    "udp://tracker.ololosh.space:6969/announce",
                    "udp://tracker.dump.cl:6969/announce",
                    "udp://tracker.dler.org:6969/announce",
                    "udp://tracker.bittor.pw:1337/announce",
                    "udp://tracker.0x7c0.com:6969/announce",
                    "udp://tracker-udp.gbitt.info:80/announce",
                    "udp://open.free-tracker.ga:6969/announce",
                    "udp://open.dstud.io:6969/announce",
                    "udp://ns-1.x-fins.com:6969/announce",
                    "udp://isk.richardsw.club:6969/announce",
                    "udp://bt.ktrackers.com:6666/announce",
                    "http://www.torrentsnipe.info:2701/announce",
                    "http://www.genesis-sp.org:2710/announce",
                    "http://tracker.xiaoduola.xyz:6969/announce",
                    "http://tracker.vanitycore.co:6969/announce",
                    "http://tracker.qu.ax:6969/announce",
                    "http://tracker.lintk.me:2710/announce",
                    "http://tracker.dmcomic.org:2710/announce",
                    "http://tracker.corpscorp.online:80/announce",
                    "http://tracker.bz:80/announce",
                    "http://tracker.bt-hash.com:80/announce",
                    "http://tracker.bittor.pw:1337/announce",
                    "http://shubt.net:2710/announce",
                    "http://share.hkg-fansub.info:80/announce.php",
                    "http://servandroidkino.ru:80/announce",
                    "http://seeders-paradise.org:80/announce",
                    "http://open.trackerlist.xyz:80/announce",
                    "http://highteahop.top:6960/announce",
                    "http://finbytes.org:80/announce.php",
                    "http://buny.uk:6969/announce",
                    "http://bt1.xxxxbt.cc:6969/announce",
                    "http://bt.poletracker.org:2710/announce",
                    "http://0123456789nonexistent.com:80/announce",
                    "udp://wepzone.net:6969/announce",
                    "udp://ttk2.nbaonlineservice.com:6969/announce",
                    "udp://tracker2.dler.org:80/announce",
                    "udp://tracker1.myporn.club:9337/announce",
                    "udp://tracker.tryhackx.org:6969/announce",
                    "udp://tracker.torrust-demo.com:6969/announce",
                    "udp://tracker.gmi.gd:6969/announce",
                    "udp://tracker.gigantino.net:6969/announce",
                    "udp://tracker.filemail.com:6969/announce",
                    "udp://tracker.darkness.services:6969/announce",
                    "udp://tr4ck3r.duckdns.org:6969/announce",
                    "udp://t.overflow.biz:6969/announce",
                    "udp://retracker.lanta.me:2710/announce",
                    "udp://r.l5.ca:6969/announce",
                    "udp://p4p.arenabg.com:1337/announce",
                    "udp://p2p.publictracker.xyz:6969/announce",
                    "udp://martin-gebhardt.eu:25/announce",
                    "udp://ismaarino.com:1234/announce",
                    "udp://ipv4announce.sktorrent.eu:6969/announce",
                    "udp://evan.im:6969/announce",
                    "udp://d40969.acod.regrucolo.ru:6969/announce",
                    "udp://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce",
                    "udp://bandito.byterunner.io:6969/announce",
                    "udp://6ahddutb1ucc3cp.ru:6969/announce",
                    "https://tracker.yemekyedim.com:443/announce",
                    "https://tracker.cloudit.top:443/announce",
                    "https://tracker.bt4g.com:443/announce",
                    "https://tracker-zhuqiy.dgj055.icu:443/announce",
                    "https://tr.zukizuki.org:443/announce",
                    "https://tr.nyacat.pw:443/announce",
                    "https://sparkle.ghostchu-services.top:443/announce",
                    "https://api.ipv4online.uk:443/announce",
                    "http://wepzone.net:6969/announce",
                    "http://tracker810.xyz:11450/announce",
                    "http://tracker2.dler.org:80/announce",
                    "http://tracker.waaa.moe:6969/announce",
                    "http://tracker.sbsub.com:2710/announce",
                    "http://tracker.renfei.net:8080/announce",
                    "http://tracker.mywaifu.best:6969/announce",
                    "http://tracker.moxing.party:6969/announce",
                    "http://tracker.ipv6tracker.org:80/announce",
                    "http://tracker.dler.org:6969/announce",
                    "http://tracker.dler.com:6969/announce",
                    "http://tracker.darkness.services:6969/announce",
                    "http://tracker.bt4g.com:2095/announce",
                    "http://tracker-zhuqiy.dgj055.icu:80/announce",
                    "http://tr.nyacat.pw:80/announce",
                    "http://taciturn-shadow.spb.ru:6969/announce",
                    "http://t.overflow.biz:6969/announce",
                    "http://t.jaekr.sh:6969/announce",
                    "http://retracker.spark-rostov.ru:80/announce",
                    "http://r.l5.ca:6969/announce",
                    "http://p4p.arenabg.com:1337/announce",
                    "http://home.yxgz.club:6969/announce",
                    "http://fleira.no:6969/announce",
                    "http://ch3oh.ru:6969/announce",
                    "http://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce",
                    "http://0d.kebhana.mx:443/announce",
                    "udp://tracker.srv00.com:6969/announce",
                    "udp://tracker.fnix.net:6969/announce",
                    "udp://tracker.ddunlimited.net:6969/announce",
                    "udp://ipv4.rer.lol:2710/announce",
                    "udp://concen.org:6969/announce",
                    "udp://bt.rer.lol:6969/announce",
                    "udp://bt.rer.lol:2710/announce",
                    "https://tracker.lilithraws.org:443/announce",
                    "https://tracker.leechshield.link:443/announce",
                    "https://tracker.gcrenwp.top:443/announce",
                    "http://1337.abcvg.info:80/announce"
                ]
            }, torrent => {
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
