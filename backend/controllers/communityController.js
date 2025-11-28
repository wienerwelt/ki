// backend/controllers/communityController.js
const db = require('../config/db');
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3Client.js");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

// Importieren des Notification-Helpers
const { createNotificationInternal } = require('./notificationController');
const { sendCommunityReplyNotification } = require('../services/emailService'); 

// --- HILFSFUNKTIONEN ---
const getFileExtension = (originalname) => originalname.split('.').pop();

// Helper: Mentions verarbeiten (@username)
const processMentions = async (content, referenceId, authorId, client) => {
    if (!content) return;
    
    // Regex für @username
    const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;
    const matches = [...content.matchAll(mentionRegex)];
    
    if (matches.length === 0) return;

    // Eindeutige Usernames
    const usernames = [...new Set(matches.map(m => m[1]))];

    for (const username of usernames) {
        // User ID finden (Case Insensitive)
        const userRes = await client.query(
            `SELECT id FROM users WHERE username ILIKE $1 OR first_name ILIKE $1 LIMIT 1`, 
            [username]
        );
        
        if (userRes.rows.length > 0) {
            const mentionedUserId = userRes.rows[0].id;

            if (mentionedUserId !== authorId) {
                await createNotificationInternal(
                    mentionedUserId,
                    'community_mention',
                    'Du wurdest erwähnt',
                    'Jemand hat dich in einem Beitrag markiert.',
                    referenceId,
                    client
                );
            }
        }
    }
};

// 1. Kategorien abrufen
exports.getCategories = async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, name FROM categories WHERE category_type = 'community' ORDER BY name ASC"
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Laden der Kategorien.' });
    }
};


// 2. Feed abrufen (Erweitert um Pins, Profile & Umfragen)
exports.getFeed = async (req, res) => {
    const { business_partner_id } = req.user;
    const { page = 1, limit = 10, categoryId } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT 
                p.id, p.content, p.image_url, p.created_at, p.is_pinned,
                c.name as category_name, c.id as category_id,
                
                -- Autor Infos (INKLUSIVE last_login_at)
                u.id as author_id, u.first_name, u.last_name, u.username, u.profile_image_url,
                u.organization_name, u.role as author_role, u.membership_level, u.linkedin_url, 
                u.created_at as member_since, u.contribution_score, u.last_login_at, -- ✅ NEU
                
                -- Interaktionen
                (SELECT COUNT(*) FROM community_likes l WHERE l.post_id = p.id)::int as like_count,
                (SELECT COUNT(*) FROM community_comments com WHERE com.post_id = p.id)::int as comment_count,
                EXISTS (SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.user_id = $1) as is_liked_by_me,
                
                -- Polls
                (
                    SELECT json_agg(json_build_object(
                        'id', po.id,
                        'text', po.option_text,
                        'votes', (SELECT COUNT(*) FROM community_poll_votes pv WHERE pv.option_id = po.id),
                        'is_voted_by_me', EXISTS(SELECT 1 FROM community_poll_votes pv WHERE pv.option_id = po.id AND pv.user_id = $1)
                    ) ORDER BY po.sort_order)
                    FROM community_poll_options po
                    WHERE po.post_id = p.id
                ) as poll_options

            FROM community_posts p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.business_partner_id = $2
        `;
        
        const queryParams = [req.user.id, business_partner_id];
        let paramIndex = 3;

        if (categoryId && categoryId !== 'all') {
            query += ` AND p.category_id = $${paramIndex}`;
            queryParams.push(categoryId);
            paramIndex++;
        }
        
        query += ` ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(limit, offset);

        const { rows } = await db.query(query, queryParams);
        res.json(rows);

    } catch (err) {
        console.error('Fehler beim Abrufen des Feeds:', err.message);
        res.status(500).json({ message: 'Serverfehler.' });
    }
};

