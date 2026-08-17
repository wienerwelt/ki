// backend/controllers/surveyController.js
const db = require('../config/db');

const canAccessSurvey = async (req, surveyId) => {
    const { rows } = await db.query('SELECT id, business_partner_id, status, start_date, end_date FROM surveys WHERE id = $1', [surveyId]);
    const survey = rows[0];
    if (!survey) return null;
    if (req.user.role === 'admin' || String(survey.business_partner_id) === String(req.user.business_partner_id)) return survey;
    return null;
};

// --- HILFSFUNKTION: Auto-Close abgelaufener Umfragen ---
// Diese Funktion stellt sicher, dass die Datenbank immer aktuell ist, ohne Cronjob.
const autoCloseExpiredSurveys = async () => {
    try {
        await db.query(`
            UPDATE surveys 
            SET status = 'closed', updated_at = NOW() 
            WHERE status = 'active' AND end_date IS NOT NULL AND end_date < NOW()
        `);
    } catch (err) {
        console.error('Fehler beim Auto-Close von Umfragen:', err.message);
    }
};

// Holt alle Umfragen für die Admin-Ansicht eines Business Partners
exports.getSurveysForAdmin = async (req, res) => {
    const { role, business_partner_id } = req.user;
    
    try {
        // Erst aufräumen (abgelaufene schließen)
        await autoCloseExpiredSurveys();

        let query = `
            SELECT 
                s.*, 
                bp.name as business_partner_name,
                (SELECT COUNT(DISTINCT user_id) FROM survey_responses sr WHERE sr.survey_id = s.id)::int as participant_count
            FROM surveys s 
            JOIN business_partners bp ON s.business_partner_id = bp.id
        `;
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
    const { id: userId, business_partner_id: businessPartnerId } = req.user;
    try {
        await autoCloseExpiredSurveys(); // Auch hier kurz aufräumen
        
        const query = `
            SELECT s.id, s.title, s.description, s.status,
                   (SELECT MAX(sr.created_at) FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = $1) as completed_at
            FROM surveys s
            WHERE s.business_partner_id = $2 AND (
                -- Bedingung 1: User hat teilgenommen
                EXISTS (
                    SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = $1
                )
                -- ODER Bedingung 2: Umfrage ist offiziell beendet
                OR s.status = 'closed'
            )
            ORDER BY COALESCE(completed_at, s.end_date, s.created_at) DESC;
        `;
        const { rows } = await db.query(query, [userId, businessPartnerId]);
        res.json(rows);
    } catch (err) {
        console.error('Fehler beim Laden des Umfrage-Archivs:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.createSurvey = async (req, res) => {
    const { business_partner_id: user_bp_id, role } = req.user;
    const { title, description, questions, start_date, end_date, status, target_bp_id } = req.body;

    let final_bp_id = role === 'admin' ? target_bp_id : user_bp_id;

    if (!final_bp_id) {
        return res.status(400).json({ message: 'Die Zuordnung zu einem Business Partner fehlt.' });
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
    const { id: userId, business_partner_id } = req.user; 
    
    try {
        await autoCloseExpiredSurveys(); // Auch hier kurz aufräumen

        const { rows: surveys } = await db.query(
            `SELECT s.id, s.title, s.description
             FROM surveys s
             WHERE s.status = 'active'
             AND s.business_partner_id = $2
             AND (s.start_date IS NULL OR s.start_date <= NOW())
             AND NOT EXISTS (
                 SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.user_id = $1
             )
             ORDER BY s.created_at DESC LIMIT 5`,
            [userId, business_partner_id]
        );

        if (surveys.length === 0) return res.json([]);

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

// Speichert die Antworten
exports.submitSurveyResponse = async (req, res) => {
    const { id: userId } = req.user;
    const { surveyId, responses } = req.body;

    if (!surveyId || !responses || Object.keys(responses).length === 0) {
        return res.status(400).json({ message: 'Antworten sind erforderlich.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const surveyAccess = await client.query(
            `SELECT id FROM surveys
             WHERE id = $1 AND business_partner_id = $2 AND status = 'active'
               AND (start_date IS NULL OR start_date <= NOW())
               AND (end_date IS NULL OR end_date >= NOW())`,
            [surveyId, req.user.business_partner_id]
        );
        if (surveyAccess.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Umfrage ist nicht verfügbar.' });
        }

        const allowedQuestions = await client.query('SELECT id FROM survey_questions WHERE survey_id = $1', [surveyId]);
        const allowedQuestionIds = new Set(allowedQuestions.rows.map((row) => String(row.id)));

        for (const questionId in responses) {
            if (!allowedQuestionIds.has(String(questionId))) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Eine Antwort gehört nicht zu dieser Umfrage.' });
            }
            let responseText = responses[questionId];
            if (Array.isArray(responseText)) {
                responseText = JSON.stringify(responseText);
            }

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

// Holt die aggregierten Ergebnisse einer Umfrage
exports.getSurveyResults = async (req, res) => {
    const { id } = req.params;
    try {
        if (!await canAccessSurvey(req, id)) return res.status(404).json({ message: 'Umfrage nicht gefunden.' });
        const { rows: questions } = await db.query(
            'SELECT id, question_text, question_type, options FROM survey_questions WHERE survey_id = $1 ORDER BY display_order ASC',
            [id]
        );

        const results = [];
        for (const q of questions) {
            let questionResult;
            
            if (q.question_type === 'single-choice' || q.question_type === 'multiple-choice') {
                const { rows } = await db.query(
                    'SELECT response_text FROM survey_responses WHERE question_id = $1',
                    [q.id]
                );
                
                // Da wir in `submitSurveyResponse` ein ON CONFLICT auf (question_id, user_id) haben,
                // entspricht rows.length genau der Anzahl an einzigartigen Usern!
                const unique_users = rows.length; 

                const tally = {};
                rows.forEach(row => {
                    if (!row.response_text) return;
                    let answers = [];
                    try {
                        const parsed = JSON.parse(row.response_text);
                        answers = Array.isArray(parsed) ? parsed : [row.response_text];
                    } catch(e) {
                        answers = [row.response_text];
                    }
                    answers.forEach(ans => { tally[ans] = (tally[ans] || 0) + 1; });
                });

                const counts = Object.keys(tally).map(key => ({ response_text: key, count: tally[key] }));
                questionResult = { ...q, results: counts, unique_users };
                
            } else { 
                // FREITEXT: Frontend erwartet die echten Texte, keine Wort-Zählung!
                const { rows } = await db.query('SELECT response_text FROM survey_responses WHERE question_id = $1 AND response_text IS NOT NULL', [q.id]);
                questionResult = { ...q, results: rows, unique_users: rows.length };
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
        const accessibleSurvey = await canAccessSurvey(req, id);
        if (!accessibleSurvey) {
            return res.status(404).json({ message: 'Umfrage nicht gefunden.' });
        }
        const surveyRes = await db.query('SELECT * FROM surveys WHERE id = $1', [id]);
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

    const client = await db.connect();
    try {
        if (!await canAccessSurvey(req, id)) return res.status(404).json({ message: 'Umfrage nicht gefunden.' });
        await client.query('BEGIN');
        
        await client.query(
            `UPDATE surveys SET title = $1, description = $2, status = $3, start_date = $4, end_date = $5, updated_at = NOW()
             WHERE id = $6 AND ($7::uuid IS NULL OR business_partner_id = $7::uuid)`,
            [title, description, status, start_date || null, end_date || null, id, req.user.role === 'assistenz' ? req.user.business_partner_id : null]
        );
        
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

// NEU: Umfrage löschen
exports.deleteSurvey = async (req, res) => {
    const { id } = req.params;
    const { role, business_partner_id } = req.user;

    try {
        const check = await db.query('SELECT business_partner_id FROM surveys WHERE id = $1', [id]);
        if (check.rows.length === 0) return res.status(404).json({ message: 'Umfrage nicht gefunden.' });

        if (role !== 'admin' && (role !== 'assistenz' || check.rows[0].business_partner_id !== business_partner_id)) {
            return res.status(403).json({ message: 'Keine Berechtigung zum Löschen.' });
        }

        // Durch ON DELETE CASCADE auf den Foreign Keys werden Fragen und Antworten automatisch mitgelöscht
        await db.query('DELETE FROM surveys WHERE id = $1', [id]);
        res.json({ message: 'Umfrage erfolgreich gelöscht.' });
    } catch (err) {
        console.error('Fehler beim Löschen der Umfrage:', err.message);
        res.status(500).send('Serverfehler');
    }
};
