const { sendEmail } = require("./sendEmail");

async function main() {
  await sendEmail(
    "ershyadav303@gmail.com",
    "Gmail API Test",
    "Bhai, Gmail API setup test successful!"
  );
}

main().catch(console.error);