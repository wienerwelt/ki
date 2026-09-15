const careerTarget = /^\/career\?partnerId=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}&entry=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}&mode=pending$/i;

export function getNotificationTarget(notification: { type?: string; target_url?: unknown }, role?: string): string | null {
    if (notification.type === 'career_review') {
        if (!['admin', 'assistenz'].includes(role || '')) return null;
        return typeof notification.target_url === 'string' && careerTarget.test(notification.target_url)
            ? notification.target_url
            : '/career?mode=pending';
    }
    if (['community_comment', 'community_like', 'community_mention'].includes(notification.type || '')) return '/community';
    if (notification.type === 'file_upload') return '/files';
    return null;
}
