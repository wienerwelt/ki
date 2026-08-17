// backend/routes/communityRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const communityController = require('../controllers/communityController');
const multer = require('multer');

// Speicher im RAM, damit Sharp (für Bilder) arbeiten kann.
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Nur Bilder und Videos sind erlaubt!'), false);
        }
    }
});

router.use(authMiddleware);

// Kategorien
router.get('/categories', communityController.getCategories);

// Admin Route
router.get('/admin/posts', communityController.getAdminPosts);

// Leaderboard
router.get('/leaderboard', communityController.getLeaderboard);

// Feed & Posts
router.get('/feed', communityController.getFeed);
router.post('/feed', upload.single('image'), communityController.createPost);
router.delete('/feed/:id', communityController.deletePost);
router.put('/feed/:id', communityController.updatePost); // Editieren

// Likes
router.post('/feed/:postId/like', communityController.toggleLike);

// Kommentare
router.get('/feed/:postId/comments', communityController.getComments);
router.post('/feed/:postId/comments', communityController.createComment);

router.put('/feed/:id/pin', communityController.togglePin);
router.get('/members/:userId/profile', communityController.getMemberProfile);
router.get('/members', communityController.getMembers);
router.post('/report', communityController.reportContent);
router.post('/poll/vote', communityController.votePoll);

router.get('/experts', communityController.searchExperts);
router.get('/recent-comments', communityController.getRecentComments);
router.get('/feed/:id', communityController.getPostById);

module.exports = router;
