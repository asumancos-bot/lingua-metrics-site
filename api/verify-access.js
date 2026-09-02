import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const { accessCode } = req.body;

    if (!accessCode) {
      return res.status(400).json({
        success: false,
        message: "Access code is required.",
      });
    }

    const normalizedCode = accessCode.trim();

    /*
     * Make sure the table exists.
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessment_access_codes (
        id SERIAL PRIMARY KEY,
        access_code TEXT UNIQUE NOT NULL,
        test_name TEXT DEFAULT 'General English Assessment',
        organization_name TEXT,
        candidate_name TEXT,
        candidate_email TEXT,
        is_used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP
      );
    `);

    /*
     * Atomically claim the access code.
     *
     * IMPORTANT:
     * The code becomes USED at the moment access is successfully granted.
     *
     * Because this is a single UPDATE statement with
     * "is_used = FALSE", two users cannot successfully claim
     * the same code at the same time.
     */
    const claimResult = await pool.query(
      `
      UPDATE assessment_access_codes
      SET
        is_used = TRUE,
        used_at = CURRENT_TIMESTAMP
      WHERE
        access_code = $1
        AND is_used = FALSE
        AND (
          expires_at IS NULL
          OR expires_at >= CURRENT_TIMESTAMP
        )
      RETURNING
        id,
        access_code,
        test_name,
        organization_name,
        candidate_name,
        candidate_email,
        is_used,
        expires_at,
        used_at;
      `,
      [normalizedCode]
    );

    /*
     * SUCCESS
     *
     * The code has just been claimed successfully.
     */
    if (claimResult.rows.length > 0) {
      const access = claimResult.rows[0];

      return res.status(200).json({
        success: true,
        message: "Access granted.",
        access: {
          id: access.id,
          testName: access.test_name,
          organizationName: access.organization_name,
          candidateName: access.candidate_name,
          candidateEmail: access.candidate_email,
        },
      });
    }

    /*
     * If the atomic UPDATE did not claim the code,
     * determine why.
     */
    const existingResult = await pool.query(
      `
      SELECT
        id,
        is_used,
        expires_at
      FROM assessment_access_codes
      WHERE access_code = $1
      LIMIT 1;
      `,
      [normalizedCode]
    );

    /*
     * Code does not exist.
     */
    if (existingResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid access code.",
      });
    }

    const existing = existingResult.rows[0];

    /*
     * Code was already used.
     */
    if (existing.is_used) {
      return res.status(403).json({
        success: false,
        message: "This access code has already been used.",
      });
    }

    /*
     * Code exists but has expired.
     */
    if (
      existing.expires_at &&
      new Date(existing.expires_at) < new Date()
    ) {
      return res.status(403).json({
        success: false,
        message: "This access code has expired.",
      });
    }

    /*
     * Fallback protection.
     */
    return res.status(403).json({
      success: false,
      message: "This access code cannot be used.",
    });

  } catch (error) {
    console.error("VERIFY ACCESS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not verify access code.",
      error: error.message,
    });
  }
}
