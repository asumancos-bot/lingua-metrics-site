import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default async function handler(req, res) {

  // ADMIN LOGIN
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Lingua-Metrics Admin"');
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const credentials = Buffer.from(
    auth.split(" ")[1],
    "base64"
  ).toString("utf8");

  const [username, password] = credentials.split(":");

  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Lingua-Metrics Admin"');
    return res.status(401).json({
      success: false,
      message: "Invalid credentials.",
    });
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
await pool.query(`
  ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS correct_answers JSONB;
`);
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
correct_answers,
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
