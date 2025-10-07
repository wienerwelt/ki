// backend/controllers/surveyController.js
const db = require('../config/db');

// Holt alle Umfragen für die Admin-Ansicht eines Business Partners
exports.getSurveysForAdmin = async (req, res) => {
    const { role, business_partner_id } = req.user;
    
    try {
        let query = 'SELECT s.*, bp.name as business_partner_name FROM surveys s JOIN business_partners bp ON s.business_partner_id = bp.id';
        const params = [];

        if (role === 'assistenz') {
            query += ' WHERE s.business_partner_id = $1';
            params.push(business_partner_id);
        }
        
        query += ' ORDER BY s.created_at DESC';

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Laden der Umfragen für Admin:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.getArchivedSurveysForUser = async (req, res) => {
    const { id: userId } = req.user;
    try {
        const query = `
            SELECT s.id, s.title, s.description,
                   (SELECT MAX(sr.created_at) FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = $1) as completed_at
            FROM surveys s
            WHERE EXISTS (
                SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = $1
            )
            ORDER BY completed_at DESC;
        `;
        const { rows } = await db.query(query, [userId]);
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Laden des Umfrage-Archivs:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.createSurvey = async (req, res) => {
    const { business_partner_id: user_bp_id, role } = req.user;
    const { title, description, questions, start_date, end_date, status, target_bp_id } = req.body;

    let final_bp_id;
    if (role === 'assistenz') {
        final_bp_id = user_bp_id;
    } else if (role === 'admin') {
        final_bp_id = target_bp_id;
    }

    if (!final_bp_id) {
        return res.status(403).json({ message: 'Die Zuordnung zu einem Business Partner ist ungültig oder fehlt.' });
    }

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ message: 'Titel und mindestens eine Frage sind erforderlich.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const surveyRes = await client.query(
            'INSERT INTO surveys (business_partner_id, title, description, status, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [final_bp_id, title, description, status, start_date || null, end_date || null]
        );
        const surveyId = surveyRes.rows[0].id;

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await client.query(
                'INSERT INTO survey_questions (survey_id, question_text, question_type, options, display_order) VALUES ($1, $2, $3, $4, $5)',
                [surveyId, q.question_text, q.question_type, JSON.stringify(q.options || []), i]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: surveyId, title });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Erstellen der Umfrage:', err.message);
        res.status(500).send('Serverfehler');
    } finally {
        client.release();
    }
};

// Holt aktive Umfragen für das Dashboard-Widget
exports.getActiveSurveysForWidget = async (req, res) => {
    const { id: userId } = req.user;
    try {
        const { rows: surveys } = await db.query(
            `SELECT s.id, s.title, s.description
             FROM surveys s
             WHERE s.status = 'active'
             AND (s.start_date IS NULL OR s.start_date <= NOW())
             AND (s.end_date IS NULL OR s.end_date >= NOW())
             AND NOT EXISTS (
                 SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = $1
             )
             ORDER BY s.created_at DESC LIMIT 5`,
            [userId]
        );

        if (surveys.length === 0) {
            return res.json([]);
        }

        const surveyIds = surveys.map(s => s.id);
        const { rows: questions } = await db.query(
            'SELECT * FROM survey_questions WHERE survey_id = ANY($1::uuid[]) ORDER BY display_order ASC',
            [surveyIds]
        );

        const surveysWithQuestions = surveys.map(s => ({
            ...s,
            questions: questions.filter(q => q.survey_id === s.id)
        }));

        res.json(surveysWithQuestions);
    } catch (err) {
        console.error('Fehler beim Laden aktiver Umfragen:', err.message);
        res.status(500).send('Serverfehler');
    }
};

// Speichert die Antworten eines Nutzers zu einer Umfrage
exports.submitSurveyResponse = async (req, res) => {
    const { id: userId } = req.user;
    const { surveyId, responses } = req.body; // responses = { questionId: "antwort", ... }

    if (!surveyId || !responses || Object.keys(responses).length === 0) {
        return res.status(400).json({ message: 'Antworten sind erforderlich.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        for (const questionId in responses) {
            const responseText = responses[questionId];
            await client.query(
                `INSERT INTO survey_responses (survey_id, question_id, user_id, response_text)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (question_id, user_id) DO NOTHING`,
                [surveyId, questionId, userId, responseText]
            );
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Vielen Dank für Ihre Teilnahme!' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Speichern der Antworten:', err.message);
        res.status(500).send('Serverfehler');
    } finally {
        client.release();
    }
};

// Holt die aggregierten Ergebnisse einer Umfrage für die grafische Darstellung
exports.getSurveyResults = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: questions } = await db.query(
            'SELECT id, question_text, question_type, options FROM survey_questions WHERE survey_id = $1 ORDER BY display_order ASC',
            [id]
        );

        const results = [];
        for (const q of questions) {
            let questionResult;
            if (q.question_type === 'multiple-choice') {
                const { rows: counts } = await db.query(
                    `SELECT response_text, COUNT(*) as count
                     FROM survey_responses
                     WHERE question_id = $1
                     GROUP BY response_text`,
                    [q.id]
                );
                questionResult = { ...q, results: counts };
            } else { // 'free-text'
                const { rows: texts } = await db.query(
                    'SELECT response_text FROM survey_responses WHERE question_id = $1',
                    [q.id]
                );
                // WORTWOLKEN-Logik: Zähle die Worthäufigkeiten
                const wordCounts = texts.reduce((acc, { response_text }) => {
                    if (!response_text) return acc;
                    // Einfache Normalisierung: Kleinschreibung, Satzzeichen entfernen, unwichtige Wörter filtern
                    const stopWords = new Set(['und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'ich', 'wir', 'es', 'nicht', 'mit', 'zu', 'im']);
                    const words = response_text.toLowerCase().replace(/[.,!?;:"()]/g, '').split(/\s+/);
                    words.forEach(word => {
                        if (word && !stopWords.has(word) && word.length > 2) {
                            acc[word] = (acc[word] || 0) + 1;
                        }
                    });
                    return acc;
                }, {});

                const wordCloudData = Object.entries(wordCounts).map(([text, value]) => ({ text, value }));
                questionResult = { ...q, results: wordCloudData };
            }
            results.push(questionResult);
        }
        res.json(results);
    } catch (err) {
        console.error('Fehler beim Laden der Umfrageergebnisse:', err.message);
        res.status(500).send('Serverfehler');
    }
};


exports.getSurveyForEdit = async (req, res) => {
    const { id } = req.params;
    try {
        const surveyRes = await db.query('SELECT * FROM surveys WHERE id = $1', [id]);
        if (surveyRes.rows.length === 0) {
            return res.status(404).json({ message: 'Umfrage nicht gefunden.' });
        }
        const questionsRes = await db.query('SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY display_order ASC', [id]);
        
        const survey = surveyRes.rows[0];
        survey.questions = questionsRes.rows;

        res.json(survey);
    } catch (err) {
        console.error('Fehler beim Laden der Umfrage zum Bearbeiten:', err.message);
        res.status(500).send('Serverfehler');
    }
};


exports.updateSurvey = async (req, res) => {
    const { id } = req.params;
    const { title, description, questions, start_date, end_date, status } = req.body;

    // ... (Hier könnte eine Berechtigungsprüfung für den User erfolgen) ...

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        await client.query(
            'UPDATE surveys SET title = $1, description = $2, status = $3, start_date = $4, end_date = $5, updated_at = NOW() WHERE id = $6',
            [title, description, status, start_date || null, end_date || null, id]
        );
        
        // Alte Fragen löschen und neue einfügen (einfachster Weg für Updates)
        await client.query('DELETE FROM survey_questions WHERE survey_id = $1', [id]);

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await client.query(
                'INSERT INTO survey_questions (survey_id, question_text, question_type, options, display_order) VALUES ($1, $2, $3, $4, $5)',
                [id, q.question_text, q.question_type, JSON.stringify(q.options || []), i]
            );
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Umfrage erfolgreich aktualisiert.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Fehler beim Aktualisieren der Umfrage:', err.message);
        res.status(500).send('Serverfehler');
    } finally {
        client.release();
    }
};


