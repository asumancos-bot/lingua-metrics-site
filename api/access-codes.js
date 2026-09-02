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

    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return false;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatExpiryDate(expiresAt) {
  if (!expiresAt) {
    return "No expiry date";
  }

  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    return String(expiresAt);
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

async function sendAssessmentEmail({
  candidateEmail,
  candidateName,
  testName,
  organizationName,
  accessCode,
  expiresAt,
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const assessmentUrl =
    "https://www.lingua-metrics.com/general-english-test.html";

  const safeCandidateName = escapeHtml(
    candidateName || "Candidate"
  );
  const safeTestName = escapeHtml(
    testName || "General English Assessment"
  );
  const safeOrganizationName = escapeHtml(
    organizationName || ""
  );
  const safeAccessCode = escapeHtml(accessCode);
  const safeExpiryDate = escapeHtml(
    formatExpiryDate(expiresAt)
  );

  const organizationRow = safeOrganizationName
    ? `
      <tr>
        <td style="padding:8px 0;color:#64748b;">Organization</td>
        <td style="padding:8px 0;text-align:right;color:#0f172a;">
          ${safeOrganizationName}
        </td>
      </tr>
    `
    : "";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        "Lingua-Metrics Assessment Team <info@lingua-metrics.com>",
      to: [candidateEmail.trim()],
      reply_to: "asumankarnak@lingua-metrics.com",
      subject: `${testName || "General English Assessment"} – Access Code`,
      html: `
        <!doctype html>
        <html lang="en">
          <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
            <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
              <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
                <div style="background:#0f172a;padding:28px 32px;">
                  <h1 style="margin:0;color:#ffffff;font-size:24px;">
                    Lingua-Metrics
                  </h1>
                  <p style="margin:8px 0 0;color:#67e8f9;font-size:14px;">
                    Measure. Develop. Perform.
                  </p>
                </div>

                <div style="padding:32px;">
                  <p style="font-size:17px;margin-top:0;">
                    Dear ${safeCandidateName},
                  </p>

                  <p style="line-height:1.7;color:#334155;">
                    You have been invited to complete the
                    <strong>${safeTestName}</strong>.
                    Use the access code below to begin your assessment.
                  </p>

                  <div style="margin:28px 0;padding:24px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;text-align:center;">
                    <div style="font-size:13px;color:#0e7490;text-transform:uppercase;letter-spacing:1px;">
                      Access Code
                    </div>
                    <div style="margin-top:10px;font-size:28px;font-weight:700;letter-spacing:2px;color:#0f172a;">
                      ${safeAccessCode}
                    </div>
                  </div>

                  <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <tr>
                      <td style="padding:8px 0;color:#64748b;">Assessment</td>
                      <td style="padding:8px 0;text-align:right;color:#0f172a;">
                        ${safeTestName}
                      </td>
                    </tr>
                    ${organizationRow}
                    <tr>
                      <td style="padding:8px 0;color:#64748b;">Valid until</td>
                      <td style="padding:8px 0;text-align:right;color:#0f172a;">
                        ${safeExpiryDate}
                      </td>
                    </tr>
                  </table>

                  <div style="text-align:center;margin-top:30px;">
                    <a
                      href="${assessmentUrl}"
                      style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:700;"
                    >
                      Start Assessment
                    </a>
                  </div>

                  <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                    This access code is personal and can only be used once.
                    Please do not share it with anyone.
                  </p>
                </div>
              </div>

              <p style="text-align:center;color:#94a3b8;font-size:12px;margin:18px 0 0;">
                © ${new Date().getFullYear()} Lingua-Metrics
              </p>
            </div>
          </body>
        </html>
      `,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || "Resend could not send the email."
    );
  }

  return data;
}

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized.",
    });
  }

  try {
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

    if (req.method === "POST") {
      const {
        testName,
        organizationName,
        candidateName,
        candidateEmail,
        expiresAt,
      } = req.body || {};

      const normalizedEmail =
        typeof candidateEmail === "string"
          ? candidateEmail.trim().toLowerCase()
          : "";

      if (
        normalizedEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      ) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid candidate email address.",
        });
      }

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
          normalizedEmail || null,
          expiresAt || null,
        ]
      );

      const createdAccessCode = result.rows[0];
      let emailSent = false;
      let emailError = null;

      if (normalizedEmail) {
        try {
          await sendAssessmentEmail({
            candidateEmail: normalizedEmail,
            candidateName,
            testName,
            organizationName,
            accessCode,
            expiresAt,
          });

          emailSent = true;
        } catch (error) {
          console.error("ASSESSMENT EMAIL ERROR:", error);
          emailError = error.message;
        }
      }

      return res.status(201).json({
        success: true,
        message: normalizedEmail
          ? emailSent
            ? "Access code created and emailed successfully."
            : "Access code created, but the email could not be sent."
          : "Access code created successfully.",
        accessCode: createdAccessCode,
        emailSent,
        emailError,
      });
    }

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