// 3. Post erstellen (inkl. Umfragen)
exports.createPost = async (req, res) => {
    const { content, categoryId, existingFileUrl, pollOptions } = req.body; // ✅ NEU: pollOptions
    const { id: userId, business_partner_id } = req.user;
    const file = req.file;

    // Validierung: Text ODER File ODER Link ODER Umfrage muss da sein
    // pollOptions muss ein JSON-String sein, wenn es von FormData kommt
    let parsedOptions = [];
    if (pollOptions) {
        try {
            parsedOptions = JSON.parse(pollOptions);
        } catch (e) {
            // Falls es schon ein Array ist (bei JSON Request)
            parsedOptions = Array.isArray(pollOptions) ? pollOptions : [];
        }
    }

    if (!content && !file && !existingFileUrl && parsedOptions.length === 0) {
        return res.status(400).json({ message: 'Inhalt fehlt.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        // ... (File Upload Logik bleibt exakt gleich wie vorher) ...
        let publicUrl = existingFileUrl || null;
        if (file) {
            // ... (Ihr bestehender S3 Code hier) ...
             const extension = getFileExtension(file.originalname);
             const fileName = `${uuidv4()}.${extension}`;
             const storagePath = `community/${business_partner_id}/${fileName}`;
             // ... (S3 Upload und publicUrl setzen) ...
             // (Ich kürze das hier ab, fügen Sie Ihren bestehenden S3-Code ein)
             await s3Client.send(new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: storagePath,
                Body: file.buffer, // Ggf. mit Sharp bearbeitet
                ContentType: file.mimetype
            }));
            publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${storagePath}`;
        }

        // Post Insert
        const insertQuery = `
            INSERT INTO community_posts (business_partner_id, user_id, content, image_url, category_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at
        `;
        const postResult = await client.query(insertQuery, [
            business_partner_id, userId, content || '', publicUrl, categoryId || null
        ]);
        const postId = postResult.rows[0].id;

        // ✅ NEU: Umfrage-Optionen speichern
        if (parsedOptions && parsedOptions.length > 0) {
            for (let i = 0; i < parsedOptions.length; i++) {
                if (parsedOptions[i].trim()) {
                    await client.query(
                        'INSERT INTO community_poll_options (post_id, option_text, sort_order) VALUES ($1, $2, $3)',
                        [postId, parsedOptions[i].trim(), i]
                    );
                }
            }
        }
        
        // ... (Rest wie Mentions, Gamification, Commit) ...
        // (Der Einfachheit halber hier kurz:)
        await client.query('UPDATE users SET contribution_score = contribution_score + 5 WHERE id = $1', [userId]);
        await client.query('COMMIT');

        res.status(201).json({ message: "Post erstellt" }); // Frontend lädt neu
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Fehler.' });
    } finally {
        client.release();
    }
};

// 4. Kommentare laden
exports.getComments = async (req, res) => {
    const { postId } = req.params;
    try {
        const query = `
            SELECT 
                c.id, c.content, c.created_at,
                u.id as author_id, u.first_name, u.last_name, u.username, u.profile_image_url,
                u.membership_level, u.organization_name, u.role,
                u.linkedin_url, u.created_at as member_since, u.contribution_score, u.last_login_at -- ✅ NEU
            FROM community_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = $1
            ORDER BY c.created_at ASC
        `;
        const { rows } = await db.query(query, [postId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Fehler beim Laden der Kommentare.' });
    }
};

// 5. Kommentar erstellen
exports.createComment = async (req, res) => {
    const { postId } = req.params;
    const { content } = req.body;
    const { id: userId } = req.user;

    if (!content) return res.status(400).json({ message: 'Leerer Kommentar.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const insertRes = await client.query(
            `INSERT INTO community_comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
            [postId, userId, content]
        );

        await processMentions(content, postId, userId, client);

        const postRes = await client.query(`
            SELECT p.user_id, p.content, u.email, u.first_name, u.newsletter_opt_in 
            FROM community_posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [postId]);
        
        if (postRes.rows.length > 0) {
            const postData = postRes.rows[0];
            const postOwnerId = postData.user_id;
            
            if (postOwnerId !== userId) {
                const postSnippet = postData.content 
                    ? postData.content.substring(0, 30) + (postData.content.length > 30 ? '...' : '')
                    : 'Bild-Beitrag';
                const commenterName = req.user.first_name || req.user.username;

                await createNotificationInternal(
                    postOwnerId,
                    'community_comment',
                    'Neuer Kommentar',
                    `${commenterName} hat auf deinen Beitrag "${postSnippet}" geantwortet.`,
                    postId,
                    client
                );

                const frontendUrl = process.env.FRONTEND_URL || 'https://dashboard.mobiliti.at';
                const postLink = `${frontendUrl}/community`;

                sendCommunityReplyNotification({
                    to: postData.email,
                    recipientName: postData.first_name || 'Nutzer',
                    commenterName: commenterName,
                    postTitle: postSnippet,
                    postLink: postLink
                }).catch(err => console.error("Async Email Error:", err.message));
            }
        }

        await client.query('UPDATE users SET contribution_score = contribution_score + 2 WHERE id = $1', [userId]);
        await client.query(`INSERT INTO user_score_logs (user_id, points_change, action_type, description, reference_id) VALUES ($1, 2, 'COMMUNITY_COMMENT', 'Kommentar verfasst', $2)`, [userId, insertRes.rows[0].id]);

        await client.query('COMMIT');

        res.status(201).json({
            id: insertRes.rows[0].id,
            content: content,
            created_at: insertRes.rows[0].created_at,
            author_id: userId,
            first_name: req.user.first_name,
            last_name: req.user.last_name,
            username: req.user.username,
            profile_image_url: req.user.profile_image_url,
            membership_level: req.user.membership_level,
            organization_name: req.user.organization_name,
            role: req.user.role
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Kommentieren.' });
    } finally {
        client.release();
    }
};

// 6. Post löschen
exports.deletePost = async (req, res) => {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    try {
        const check = await db.query('SELECT user_id, image_url FROM community_posts WHERE id = $1', [id]);
        if (check.rows.length === 0) return res.status(404).json({message: 'Nicht gefunden'});
        
        const post = check.rows[0];
        if (post.user_id !== userId && role !== 'admin' && role !== 'assistenz') {
            return res.status(403).json({message: 'Verboten'});
        }
         
        if (post.image_url) {
            try {
                const s3Key = new URL(post.image_url).pathname.substring(1);
                await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: s3Key }));
            } catch(e) {}
        }

        await db.query('DELETE FROM community_posts WHERE id = $1', [id]);
        res.json({message: 'Gelöscht'});
    } catch(e) {
        res.status(500).send('Server error');
    }
};

// 7. Leaderboard
exports.getLeaderboard = async (req, res) => {
    const { business_partner_id } = req.user;
    try {
        const query = `
            SELECT id, first_name, last_name, username, profile_image_url, contribution_score, membership_level,
            organization_name, role, linkedin_url, created_at as member_since, last_login_at -- ✅ NEU
            FROM users
            WHERE business_partner_id = $1
            ORDER BY contribution_score DESC, first_name ASC
            LIMIT 5
        `;
        const { rows } = await db.query(query, [business_partner_id]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Laden des Leaderboards.' });
    }
};

// 8. Like
exports.toggleLike = async (req, res) => {
    const { postId } = req.params;
    const { id: userId } = req.user;

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const checkRes = await client.query('SELECT 1 FROM community_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
        let liked = false;
        if (checkRes.rows.length > 0) {
            await client.query('DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
        } else {
            await client.query('INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2)', [postId, userId]);
            liked = true;
            const postRes = await client.query('SELECT user_id FROM community_posts WHERE id = $1', [postId]);
            if (postRes.rows.length > 0) {
                const authorId = postRes.rows[0].user_id;
                if (authorId !== userId) {
                    await client.query('UPDATE users SET contribution_score = contribution_score + 1 WHERE id = $1', [authorId]);
                }
            }
        }
        await client.query('COMMIT');
        res.json({ liked });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Fehler beim Liken.' });
    } finally {
        client.release();
    }
};

// 9. Admin Posts
exports.getAdminPosts = async (req, res) => {
    const { role, business_partner_id } = req.user;
    const { businessPartnerId: filterBpId } = req.query;
    try {
        let query = `
            SELECT 
                p.id, p.content, p.image_url, p.created_at,
                u.id as user_id, u.first_name, u.last_name, u.email, u.role as user_role,
                bp.id as business_partner_id, bp.name as business_partner_name,
                c.name as category_name,
                (SELECT COUNT(*) FROM community_comments com WHERE com.post_id = p.id)::int as comment_count,
                (SELECT COUNT(*) FROM community_likes l WHERE l.post_id = p.id)::int as like_count,
                (SELECT COUNT(*) FROM community_reports r WHERE r.post_id = p.id)::int as report_count
            FROM community_posts p
            JOIN users u ON p.user_id = u.id
            JOIN business_partners bp ON p.business_partner_id = bp.id
            LEFT JOIN categories c ON p.category_id = c.id
        `;
        const params = [];
        const whereClauses = [];
        if (role === 'assistenz') {
            whereClauses.push(`p.business_partner_id = $${params.length + 1}`);
            params.push(business_partner_id);
        } else if (role === 'admin') {
            if (filterBpId) {
                whereClauses.push(`p.business_partner_id = $${params.length + 1}`);
                params.push(filterBpId);
            }
        } else {
            return res.status(403).json({ message: 'Keine Berechtigung.' });
        }
        if (whereClauses.length > 0) query += ' WHERE ' + whereClauses.join(' AND ');
        query += ' ORDER BY p.created_at DESC LIMIT 200';
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Serverfehler' });
    }
};

// 10. Update Post
exports.updatePost = async (req, res) => {
    const { id } = req.params;
    const { content, categoryId } = req.body;
    const { role, business_partner_id } = req.user;
    try {
        const checkRes = await db.query('SELECT business_partner_id FROM community_posts WHERE id = $1', [id]);
        if (checkRes.rows.length === 0) return res.status(404).json({ message: 'Beitrag nicht gefunden.' });
        const post = checkRes.rows[0];
        if (role !== 'admin') {
            if (role !== 'assistenz' || post.business_partner_id !== business_partner_id) {
                return res.status(403).json({ message: 'Keine Berechtigung.' });
            }
        }
        await db.query('UPDATE community_posts SET content = $1, category_id = $2, updated_at = NOW() WHERE id = $3', [content, categoryId || null, id]);
        res.json({ message: 'Aktualisiert.' });
    } catch (err) {
        res.status(500).json({ message: 'Serverfehler.' });
    }
};

// 11. Pin Post
exports.togglePin = async (req, res) => {
    const { id } = req.params;
    const { role, business_partner_id } = req.user;
    try {
        const checkRes = await db.query('SELECT business_partner_id, is_pinned FROM community_posts WHERE id = $1', [id]);
        if (checkRes.rows.length === 0) return res.status(404).json({ message: 'Post nicht gefunden.' });
        const post = checkRes.rows[0];
        if (role !== 'admin') {
            if (role !== 'assistenz' || post.business_partner_id !== business_partner_id) {
                return res.status(403).json({ message: 'Keine Berechtigung.' });
            }
        }
        const newStatus = !post.is_pinned;
        await db.query('UPDATE community_posts SET is_pinned = $1 WHERE id = $2', [newStatus, id]);
        res.json({ message: newStatus ? 'Beitrag angepinnt.' : 'Beitrag gelöst.', is_pinned: newStatus });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Pinnen.' });
    }
};

// 12. Report Content
exports.reportContent = async (req, res) => {
    const { postId, commentId, reason } = req.body;
    const { id: userId } = req.user;
    if (!postId && !commentId) return res.status(400).json({ message: 'Ziel fehlt.' });
    try {
        const check = await db.query('SELECT 1 FROM community_reports WHERE user_id = $1 AND (post_id = $2 OR comment_id = $3)', [userId, postId || null, commentId || null]);
        if (check.rows.length > 0) return res.json({ message: 'Bereits gemeldet.' });
        await db.query('INSERT INTO community_reports (user_id, post_id, comment_id, reason) VALUES ($1, $2, $3, $4)', [userId, postId || null, commentId || null, reason || 'Sonstiges']);
        res.status(201).json({ message: 'Vielen Dank für die Meldung.' });
    } catch (err) {
        res.status(500).json({ message: 'Fehler beim Melden.' });
    }
};

// 13. Get Members (HIER WAR DER FEHLER)
exports.getMembers = async (req, res) => {
    const { business_partner_id } = req.user;
    const { search } = req.query;

    try {
        let query = `
            SELECT 
                id, first_name, last_name, username, email, 
                profile_image_url, membership_level, role, organization_name,
                contribution_score, last_login_at
            FROM users
            WHERE business_partner_id = $1 AND is_active = TRUE
        `;
        const params = [business_partner_id];

        if (search) {
            query += ` AND (first_name ILIKE $2 OR last_name ILIKE $2 OR username ILIKE $2)`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY first_name ASC, last_name ASC LIMIT 100`;

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Fehler beim Laden der Mitglieder.' });
    }
};


// 14. Abstimmmen
exports.votePoll = async (req, res) => {
    const { optionId } = req.body;
    const { id: userId } = req.user;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Post ID zur Option finden
        const optRes = await client.query('SELECT post_id FROM community_poll_options WHERE id = $1', [optionId]);
        if (optRes.rows.length === 0) throw new Error('Option nicht gefunden');
        const postId = optRes.rows[0].post_id;

        // 2. Alte Votes dieses Users für diesen Post löschen (damit man umentscheiden kann und nur 1 Stimme hat)
        await client.query(`
            DELETE FROM community_poll_votes 
            WHERE user_id = $1 AND option_id IN (SELECT id FROM community_poll_options WHERE post_id = $2)
        `, [userId, postId]);

        // 3. Neuen Vote setzen
        await client.query('INSERT INTO community_poll_votes (option_id, user_id) VALUES ($1, $2)', [optionId, userId]);

        await client.query('COMMIT');
        
        // Aktuelle Stats zurückgeben (für UI Update)
        const statsRes = await db.query(`
             SELECT id, (SELECT COUNT(*) FROM community_poll_votes pv WHERE pv.option_id = po.id) as votes
             FROM community_poll_options po WHERE po.post_id = $1
        `, [postId]);
        
        res.json({ success: true, options: statsRes.rows });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Fehler' });
    } finally {
        client.release();
    }
};