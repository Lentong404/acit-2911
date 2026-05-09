import express from "express";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";
import DOMPurify from "isomorphic-dompurify";
import pool from "./db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Deck Routes
app.get("/api/decks", async (req, res) => {
  try {
    const deckList = await pool.query(`
    SELECT decks.id, decks.title, decks.category, COUNT(cards.id)::int AS "cardCount"
    FROM decks
    LEFT JOIN cards ON cards.deck_id = decks.id
    GROUP BY decks.id
    ORDER BY decks.creation_time DESC`);

    res.json(deckList.rows);
  } catch (err) {
    console.error("error getting decks", err);
    res.status(500).json({ error: "database error" });
  }
});

app.post("/api/decks", async (req, res) => {
  try {
    const { title, category } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const cleanTitle = DOMPurify.sanitize(title.trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });

    const cleanCategory = DOMPurify.sanitize((category || "").trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });

    if (!cleanTitle) {
      return res.status(400).json({ error: "Invalid title content" });
    }

    const id = "deck-" + uuidv4();

    const createdDeck = await pool.query(
      `INSERT INTO decks (id, title, category)
    VALUES ($1, $2, $3)
    RETURNING id, title, category`,
      [id, cleanTitle, cleanCategory],
    );

    res.status(201).json({
      ...createdDeck.rows[0],
      cards: [],
    });
  } catch (err) {
    console.error("error creating deck", err);
    res.status(500).json({ error: "database error" });
  }
});

app.get("/api/decks/:deckId", async (req, res) => {
  try {
    const theDeck = await pool.query(
      `SELECT id, title, category
      FROM decks
      WHERE id = $1`,
      [req.params.deckId],
    );

    if (theDeck.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    const theCards = await pool.query(
      `SELECT id, question, answer, card_type AS "cardType"
      FROM cards
      WHERE deck_id = $1
      ORDER BY creation_time ASC`,
      [req.params.deckId],
    );

    res.json({
      ...theDeck.rows[0],
      cards: theCards.rows,
    });
  } catch (err) {
    console.error("cant get deck:", err);
    res.status(500).json({ error: "database error" });
  }
});

app.put("/api/decks/:deckId", async (req, res) => {
  try {
    const { title, category } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }
    const cleanTitle = DOMPurify.sanitize(title.trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });
    const cleanCategory = DOMPurify.sanitize((category || "").trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });

    if (!cleanTitle) {
      return res.status(400).json({ error: "invalid title" });
    }

    const updatedDeck = await pool.query(
      `UPDATE decks
    SET title = $1, category = $2
    WHERE id = $3
    RETURNING id, title, category`,
      [cleanTitle, cleanCategory, req.params.deckId],
    );

    if (updatedDeck.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    res.json(updatedDeck.rows[0]);
  } catch (err) {
    console.error("error updating deck", err);
    res.status(500).json({ error: "database error" });
  }
});

app.delete("/api/decks/:deckId", async (req, res) => {
  try {
    const deleteDeck = await pool.query(
      `DELETE FROM decks
      WHERE id = $1
      RETURNING id`,
      [req.params.deckId],
    );

    if (deleteDeck.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("error deleting deck", err);
    res.status(500).json({ error: "database error" });
  }
});

//  Card Routes
app.get("/api/decks/:deckId/cards", async (req, res) => {
  try {
    const deckChecker = await pool.query(`SELECT id FROM decks WHERE id = $1`, [
      req.params.deckId,
    ]);

    if (deckChecker.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    const cards = await pool.query(
      `SELECT id, question, answer, card_type AS "cardType"
    FROM CARDS
    WHERE deck_id = $1
    ORDER BY creation_time ASC`,
      [req.params.deckId],
    );

    res.json(cards.rows);
  } catch (err) {
    console.error("error getting cards", err);
    res.status(500).json({ error: "database error" });
  }
});

app.post("/api/decks/:deckId/cards", async (req, res) => {
  try {
    const deckChecker = await pool.query(`SELECT id FROM decks WHERE id = $1`, [
      req.params.deckId,
    ]);

    if (deckChecker.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    const { question, answer } = req.body;
    if (!question || !answer)
      return res.status(400).json({ error: "Question and answer required" });

    //  Sanitize the inputs before they touch data object
    const cleanQuestion = DOMPurify.sanitize(question.trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });
    const cleanAnswer = DOMPurify.sanitize(answer.trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });

    if (!cleanQuestion || !cleanAnswer) {
      return res
        .status(400)
        .json({ error: "Valid question and answer required" });
    }

    const cardId = `card-` + uuidv4();

    const newCard = await pool.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, question, answer, card_type AS "cardType"`,
      [cardId, req.params.deckId, cleanQuestion, cleanAnswer, "basic"],
    );

    res.status(201).json(newCard.rows[0]);
  } catch (err) {
    console.error("error creating card", err);
    res.status(500).json({ error: "database error" });
  }
});

app.put("/api/decks/:deckId/cards/:cardId", async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer)
      return res.status(400).json({ error: "Question and answer required" });

    const cleanQuestion = DOMPurify.sanitize(question.trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });

    const cleanAnswer = DOMPurify.sanitize(answer.trim(), {
      FORBID_TAGS: ["style", "script", "iframe"],
    });

    if (!cleanQuestion || !cleanAnswer)
      return res
        .status(400)
        .json({ error: "valid question/answer is required" });

    const updateCard = await pool.query(
      `UPDATE cards
    SET question = $1, answer = $2
    WHERE id = $3 AND deck_id = $4
    RETURNING id, question, answer, card_type AS "cardType"`,
      [cleanQuestion, cleanAnswer, req.params.cardId, req.params.deckId],
    );

    if (updateCard.rows.length === 0) {
      return res.status(404).json({ error: "card not found" });
    }

    res.json(updateCard.rows[0]);
  } catch (err) {
    console.error("error updating card", err);
    res.status(500).json({ error: "database error" });
  }
});

app.delete("/api/decks/:deckId/cards/:cardId", async (req, res) => {
  try {
    const deleteCard = await pool.query(
      `DELETE FROM cards
      WHERE id = $1 AND deck_id = $2
      RETURNING id`,
      [req.params.cardId, req.params.deckId],
    );

    if (deleteCard.rows.length === 0) {
      return res.status(404).json({ error: "card not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("error deleting card", err);
    res.status(500).json({ error: "database error" });
  }
});

// This works in Node.js ES Modules to see if this file was run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () =>
    console.log(`Flashcard app running at http://localhost:${PORT}`),
  );
}

export default app;
