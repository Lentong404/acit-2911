import fs from "fs/promises";
import path from "path";
import pool from "./pool.js";

// Dynamically target the exact folder where export.js sits
export async function exportDatabaseToJson(outputFilePath = path.join(import.meta.dirname, "db_export.json")) {
  try {
    console.log("Initiating complete database structural export...");

    const query = `
      SELECT 
        u.id AS "userId", u.username, u.creation_time AS "userCreationTime",
        COALESCE(
          json_agg(
            json_build_object(
              'deckId', d.id, 'title', d.title, 'category', d.category, 'creationTime', d.creation_time,
              'cards', COALESCE(c.cards_list, '[]'::json)
            )
          ) FILTER (WHERE d.id IS NOT NULL), '[]'::json
        ) AS decks
      FROM users u
      LEFT JOIN decks d ON d.user_id = u.id
      LEFT JOIN (
        SELECT 
          card_sub.deck_id,
          json_agg(
            json_build_object(
              'cardId', card_sub.id, 'question', card_sub.question, 'answer', card_sub.answer,
              'cardType', card_sub.card_type, 'creationTime', card_sub.creation_time,
              'choices', COALESCE(choice_sub.choices_list, '[]'::json)
            )
          ) AS cards_list
        FROM cards card_sub
        LEFT JOIN (
          SELECT 
            card_id,
            json_agg(json_build_object('choiceId', id, 'choiceText', choice_text, 'isCorrect', is_correct)) AS choices_list
          FROM card_choices GROUP BY card_id
        ) choice_sub ON choice_sub.card_id = card_sub.id
        GROUP BY card_sub.deck_id
      ) c ON c.deck_id = d.id GROUP BY u.id, u.username, u.creation_time;
    `;

    const result = await pool.query(query);
    await fs.writeFile(outputFilePath, JSON.stringify(result.rows, null, 2), "utf-8");
    
    console.log(`Export completed successfully! File saved to: ${outputFilePath}`);
    return result.rows;
  } catch (error) {
    console.error("Database structural export failed:", error);
    throw error;
  }
}

if (process.argv[1] === import.meta.filename) {
  exportDatabaseToJson().then(() => pool.end()).catch(() => process.exit(1));
}
