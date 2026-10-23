
const readline = require("node:readline");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const {
  readSheet,
  updateSheet,
  updateRowColor,
} = require("./readWriteSheet");
const { sendEmail } = require("./sendEmail");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const MODEL = "qwen3:8b";
const API_URL = "http://localhost:11434/api/chat";
const REQUEST_TIMEOUT = 300_000;
const SPREADSHEET_ID = "1KiRPdX1SY4JKhJRYvZuhj27OaFa9284If2Q04-5Q4K0";

const OUTPUT_DIR = path.resolve(
  "C:\\UserDrive\\LearnAWS\\shinbyte\\products"
);

const BASE_DIR = path.resolve(
  "C:\\UserDrive\\LearnAWS\\shinbyte"
);

const SOURCE_DIR = path.resolve(
  "C:\\Users\\ershy\\Downloads\\shinbyteImages"
);

const DESTINATION_DIR = path.resolve(
  "C:\\UserDrive\\LearnAWS\\shinbyte\\products\\src"
);



async function runGit(args) {
  const { stdout, stderr } = await execFileAsync(
    "git",
    args,
    {
      cwd: BASE_DIR,
      timeout: 120000,
      maxBuffer: 1024 * 1024
    }
  );

  return {
    command: `git ${args.join(" ")}`,
    output: [stdout, stderr].filter(Boolean).join("\n").trim()
  };
}




