// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middleware/authMiddleware');

// Multer-Konfiguration: Datei im Speicher halten anstatt auf der Festplatte zu speichern.
// Dies ist effizienter für den direkten Upload in die Cloud.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Route für den Datei-Upload
// 1. `authMiddleware`: Stellt sicher, dass der Benutzer eingeloggt ist.
// 2. `upload.single('file')`: Verarbeitet eine einzelne Datei aus dem Formularfeld 'file'.
// 3. `fileController.uploadFile`: Führt unsere Upload-Logik aus.
router.post('/upload', authMiddleware, upload.single('file'), fileController.uploadFile);

// Route zum Auflisten aller Dateien für den eingeloggten Benutzer
router.get('/', authMiddleware, fileController.listFiles);

// Route zum Abrufen einer sicheren Download-URL für eine Datei
router.get('/:id/download', authMiddleware, fileController.getDownloadUrl);

// Route zum Löschen einer Datei (nur für Admins/Assistenten)
router.delete('/:id', authMiddleware, fileController.deleteFile);

router.post('/files/:id/track-download', authMiddleware, fileController.trackDownload);


module.exports = router;
