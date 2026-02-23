// create_users.js (ADC version)
// Generated: 2026-02-20 15:50:37 CET
//
// Bulk create Firebase Auth users from CSV (email,password) using
// Google Cloud CLI Application Default Credentials (NO serviceAccountKey.json).
//
// Prerequisites (one-time):
//   1) Install Google Cloud CLI
//   2) Run:
//        gcloud auth login
//        gcloud config set project iclean-room
//        gcloud auth application-default login
//
// Setup (in this folder):
//   npm init -y
//   npm i firebase-admin
//
// Run:
//   node create_users.js users_bestclean_only.csv
//   (or pass any CSV file path as the 1st argument)
//
// Notes:
// - If a user already exists (email), it will be skipped.
// - Everyone can have the same password from CSV (e.g., Best1234+). Consider changing later.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
  const emailIdx = header.indexOf("email");
  const passIdx = header.indexOf("password");

  if (emailIdx === -1 || passIdx === -1) {
    throw new Error("CSV must have headers: email,password");
  }

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parsing (OK for email/password without commas)
    const cols = lines[i].split(",");
    const email = (cols[emailIdx] || "").trim();
    const password = (cols[passIdx] || "").trim();
    if (!email || !password) continue;
    out.push({ email, password });
  }
  return out;
}

async function main() {
  const csvFile = process.argv[2] || "users_bestclean_only.csv";
  const csvPath = path.resolve(process.cwd(), csvFile);

  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found:", csvPath);
    console.error("Tip: run: node create_users.js users_bestclean_only.csv");
    process.exit(1);
  }

  // Use ADC from gcloud (application-default credentials)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });

  const users = readCsv(csvPath);
  console.log("Users in CSV:", users.length);

  let created = 0, skipped = 0, failed = 0;

  for (const u of users) {
    try {
      await admin.auth().createUser({
        email: u.email,
        password: u.password,
      });
      created++;
      console.log("CREATED:", u.email);
    } catch (err) {
      if (err && err.code === "auth/email-already-exists") {
        skipped++;
        console.log("SKIP (exists):", u.email);
      } else {
        failed++;
        console.error("FAILED:", u.email, err?.code || err?.message || err);
      }
    }
  }

  console.log("Done.");
  console.log({ created, skipped, failed });
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
