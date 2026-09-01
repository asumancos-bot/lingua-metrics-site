import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default async function handler(req, res) {
  // Sadece POST isteğine izin ver
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const {
      candidateName,
      email,
      phone,
      candidateType,
      organizationName,
      testName,
      level,
      score,
      totalQuestions,
     answers,
      correctAnswers,
      duration,
      completedAt,
    } = req.body;

    if (!candidateName) {
      return res.status(400).json({
        success: false,
        message: "Candidate name is required.",
      });
    }

    // Answers verisini güvenli şekilde JSON'a çevir
    let answersJson = null;
 let correctAnswersJson = null;

    if (correctAnswers !== undefined && correctAnswers !== null) {
      if (typeof correctAnswers === "string") {
        try {
          JSON.parse(correctAnswers);
          correctAnswersJson = correctAnswers;
        } catch (e) {
          correctAnswersJson = JSON.stringify([]);
        }
      } else {
        correctAnswersJson = JSON.stringify(correctAnswers);
      }
    }
    if (answers !== undefined && answers !== null) {
      if (typeof answers === "string") {
        try {
          JSON.parse(answers);
          answersJson = answers;
        } catch (e) {
          answersJson = JSON.stringify({});
        }
      } else {
        answersJson = JSON.stringify(answers);
      }
    }

    // Duration değerini INTEGER olarak hazırla
    let durationValue = null;

    if (duration !== undefined && duration !== null) {
      if (typeof duration === "number") {
        durationValue = duration;
      } else {
        const parsedDuration = parseInt(duration, 10);

        if (!isNaN(parsedDuration)) {
          durationValue = parsedDuration;
        }
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessment_results (
        id SERIAL PRIMARY KEY,
        candidate_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        candidate_type TEXT DEFAULT 'individual',
        organization_name TEXT,
        test_name TEXT,
        level TEXT,
        score NUMERIC,
        total_questions INTEGER,
       answers JSONB,
        correct_answers JSONB,
        duration INTEGER,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
await pool.query(`
  ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS correct_answers JSONB;
`);
    const result = await pool.query(
      `
      INSERT INTO assessment_results (
        candidate_name,
        email,
        phone,
        candidate_type,
        organization_name,
        test_name,
        level,
        score,
        total_questions,
       answers,
        correct_answers,
        duration,
        completed_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
      $10::jsonb,
        $11::jsonb,
        $12,
        $13
      )
      RETURNING
        id,
        candidate_name,
        candidate_type,
        organization_name,
        score,
        level,
        completed_at;
      `,
      [
        candidateName,
        email || null,
        phone || null,
        candidateType || "individual",
        organizationName || null,
        testName || "General English Assessment",
        level || null,
        score ?? null,
        totalQuestions ?? null,
         answersJson,
        correctAnswersJson,
        durationValue,
        completedAt || null,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Assessment result saved successfully.",
      result: result.rows[0],
    });

  } catch (error) {
    console.error("SAVE RESULT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not save assessment result.",
      error: error.message,
    });
  }
}
