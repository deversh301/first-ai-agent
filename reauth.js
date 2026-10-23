
const { authenticate } = require("@google-cloud/local-auth");
const fs = require("node:fs/promises");
const path = require("node:path");

const CREDENTIALS_PATH = path.join(
  __dirname,
  "credentials.json"
);
const TOKEN_PATH = path.join(__dirname, "token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
];

async function main() {
  const auth = await authenticate({
    keyfilePath: CREDENTIALS_PATH,
    scopes: SCOPES,
  });

  await fs.writeFile(
    TOKEN_PATH,
    JSON.stringify(auth.credentials, null, 2)
  );

  console.log("New OAuth token saved successfully.");
}

main().catch(console.error);
