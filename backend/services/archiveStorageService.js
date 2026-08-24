const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3Client');

const ARCHIVE_PREFIX = 'system-archive/';
const CACHE_TTL_MS = 30_000;

let cachedArchive = null;
let cachedAt = 0;
let pendingRequest = null;

async function loadArchiveObjects() {
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!bucketName) {
        throw new Error('S3 Bucket Name ist nicht konfiguriert.');
    }

    const objects = [];
    let continuationToken;

    do {
        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: ARCHIVE_PREFIX,
            ContinuationToken: continuationToken,
        }));

        for (const object of response.Contents || []) {
            if (!object.Key || object.Key.endsWith('/')) continue;
            objects.push(object);
        }

        continuationToken = response.IsTruncated
            ? response.NextContinuationToken
            : undefined;
    } while (continuationToken);

    const files = objects
        .map((object) => ({
            key: object.Key,
            filename: object.Key.split('/').pop(),
            sizeBytes: Number(object.Size || 0),
            lastModified: object.LastModified,
        }))
        .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    const totalSizeBytes = files.reduce((total, file) => total + file.sizeBytes, 0);

    return {
        prefix: ARCHIVE_PREFIX,
        files,
        fileCount: files.length,
        totalSizeBytes,
        sizeMb: totalSizeBytes / (1024 * 1024),
    };
}

async function getArchiveStorage({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && cachedArchive && now - cachedAt < CACHE_TTL_MS) {
        return cachedArchive;
    }

    if (!pendingRequest) {
        pendingRequest = loadArchiveObjects()
            .then((archive) => {
                cachedArchive = archive;
                cachedAt = Date.now();
                return archive;
            })
            .finally(() => {
                pendingRequest = null;
            });
    }

    return pendingRequest;
}

module.exports = {
    ARCHIVE_PREFIX,
    getArchiveStorage,
};