async function generateProductContent(userPrompt) {
  console.log("📖 Reading existing sample JSON...");

  const jsonPath = path.join(OUTPUT_DIR, "product-content.json");
  const existingJson = await fs.readFile(jsonPath, "utf8");

  // Validate the original JSON
  const sample = JSON.parse(existingJson);

  console.log("🤔 AI is updating content for the new product...");

  const fixedKeys = [
    "brand_name",
    "brand_link",
    "nav_toggle_label",
    "nav_home_text",
    "nav_home_link",
    "nav_products_text",
    "nav_products_link",
    "nav_contact_text",
    "nav_contact_link",
    "hero_image_src",
    "footer_brand_name",
    "footer_github_text",
    "footer_github_url",
    "footer_linkedin_text",
    "footer_linkedin_url",
    "footer_copyright",
    "footer_tagline"
  ];

  const systemPrompt = `
You are a SaaS landing page content updater for Shinbyte.

You will receive a new product idea and an existing sample JSON.

Your task is to update the existing JSON values for the new product.

STRICT RULES:
** product_name key should be updated to match the new product idea without spaces or special characters. Use lowercase letters only.
1. The existing JSON is your template. Do not create a new structure.
2. Preserve every original key exactly. Do not add, remove, or rename keys.
3. Update all product-specific content to match the new product idea.
4. Keep all values as strings.
5. Update the page title, meta content, product slug, hero content,
   all four feature cards, CTA content, and image alt text.
6. Make all four features distinct and relevant to the new product.
7. Keep content clear, concise, professional, and suitable for a SaaS landing page.
8. Do not invent unsupported product capabilities, integrations,
   certifications, customer counts, or guarantees.
9. Preserve the values of these fixed fields exactly as supplied:
${fixedKeys.map(key => `   - ${key}`).join("\n")}
10. Keep hero_image_src unchanged.
11. Generate product_slug using lowercase letters and hyphens only.
12. Return the COMPLETE JSON object.
13. Return valid JSON only. No Markdown, code fences, or explanations.
14. Do not return an example or partial JSON.

Before returning, verify that all original keys exist exactly once
and that all fixed values remain unchanged.
  `.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        think: false,
        format: "json",
        options: {
          num_predict: 4096,
          temperature: 0.1
        },
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `
NEW PRODUCT IDEA:
${userPrompt}

EXISTING SAMPLE JSON:
${JSON.stringify(sample, null, 2)}

Update the values in this exact JSON for the new product.
Preserve every key and all fixed values.
Return the complete updated JSON only.
            `.trim()
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP error: ${response.status}`);
    }

    const data = await response.json();

    let content = (data.message?.content || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    if (!content) {
      throw new Error("AI returned an empty response.");
    }

    // Parse returned JSON
    const updatedJson = JSON.parse(content);

    // Ensure the response is an object
    if (
      updatedJson === null ||
      Array.isArray(updatedJson) ||
      typeof updatedJson !== "object"
    ) {
      throw new Error("AI did not return a JSON object.");
    }

    // Validate that no keys were added or removed
    const originalKeys = Object.keys(sample).sort();
    const returnedKeys = Object.keys(updatedJson).sort();

    if (JSON.stringify(originalKeys) !== JSON.stringify(returnedKeys)) {
      const missing = originalKeys.filter(
        key => !Object.prototype.hasOwnProperty.call(updatedJson, key)
      );

      const extra = returnedKeys.filter(
        key => !Object.prototype.hasOwnProperty.call(sample, key)
      );

      throw new Error(
        `JSON keys mismatch. Missing: [${missing.join(", ")}]. ` +
        `Extra: [${extra.join(", ")}].`
      );
    }

    // Ensure every value is a string
    for (const key of originalKeys) {
      if (typeof updatedJson[key] !== "string") {
        throw new Error(`Invalid value type for key: ${key}`);
      }
    }

    // Ensure fixed values have not changed
    for (const key of fixedKeys) {
      if (updatedJson[key] !== sample[key]) {
        throw new Error(`AI modified fixed field: ${key}`);
      }
    }

    // Validate product slug
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(updatedJson.product_slug)) {
      throw new Error("AI returned an invalid product_slug.");
    }

    console.log("✅ Product content generated successfully.");

    return updatedJson;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Product content generation timed out after 5 minutes.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


async function moveFiles() {
  await fs.mkdir(DESTINATION_DIR, { recursive: true });

  const entries = await fs.readdir(SOURCE_DIR, {
    withFileTypes: true,
  });

  let moved = 0;
  const skipped = [];

  for (const entry of entries) {
    // Only move files, not subfolders.
    if (!entry.isFile()) continue;

     // Keep dashboard.png in the source folder.
    if (entry.name.toLowerCase() === "dashboard.png") continue;

    const source = path.join(SOURCE_DIR, entry.name);
    const destination = path.join(DESTINATION_DIR, entry.name);

    try {
      // Replace an existing destination file if necessary.
      await fs.copyFile(source, destination);
      await fs.unlink(source);

      moved++;
    } catch (error) {
      skipped.push({
        file: entry.name,
        error: error.message,
      });
    }
  }

  return { moved, skipped };
}


async function addCard(product) {
console.log(product);
  const filePath = path.join(BASE_DIR, "products.html");

  const html = await fs.readFile(filePath, "utf8");

  const marker = "<!-- Repeat More Cards -->";

  const newCard = `
<!-- Card : ${product.meta_title} -->
<div class="col-lg-6">
  <div class="glass-card">
    <div class="card-image">
      <img
        src="./products/src/${product.product_name}.png"
        alt="Product image"
        onerror="this.onerror=null; this.src='./products/src/extraticket.png';"
      />
      <div class="status-badge live">Early Access</div>
    </div>

    <div class="card-body-custom">
      <div class="d-flex align-items-center gap-3 mb-4">
        <div class="icon-box">
          <span class="material-symbols-outlined">
            assignment_turned_in
          </span>
        </div>

        <div>
          <h3>${product.meta_title}</h3>
          <p class="card-subtitle mb-0">
            ${product.meta_description}
          </p>
        </div>
      </div>

      <div class="d-flex flex-wrap gap-2 mb-4">
        <span class="tech-badge">React / PWA</span>
        <span class="tech-badge">Whisper AI</span>
        <span class="tech-badge">Node.js</span>
        <span class="tech-badge">TypeScript</span>
      </div>

      <button
        onclick="window.location.href='products/${product.product_name}.html'"
        class="details-btn"
      >
        View Details →
      </button>
    </div>
  </div>
</div>
`;

  if (!html.includes(marker)) {
    throw new Error("Products section marker not found.");
  }

  const updatedHtml = html.replace(
    marker,
    `${marker}\n${newCard}`
  );

//   fs.writeFileSync(filePath, updatedHtml, "utf8");
  await fs.writeFile(filePath, updatedHtml, "utf8");
  console.log("✅ Card added and products.html saved.");
  return; 
}


async function updateHTMLPlaceholders(contentJson) {
  const templatePath = path.join(OUTPUT_DIR, "sampleProduct.html");

  // Read original HTML template
  let html = await fs.readFile(templatePath, "utf8");

  const originalHtml = html;
  let replacedCount = 0;

 
for (const [key, value] of Object.entries(contentJson)) {
  if (value === null || value === undefined) {
    continue;
  }

    const placeholder = new RegExp(
    `\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}`,
    "g"
    );

    const matches = html.match(placeholder);

    // Placeholder nahi mila to ignore karo
    if (!matches) continue;

    const cleanValue = String(value)
    .replace(/^```(?:html|json|javascript|js)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

    html = html.replace(placeholder, () => cleanValue);

    replacedCount += matches.length;
    console.log(`✅ Updated ${key} (${matches.length} occurrence(s))`);
}


  // Find placeholders still present in the HTML
  const remainingPlaceholders = [
    ...html.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)
  ].map(match => match[0]);

  if (replacedCount === 0) {
    throw new Error(
      "No placeholders were replaced. Check HTML placeholder format and JSON keys."
    );
  }

  // Generate output filename
  const productName = contentJson.product_name || contentJson.page_title;

  if (!productName) {
    throw new Error("Missing product_name or page_title in contentJson.");
  }

  const safeFilename = productName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .trim();

  const filePath = path.join(OUTPUT_DIR, `${safeFilename}.html`);

  // Remove trailing Markdown code fences
  html = html.replace(/\s*```+\s*$/, "").trimEnd();
  await fs.writeFile(filePath, html, "utf8");

  console.log(`\n✅ Replaced ${replacedCount} placeholder occurrence(s).`);
  console.log(`📄 HTML saved: ${filePath}`);

  if (remainingPlaceholders.length > 0) {
    console.warn("⚠️ Unreplaced placeholders:", [
      ...new Set(remainingPlaceholders)
    ]);
  }

  return filePath;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET" && req.url === "/") {
    try {
      const ui = await fs.readFile(
        path.join(__dirname, "ui.html"),
        "utf8"
      );

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      res.end(ui);
    } catch (error) {
      res.writeHead(500);
      res.end("Could not load ui.html");
    }
    return;
  }

  // Add this route to your existing Express app
if (req.method === "POST" && req.url === "/run-git-deploy") {
  const results = [];

  try {
    // 1. Stage all changes
    results.push(await runGit(["add", "."]));

    // 2. Commit changes
    results.push(
      await runGit(["commit", "-m", "push changes"])
    );
      // 3. Push to configured remote
      results.push(await runGit(["push"]));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
      }));
  } catch (error) {
     console.error("Generation error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: error.message || "Something went wrong."
      }));
  }
  return;
}

  if (req.method === "POST" && req.url === "/generate") {
    try {
      let body = "";

      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request too large." }));
          return;
        }
      }

      const { prompt } = JSON.parse(body);

      // if (typeof prompt !== "string" || !prompt.trim()) {
      //   res.writeHead(400, { "Content-Type": "application/json" });
      //   res.end(JSON.stringify({ error: "Please enter a product idea." }));
      //   return;
      // }

      console.log("Generating product:", prompt);
       const data = await readSheet(
          SPREADSHEET_ID,
          "Sheet1"
        );

        // console.log("Sheet data:", data);
  
        // for (let index = 1; index < data.length; index++) {
        //   const row = data[index];
        //   const sheetRow = index + 1;
        //   if (row[3] === "No" && row[2] !== "") {
        //     console.log("Product:", row[2]);
        //     console.log("Updating cell:", `D${sheetRow}`);
        //     const productJson = await generateProductContent(row[2]);
        //     await updateHTMLPlaceholders(productJson);
        //     await addCard(productJson);
        //     await updateSheet(
        //       SPREADSHEET_ID,
        //       `Sheet1!B${sheetRow}`,
        //       [[productJson.product_name]]
        //     );
        //     await updateSheet(
        //       SPREADSHEET_ID,
        //       `Sheet1!D${sheetRow}`,
        //       [["Yes"]]
        //     );
        //     const productUrl = `https://shinbyte.cloud/products/${productJson.product_name}.html`;
        //     await updateSheet(
        //       SPREADSHEET_ID,
        //       `Sheet1!G${sheetRow}`,
        //       [[productUrl]]
        //     );
        //   }
        // }

        for (let index = 1; index < data.length; index++) {
            const row = data[index];
            const sheetRow = index + 1;
            const productPrompt = row[2];

            if (row[3] !== "No" || !productPrompt?.trim()) {
              continue;
            }

            console.log(`Generating product: ${productPrompt}`);

            try {
              const productJson = await generateProductContent(productPrompt);
              await updateHTMLPlaceholders(productJson);
              await addCard(productJson);

              const productUrl =
                `https://shinbyte.cloud/products/${productJson.product_name}.html`;

              // Update B, D and G in one Google Sheets API call.
              await updateSheet(SPREADSHEET_ID, [
                {
                  range: `Sheet1!B${sheetRow}`,
                  values: [[productJson.product_name]],
                },
                {
                  range: `Sheet1!D${sheetRow}`,
                  values: [["Yes"]],
                },
                {
                  range: `Sheet1!G${sheetRow}`,
                  values: [[productUrl]],
                },
              ]);

              // Entire A-G row red
              await updateRowColor(
                SPREADSHEET_ID,
                0, // Actual Sheet1 sheetId
                sheetRow
              );

              console.log(`Completed row ${sheetRow}: ${productUrl}`);
            } catch (error) {
              console.error(
                `Failed to process row ${sheetRow} (${productPrompt}):`,
                error.message
              );
            }
          } 



    //   console.log("HTML created:", filePath);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        // fileName: path.basename(filePath),
        // filePath
      }));
    } catch (error) {
      console.error("Generation error:", error);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: error.message || "Something went wrong."
      }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/move-files") {
  try {
    const result = await moveFiles();

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({
      success: true,
      message: `${result.moved} file(s) moved successfully.`,
      ...result,
    }));
  } catch (error) {
    res.writeHead(500, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({
      success: false,
      error: error.message,
    }));
  }

  return;
}

 if (req.method === "POST" && req.url === "/send-email") {
  try {
    let body = "";

      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request too large." }));
          return;
        }
      }

    
     const { ideaName, emailSubject, emailmsg } = JSON.parse(body);
     console.log("Sending email with subject:", emailSubject);
     console.log("Email message:", emailmsg);
     // Email send hone ke baad:
  
    const SPREADSHEET_ID_SECOND = "1yewVDcfhs4zW40DbDGH2wSbkKMlmybsjK2v1hYSU_OA";
    const data = await readSheet(
      SPREADSHEET_ID_SECOND,
      "A:H"
    );

