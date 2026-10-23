
const { google } = require("googleapis");
const { authenticate } = require("@google-cloud/local-auth");
const fs = require("node:fs/promises");
const path = require("node:path");

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
];

// Authenticate and reuse saved token
async function getAuthClient() {
  const credentials = JSON.parse(
    await fs.readFile(CREDENTIALS_PATH, "utf8")
  );

  const config = credentials.installed;

  if (!config) {
    throw new Error(
      'credentials.json must contain "installed".'
    );
  }

  const auth = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    config.redirect_uris?.[0]
  );

  try {
    const savedToken = JSON.parse(
      await fs.readFile(TOKEN_PATH, "utf8")
    );

    auth.setCredentials(savedToken);

    await auth.getAccessToken();

    await fs.writeFile(
      TOKEN_PATH,
      JSON.stringify(auth.credentials, null, 2)
    );

    return auth;
  } catch (error) {
    // Start OAuth login if the saved token is missing
    // or cannot be refreshed.
  }

  const freshAuth = await authenticate({
    keyfilePath: CREDENTIALS_PATH,
    scopes: SCOPES,
  });

  await fs.writeFile(
    TOKEN_PATH,
    JSON.stringify(freshAuth.credentials, null, 2)
  );

  return freshAuth;
}

// Create authenticated Google Sheets client
async function getSheetsClient() {
  const auth = await getAuthClient();

  return google.sheets({
    version: "v4",
    auth,
  });
}

// Read data from a range
async function readSheet(spreadsheetId, range) {
  const auth = await getAuthClient();

  const response = await auth.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  });

  return response.data.values || [];
}

// Update data in a range
async function updateSheet(spreadsheetId, updates) {
  const auth = await getAuthClient();

  const response = await auth.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    method: "POST",
    data: {
      valueInputOption: "USER_ENTERED",
      data: updates.map(({ range, values }) => ({
        range,
        values,
      })),
    },
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
}


async function updateRowColor(
  spreadsheetId,
  sheetId,
  sheetRow,
  startColumnIndex = 0,
  endColumnIndex = 7,
  color = { red: 1, green: 0, blue: 0 }
) {
  const sheets = await getSheetsClient();
  return sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: sheetRow - 1,
              endRowIndex: sheetRow,
              startColumnIndex,
              endColumnIndex,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: color,
              },
            },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ],
    },
  });
}

module.exports = {
  getAuthClient,
  getSheetsClient,
  readSheet,
  updateSheet,
  updateRowColor,
};
