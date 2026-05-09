import fs from "fs/promises";
import path from "path";
import pool from "./pool.js";
import { clearDatabase } from "./purge.js";

// Force lookup inside the immediate folder layout context
export async function restoreDatabaseFromJson(inputFilePath = path.join(import.meta.dirname, "db_export.json")) {
  const client = await pool.connect();
  try {
    console.log(`Reading restore payload from absolute target: ${inputFilePath}`);
    const fileContent = await fs.readFile(inputFilePath, "utf-8");
    const usersList = JSON.parse(fileContent);

    await clearDatabase();

    console.log("Initiating data restoration transaction...");
    await client.query("BEGIN");

    for (const user of usersList) {
      await client.query(
        `INSERT INTO users (id, username, password_hash, creation_time) VALUES ($1, $2, $3, $4)`,
        [user.userId, user.username, "restored_hash_value", user.userCreationTime || new Date()]
      );

      if (Array.isArray(user.decks)) {
        for (const deck of user.decks) {
          await client.query(
            `INSERT INTO decks (id, user_id, title, category, creation_time) VALUES ($1, $2, $3, $4, $5)`,
            [deck.deckId, user.userId, deck.title, deck.category, deck.creationTime || new Date()]
          );

          if (Array.isArray(deck.cards)) {
            for (const card of deck.cards) {
              await client.query(
                `INSERT INTO cards (id, deck_id, question, answer, card_type, creation_time) VALUES ($1, $2, $3, $4, $5, $6)`,
                [card.cardId, deck.deckId, card.question, card.answer, card.cardType, card.creationTime || new Date()]
              );

              if (card.cardType === "multiple_choice" && Array.isArray(card.choices)) {
                for (const choice of card.choices) {
                  await client.query(
                    `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
                    [choice.choiceId, card.cardId, choice.choiceText, !!choice.isCorrect]
                  );
                }
              }
            }
          }
        }
      }
    }

    await client.query("COMMIT");
    console.log(`Database successfully restored!`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Restoration transaction aborted, modifications rolled back:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === import.meta.filename) {
  restoreDatabaseFromJson().then(() => pool.end()).catch(() => process.exit(1));
}
