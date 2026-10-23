
const fs = require("fs");
const { google } = require("googleapis");

const credentials = JSON.parse(
  fs.readFileSync("credentials.json", "utf8")
);

const token = JSON.parse(
  
  fs.readFileSync("token.json", "utf8")
);

// Supports standard OAuth credential JSON files.
const config =
  credentials.installed || credentials.web;

if (!config) {
  throw new Error(
    "OAuth client credentials not found in credentials.json"
  );
}

const auth = new google.auth.OAuth2(
  config.client_id,
  config.client_secret,
  config.redirect_uris?.[0]
);

auth.setCredentials(token);

const gmail = google.gmail({
  version: "v1",
  auth,
});

async function sendEmail(to, subject, body) {
  const senderEmail = "admin@shinbyte.cloud";

  const message = [
    `From: ${senderEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");

  const raw = Buffer.from(message)
    .toString("base64url");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  console.log("Email sent:", result.data.id);
  return result.data;
}

module.exports = { sendEmail };
