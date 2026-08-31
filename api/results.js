import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {

    const result = await pool.query(`
      SELECT
        id,
        candidate_name,
        email,
        phone,
        candidate_type,
        organization_name,
        test_name,
        score,
        level,
        total_questions,
        answers,
        duration,
        completed_at
      FROM assessment_results
      ORDER BY completed_at DESC
      LIMIT 100
    `);

    return res.status(200).json({
      success: true,
      results: result.rows,
    });

  } catch (error) {

    console.error("GET RESULTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve assessment results.",
      error: error.message,
    });
  }
}
