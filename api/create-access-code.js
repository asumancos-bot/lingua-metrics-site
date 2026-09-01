import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

function generateAccessCode() {
  const random = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  return `LM-${new Date().getFullYear()}-${random}`;
}

export default async function handler(req, res) {

  // Sadece POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  // ADMIN LOGIN
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Basic ")) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Lingua-Metrics Admin"'
    );

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
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Lingua-Metrics Admin"'
    );

    return res.status(401).json({
      success: false,
      message: "Invalid credentials.",
    });
  }

  try {

    const {
      testName,
      organizationName,
      candidateName,
      candidateEmail,
      expiresAt,
    } = req.body;

    // Tablo yoksa oluştur
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

    // Yeni benzersiz kod oluştur
    let accessCode;
    let exists = true;

    while (exists) {

      accessCode = generateAccessCode();

      const check = await pool.query(
        `
        SELECT id
        FROM assessment_access_codes
        WHERE access_code = $1
        LIMIT 1;
        `,
        [accessCode]
      );

      exists = check.rows.length > 0;
    }

    // Veritabanına kaydet
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
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

    return res.status(200).json({
      success: true,
      message: "Access code created successfully.",
      access: result.rows[0],
    });

  } catch (error) {

    console.error("CREATE ACCESS CODE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create access code.",
      error: error.message,
    });
  }
}