const filteredData = data
  .map((row, index) => ({
    row,
    sheetRow: index + 1,
  }))
  .filter(({ row }) => {
    const status = String(row[4] ?? "").trim();
    const id = String(row[7] ?? "").trim().toLowerCase();
    const targetId = String(ideaName ?? "").trim().toLowerCase();

    return status === "" && id === targetId;
  });

console.log("Filtered data:", filteredData);
if (filteredData.length === 0) {
  console.log("No matching rows found for the given ideaName.");
  res.writeHead(404, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify({  
    success: false,
    error: "No matching rows found for the given ideaName."
  }));
   return;
}

for (const { row, sheetRow } of filteredData) {
  const email = row[0];

  if (!email || !email.includes("@")) {
    continue;
  }

  try {
    console.log("Sending email to:", email);

    await sendEmail(email, emailSubject, emailmsg);

    const sentDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    await updateSheet(SPREADSHEET_ID_SECOND, [
      {
        range: `E${sheetRow}`,
        values: [["Sent"]],
      },
      {
        range: `F${sheetRow}`,
        values: [[sentDate]],
      },
      {
        range: `H${sheetRow}`,
        values: [[ideaName]],
      },
    ]);

    console.log(`Email sent and sheet updated: ${email}`);
  } catch (error) {
    console.error(`Failed for ${email}:`, error.message);
  }
}

    res.end(JSON.stringify({
      success: true,
      message: `Email(s) sent successfully.`
    }));
  } catch (error) {
    res.writeHead(500, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({
      success: false,
      error: error.message,
    }));
  }

  return;
}

  res.writeHead(404);
  res.end("Not found");
});

server.listen(3000, "127.0.0.1", () => {
  console.log("🚀 Shinbyte AI UI: http://localhost:3000");
});

