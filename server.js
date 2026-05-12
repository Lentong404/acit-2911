import express from "express";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";
import DOMPurify from "isomorphic-dompurify";
import pool from "./db/pool.js";
import { performance } from "perf_hooks";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: "session",
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: "lax",
  },
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// AUTH ROUTES
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const sanitizeOpts = { FORBID_TAGS: ["style", "script", "iframe"] };
    const cleanUsername = DOMPurify.sanitize(username.trim(), sanitizeOpts);

    if (!cleanUsername) {
      return res.status(400).json({ error: "Invalid username content" });
    }

    const existing = await pool.query(
      `SELECT id FROM users WHERE username = $1`,
      [cleanUsername],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = "user-" + uuidv4();

    const createdUser = await pool.query(
      `INSERT INTO users (id, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username`,
      [id, cleanUsername, passwordHash],
    );

    req.session.userId = createdUser.rows[0].id;

    res.status(201).json(createdUser.rows[0]);
  } catch (err) {
    console.error("error registering user", err);
    res.status(500).json({ error: "database error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const result = await pool.query(
      `SELECT id, username, password_hash FROM users WHERE username = $1`,
      [username.trim()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    req.session.userId = user.id;

    res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error("error logging in user", err);
    res.status(500).json({ error: "database error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("error destroying session", err);
      return res.status(500).json({ error: "could not log out" });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const result = await pool.query(
      `SELECT id, username FROM users WHERE id = $1`,
      [req.session.userId],
    );

    if (result.rows.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Not logged in" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("error fetching current user", err);
    res.status(500).json({ error: "database error" });
  }
});

// DECK ROUTES
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

app.get("/api/decks/:deckId", async (req, res) => {
  try {
    const theDeck = await pool.query(
      `SELECT id, title, category FROM decks WHERE id = $1`,
      [req.params.deckId],
    );

    if (theDeck.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    const totalCards = await pool.query(
      `SELECT 
        c.id, c.question, c.answer, c.card_type AS "cardType",
        COALESCE(
          json_agg(
            json_build_object('id', cc.id, 'choiceText', cc.choice_text, 'isCorrect', cc.is_correct)
          ) FILTER (WHERE cc.id IS NOT NULL), '[]'
        ) AS choices
      FROM cards c
      LEFT JOIN card_choices cc ON cc.card_id = c.id
      WHERE c.deck_id = $1
      GROUP BY c.id
      ORDER BY c.creation_time ASC`,
      [req.params.deckId],
    );

    res.json({
      ...theDeck.rows[0],
      cards: totalCards.rows,
    });
  } catch (err) {
    console.error("cant get deck:", err);
    res.status(500).json({ error: "database error" });
  }
});

app.post("/api/decks", async (req, res) => {
  try {
    const { title, category } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const sanitizeOpts = { FORBID_TAGS: ["style", "script", "iframe"] };
    const cleanTitle = DOMPurify.sanitize(title.trim(), sanitizeOpts);
    const cleanCategory = DOMPurify.sanitize(
      (category || "").trim(),
      sanitizeOpts,
    );

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
      `DELETE FROM decks WHERE id = $1 RETURNING id`,
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

//  CARD ROUTES
app.get("/api/decks/:deckId/cards", async (req, res) => {
  try {
    const deckChecker = await pool.query(`SELECT id FROM decks WHERE id = $1`, [
      req.params.deckId,
    ]);

    if (deckChecker.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    const cards = await pool.query(
      `SELECT 
        c.id, c.question, c.answer, c.card_type AS "cardType",
        COALESCE(
          json_agg(
            json_build_object('id', cc.id, 'choiceText', cc.choice_text, 'isCorrect', cc.is_correct)
          ) FILTER (WHERE cc.id IS NOT NULL), '[]'
        ) AS choices
      FROM cards c
      LEFT JOIN card_choices cc ON cc.card_id = c.id
      WHERE c.deck_id = $1
      GROUP BY c.id
      ORDER BY c.creation_time ASC`,
      [req.params.deckId],
    );

    res.json(cards.rows);
  } catch (err) {
    console.error("error getting cards", err);
    res.status(500).json({ error: "database error" });
  }
});

app.post("/api/decks/:deckId/cards", async (req, res) => {
  const client = await pool.connect();
  try {
    const deckChecker = await client.query(
      `SELECT id FROM decks WHERE id = $1`,
      [req.params.deckId],
    );
    if (deckChecker.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    const {
      question,
      answer,
      cardType = req.body.card_type || "basic",
      choices = req.body.card_choices || req.body.choices || [],
    } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: "Question and answer required" });
    }

    if (!["basic", "multiple_choice", "true_false"].includes(cardType)) {
      return res.status(400).json({ error: "Invalid card type layout" });
    }

    const sanitizeOpts = { FORBID_TAGS: ["style", "script", "iframe"] };
    const cleanQuestion = DOMPurify.sanitize(question.trim(), sanitizeOpts);
    const cleanAnswer = DOMPurify.sanitize(answer.trim(), sanitizeOpts);

    if (!cleanQuestion || !cleanAnswer) {
      return res
        .status(400)
        .json({ error: "Valid question and answer required" });
    }

    await client.query("BEGIN");

    const cardId = `card-` + uuidv4();

    const { rows: cardRows } = await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, question, answer, card_type AS "cardType"`,
      [cardId, req.params.deckId, cleanQuestion, cleanAnswer, cardType],
    );

    const packedChoices = [];
    if (cardType === "multiple_choice" && Array.isArray(choices)) {
      for (const choice of choices) {
        const rawText = choice.choice_text || choice.choiceText;
        if (!rawText || !rawText.trim()) continue;

        const cleanChoiceText = DOMPurify.sanitize(
          rawText.trim(),
          sanitizeOpts,
        );
        const choiceId = `choice-` + uuidv4();
        const rawCorrect =
          choice.is_correct !== undefined
            ? choice.is_correct
            : choice.isCorrect;

        const { rows: choiceRows } = await client.query(
          `INSERT INTO card_choices (id, card_id, choice_text, is_correct)
           VALUES ($1, $2, $3, $4)
           RETURNING id, choice_text AS "choiceText", is_correct AS "isCorrect"`,
          [choiceId, cardId, cleanChoiceText, !!rawCorrect],
        );

        packedChoices.push(choiceRows[0]);
      }
    }

    await client.query("COMMIT");

    res.status(201).json({ ...cardRows[0], choices: packedChoices });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    console.error("error creating card structural assets", err);
    res.status(500).json({ error: "database error" });
  } finally {
    client.release();
  }
});

app.put("/api/decks/:deckId/cards/:cardId", async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      question,
      answer,
      cardType = req.body.card_type,
      choices = req.body.card_choices || req.body.choices || [],
    } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: "Question and answer required" });
    }

    const sanitizeOpts = { FORBID_TAGS: ["style", "script", "iframe"] };
    const cleanQuestion = DOMPurify.sanitize(question.trim(), sanitizeOpts);
    const cleanAnswer = DOMPurify.sanitize(answer.trim(), sanitizeOpts);

    await client.query("BEGIN");

    const currentCheck = await client.query(
      `SELECT card_type FROM cards WHERE id = $1 AND deck_id = $2`,
      [req.params.cardId, req.params.deckId],
    );

    if (currentCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "card not found" });
    }

    const finalCardType = cardType || currentCheck.rows[0].card_type;

    if (!["basic", "multiple_choice", "true_false"].includes(finalCardType)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid card type layout" });
    }

    const updateCard = await client.query(
      `UPDATE cards
       SET question = $1, answer = $2, card_type = $3
       WHERE id = $4 AND deck_id = $5
       RETURNING id, question, answer, card_type AS "cardType"`,
      [
        cleanQuestion,
        cleanAnswer,
        finalCardType,
        req.params.cardId,
        req.params.deckId,
      ],
    );

    const currentCard = updateCard.rows[0];
    const updatedChoices = [];

    if (finalCardType === "multiple_choice") {
      await client.query(`DELETE FROM card_choices WHERE card_id = $1`, [
        req.params.cardId,
      ]);

      if (Array.isArray(choices)) {
        for (const choice of choices) {
          const rawText = choice.choice_text || choice.choiceText;
          if (!rawText || !rawText.trim()) continue;

          const cleanTxt = DOMPurify.sanitize(rawText.trim(), sanitizeOpts);
          const choiceId = `choice-` + uuidv4();

          const rawCorrect =
            choice.is_correct !== undefined
              ? choice.is_correct
              : choice.isCorrect;

          const added = await client.query(
            `INSERT INTO card_choices (id, card_id, choice_text, is_correct)
             VALUES ($1, $2, $3, $4)
             RETURNING id, choice_text AS "choiceText", is_correct AS "isCorrect"`,
            [choiceId, req.params.cardId, cleanTxt, !!rawCorrect],
          );
          updatedChoices.push(added.rows[0]);
        }
      }
    } else {
      await client.query(`DELETE FROM card_choices WHERE card_id = $1`, [
        req.params.cardId,
      ]);
    }

    await client.query("COMMIT");
    res.json({ ...currentCard, choices: updatedChoices });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    console.error("error updating structured cards", err);
    res.status(500).json({ error: "database error" });
  } finally {
    client.release();
  }
});

app.delete("/api/decks/:deckId/cards/:cardId", async (req, res) => {
  try {
    const deleteCard = await pool.query(
      `DELETE FROM cards WHERE id = $1 AND deck_id = $2 RETURNING id`,
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

// STARTUP METRICS
async function printStartupMetrics() {
  try {
    const startTime = performance.now();

    const counts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM decks) AS decks,
        (SELECT COUNT(*) FROM cards) AS cards,
        (SELECT COUNT(*) FROM card_choices) AS choices
    `);

    const durationMs = (performance.now() - startTime).toFixed(2);
    const row = counts.rows[0];

    console.log("-----------------------------------------");
    console.log("📊 SYSTEM STARTUP STATUS DATA DIAGNOSTIC:");
    console.log(`   • Users Registered:  ${row.users}`);
    console.log(`   • Decks Configured:  ${row.decks}`);
    console.log(`   • Cards Ingested:    ${row.cards} [Polymorphic Matrix]`);
    console.log(`   • Multiple Choices:  ${row.choices}`);
    console.log(`   • DB Query Time:     ${durationMs}ms`);
    console.log("-----------------------------------------");
  } catch (error) {
    console.error("⚠️ Startup database diagnostic failure:", error.message);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, async () => {
    console.log(`Flashcard app running at http://localhost:${PORT}`);
    await printStartupMetrics();
  });
}

export default app;
