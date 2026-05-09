import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import DOMPurify from "isomorphic-dompurify";
import pool from "./pool.js";

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function importCardsFromCsv(targetUserId, relativeCsvPath) {
  if (!relativeCsvPath) {
    throw new Error("Missing parameter: An explicit external CSV file path is required.");
  }

  const absolutePath = path.resolve(relativeCsvPath);
  await fs.access(absolutePath);
  console.log(`Reading CSV target source payload from: ${absolutePath}`);

  const client = await pool.connect();
  try {
    const fileContent = await fs.readFile(absolutePath, "utf-8");
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length <= 1) {
      console.log("CSV file is empty or missing data payload rows.");
      return;
    }

    const headers = parseCsvLine(lines[0]);
    const idxDeckTitle = headers.indexOf("deck_title");
    const idxDeckCategory = headers.indexOf("deck_category");
    const idxCardType = headers.indexOf("card_type");
    const idxQuestion = headers.indexOf("question");
    const idxAnswer = headers.indexOf("answer");
    const idxChoices = headers.indexOf("choices");

    if ([idxDeckTitle, idxCardType, idxQuestion, idxAnswer].some(idx => idx === -1)) {
      throw new Error("Missing required structural headers in source CSV file.");
    }

    // Start database transaction early to safely encapsulate fallback generation
    await client.query("BEGIN");

    let resolvedUserId = targetUserId;

    if (!resolvedUserId) {
      console.log("No user target provided. Fetching fallback user from database...");
      const userFallback = await client.query("SELECT id, username FROM users ORDER BY creation_time ASC LIMIT 1");
      
      if (userFallback.rows.length === 0) {
        console.log("⚠️ No users found in database. Provisioning default 'csv_instructor' profile...");
        resolvedUserId = "user-" + crypto.randomUUID();
        await client.query(
          "INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)",
          [resolvedUserId, "csv_instructor", "mock_hash_value"]
        );
      } else {
        resolvedUserId = userFallback.rows[0].id;
        console.log(`Fallback mapping established to user: "${userFallback.rows[0].username}" (${resolvedUserId})`);
      }
    } else {
      const userCheck = await client.query("SELECT id FROM users WHERE id = $1", [resolvedUserId]);
      if (userCheck.rows.length === 0) {
        throw new Error(`Target user ID mapping not found: ${resolvedUserId}`);
      }
    }

    console.log("Processing atomic CSV row structural ingestion pipeline...");
    const sanitizeOpts = { FORBID_TAGS: ["style", "script", "iframe"] };
    const deckCache = new Map();

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length < headers.length) continue;

      const rawDeckTitle = row[idxDeckTitle];
      const rawCategory = idxDeckCategory !== -1 ? row[idxDeckCategory] : "General";
      const rawCardType = row[idxCardType] || "basic";
      const rawQuestion = row[idxQuestion];
      const rawAnswer = row[idxAnswer];
      const rawChoices = idxChoices !== -1 ? row[idxChoices] : "";

      if (!rawDeckTitle || !rawQuestion || !rawAnswer) continue;

      const cleanDeckTitle = DOMPurify.sanitize(rawDeckTitle, sanitizeOpts);
      const cleanCategory = DOMPurify.sanitize(rawCategory, sanitizeOpts);
      const cleanQuestion = DOMPurify.sanitize(rawQuestion, sanitizeOpts);
      const cleanAnswer = DOMPurify.sanitize(rawAnswer, sanitizeOpts);
      const cleanCardType = ['basic', 'multiple_choice', 'true_false'].includes(rawCardType) ? rawCardType : 'basic';

      let deckId = deckCache.get(cleanDeckTitle);
      if (!deckId) {
        const existingDeck = await client.query(
          "SELECT id FROM decks WHERE user_id = $1 AND title = $2",
          [resolvedUserId, cleanDeckTitle]
        );

        if (existingDeck.rows.length > 0) {
          deckId = existingDeck.rows[0].id;
        } else {
          deckId = "deck-" + crypto.randomUUID();
          await client.query(
            "INSERT INTO decks (id, user_id, title, category) VALUES ($1, $2, $3, $4)",
            [deckId, resolvedUserId, cleanDeckTitle, cleanCategory]
          );
        }
        deckCache.set(cleanDeckTitle, deckId);
      }

      const cardId = "card-" + crypto.randomUUID();
      await client.query(
        "INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, $5)",
        [cardId, deckId, cleanQuestion, cleanAnswer, cleanCardType]
      );

      if (cleanCardType === "multiple_choice" && rawChoices) {
        const choiceArray = rawChoices.split("|").map(c => c.trim()).filter(Boolean);
        
        for (const choiceText of choiceArray) {
          const cleanChoiceText = DOMPurify.sanitize(choiceText, sanitizeOpts);
          const isCorrect = cleanChoiceText.toLowerCase() === cleanAnswer.toLowerCase();
          
          await client.query(
            "INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)",
            ["choice-" + crypto.randomUUID(), cardId, cleanChoiceText, isCorrect]
          );
        }
      }
    }

    await client.query("COMMIT");
    console.log("✅ CSV card tracking database ingestion completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ CSV engine transaction aborted, rolling back structural updates:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  let userIdArg = null;
  let csvPathArg = null;

  if (args.length === 1) {
    csvPathArg = args[0]; // Fix: Extract raw string from index 0
  } else if (args.length >= 2) {
    userIdArg = args[0];  // Fix: Extract raw string user ID
    csvPathArg = args[1]; // Fix: Extract raw string path
  }

  if (!csvPathArg) {
    console.error("❌ Error: You must supply a pathway to an external CSV file.");
    console.error("👉 Usage: node db/importcsv.js [userId] <path/to/file.csv>");
    process.exit(1);
  }

  importCardsFromCsv(userIdArg, csvPathArg)
    .then(() => pool.end())
    .catch((err) => {
      console.error("Fatal processing failure:", err.message);
      process.exit(1);
    });
}