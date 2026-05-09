import fs from "fs/promises";
import crypto from "crypto";
import DOMPurify from "isomorphic-dompurify";
import pool from "./pool.js";

export async function importDatabaseFromJson(inputFilePath = `${import.meta.dirname}/db_export.json`) {
  const client = await pool.connect();
  
  try {
    console.log(`Reading JSON import payload from: ${inputFilePath}`);
    const fileContent = await fs.readFile(inputFilePath, "utf-8");
    const usersList = JSON.parse(fileContent);

    await client.query("BEGIN");
    console.log("Processing append-only database JSON ingestion...");

    const sanitizeOpts = { FORBID_TAGS: ["style", "script", "iframe"] };

    for (const user of usersList) {
      const cleanUsername = DOMPurify.sanitize(user.username.trim(), sanitizeOpts);
      let targetUserId = user.userId;

      // 1. Resolve User Mapping
      const userCheck = await client.query("SELECT id FROM users WHERE id = $1 OR username = $2", [targetUserId, cleanUsername]);
      
      if (userCheck.rows.length > 0) {
        targetUserId = userCheck.rows[0].id;
      } else {
        await client.query(
          `INSERT INTO users (id, username, password_hash, creation_time) VALUES ($1, $2, $3, $4)`,
          [targetUserId, cleanUsername, "imported_hash_value", user.userCreationTime || new Date()]
        );
      }

      // 2. Process Decks
      if (Array.isArray(user.decks)) {
        for (const deck of user.decks) {
          const cleanTitle = DOMPurify.sanitize(deck.title.trim(), sanitizeOpts);
          const cleanCategory = DOMPurify.sanitize(deck.category?.trim() || "General", sanitizeOpts);
          let targetDeckId = deck.deckId;

          const deckCheck = await client.query(
            "SELECT id FROM decks WHERE id = $1 OR (user_id = $2 AND title = $3)",
            [targetDeckId, targetUserId, cleanTitle]
          );

          if (deckCheck.rows.length > 0) {
            targetDeckId = deckCheck.rows[0].id;
          } else {
            await client.query(
              `INSERT INTO decks (id, user_id, title, category, creation_time) VALUES ($1, $2, $3, $4, $5)`,
              [targetDeckId, targetUserId, cleanTitle, cleanCategory, deck.creationTime || new Date()]
            );
          }

          // 3. Process Cards
          if (Array.isArray(deck.cards)) {
            for (const card of deck.cards) {
              const cleanQuestion = DOMPurify.sanitize(card.question.trim(), sanitizeOpts);
              const cleanAnswer = DOMPurify.sanitize(card.answer.trim(), sanitizeOpts);
              const cleanCardType = ['basic', 'multiple_choice', 'true_false'].includes(card.cardType) ? card.cardType : 'basic';
              let targetCardId = card.cardId;

              const cardCheck = await client.query(
                "SELECT id FROM cards WHERE id = $1 OR (deck_id = $2 AND question = $3)",
                [targetCardId, targetDeckId, cleanQuestion]
              );

              if (cardCheck.rows.length > 0) {
                continue; // Skip existing matching flashcards to block exact payload duplication
              }

              await client.query(
                `INSERT INTO cards (id, deck_id, question, answer, card_type, creation_time) VALUES ($1, $2, $3, $4, $5, $6)`,
                [targetCardId, targetDeckId, cleanQuestion, cleanAnswer, cleanCardType, card.creationTime || new Date()]
              );

              // 4. Process Multiple Choice Child Options
              if (cleanCardType === "multiple_choice" && Array.isArray(card.choices)) {
                for (const choice of card.choices) {
                  const cleanChoiceText = DOMPurify.sanitize(choice.choiceText.trim(), sanitizeOpts);
                  const choiceId = choice.choiceId || "choice-" + crypto.randomUUID();

                  await client.query(
                    `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
                    [choiceId, targetCardId, cleanChoiceText, !!choice.isCorrect]
                  );
                }
              }
            }
          }
        }
      }
    }

    await client.query("COMMIT");
    console.log("Database successfully populated with JSON content without losing existing historical records!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("JSON import transaction rolled back due to error:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === import.meta.filename) {
  // If an argument is provided, use it; otherwise, fall back to the default file
  const customPath = process.argv[2];
  
  importDatabaseFromJson(customPath)
    .then(() => pool.end())
    .catch(() => process.exit(1));
}
