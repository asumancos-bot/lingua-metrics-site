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

    const code = accessCode.trim();

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
     * IMPORTANT:
     * The access code is consumed atomically.
     *
     * Only ONE request can successfully change
     * is_used from FALSE to TRUE.
     */
    const result = await pool.query(
      `
      UPDATE assessment_access_codes
      SET
        is_used = TRUE,
        used_at = CURRENT_TIMESTAMP
      WHERE access_code = $1
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
        expires_at;
      `,
      [code]
    );

    /*
     * Successful update = code was available
     * and has now been consumed.
     */
    if (result.rows.length > 0) {
      const access = result.rows[0];

      return res.status(200).json({
        success: true,
        message: "Access granted.",
        access: {
          id: access.id,
          accessCode: access.access_code,
          testName: access.test_name,
          organizationName: access.organization_name,
          candidateName: access.candidate_name,
          candidateEmail: access.candidate_email,
        },
      });
    }

    /*
     * If UPDATE returned nothing, determine why.
     */
    const existing = await pool.query(
      `
      SELECT
        is_used,
        expires_at
      FROM assessment_access_codes
      WHERE access_code = $1
      LIMIT 1;
      `,
      [code]
    );

    if (existing.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid access code.",
      });
    }

    const access = existing.rows[0];

    if (access.is_used) {
      return res.status(403).json({
        success: false,
        message: "This access code has already been used.",
      });
    }

    if (
      access.expires_at &&
      new Date(access.expires_at) < new Date()
    ) {
      return res.status(403).json({
        success: false,
        message: "This access code has expired.",
      });
    }

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
