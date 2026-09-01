import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

function checkAuth(req) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = Buffer.from(
      auth.replace("Basic ", ""),
      "base64"
    ).toString("utf-8");

    const [username, password] = decoded.split(":");

    return (
      username === process.env.ADMIN_USERNAME &&
      password === process.env.ADMIN_PASSWORD
    );
  } catch {
    return false;
  }
}

function generateAccessCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let randomPart = "";

  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return `LM-${new Date().getFullYear()}-${randomPart}`;
}

export default async function handler(req, res) {
  /*
   * ADMIN AUTHENTICATION
   */

  if (!checkAuth(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized.",
    });
  }

  try {
    /*
     * CREATE TABLE
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
     * GET
     * List all access codes
     */

    if (req.method === "GET") {
      const result = await pool.query(`
        SELECT
          id,
          access_code,
          test_name,
          organization_name,
          candidate_name,
          candidate_email,
          is_used,
          expires_at,
          created_at,
          used_at
        FROM assessment_access_codes
        ORDER BY created_at DESC;
      `);

      return res.status(200).json({
        success: true,
        accessCodes: result.rows,
      });
    }

    /*
     * POST
     * Create new access code
     */

    if (req.method === "POST") {
      const {
        testName,
        organizationName,
        candidateName,
        candidateEmail,
        expiresAt,
      } = req.body || {};

      const accessCode = generateAccessCode();

      const result = await pool.query(
        `
        INSERT INTO assessment_access_codes (
          access_code,
          test_name,
          organization_name,
          candidate_name,
          candidate_email,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          access_code,
          test_name,
          organization_name,
          candidate_name,
          candidate_email,
          is_used,
          expires_at,
          created_at;
        `,
        [
          accessCode,
          testName || "General English Assessment",
          organizationName || null,
          candidateName || null,
          candidateEmail || null,
          expiresAt || null,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Access code created successfully.",
        accessCode: result.rows[0],
      });
    }

    /*
     * OTHER METHODS
     */

    return res.status(405).json({
      success: false,
      message: "Method Not Allowed.",
    });

  } catch (error) {
    console.error("ACCESS CODES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not process access code request.",
      error: error.message,
    });
  }
}
