import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db/pool.js";
import DOMPurify from "isomorphic-dompurify";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const OLLAMA_BASE = String(process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_TAGS_API = `${OLLAMA_BASE}/api/tags`;
const OLLAMA_STREAM_API = `${OLLAMA_BASE}/api/generate`;
/** Fallback when no model is sent — set OLLAMA_MODEL in .env */
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4";

const PURIFY_OPTS = { FORBID_TAGS: ["style", "script", "iframe"] };

function clampCardCount(n) {
  const x = parseInt(String(n), 10);
  if (Number.isNaN(x)) return 1;
  return Math.min(20, Math.max(1, x));
}

/** Pull a JSON array of {question, answer} from model output (may include markdown fences or prose). */
function extractCardsFromRaw(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Empty model output");

  let candidate = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("No flashcard JSON array found in the response");

  candidate = candidate.slice(start, end + 1);
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of cards");

  const cards = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const q = DOMPurify.sanitize(String(item.question ?? ""), PURIFY_OPTS).trim();
    const a = DOMPurify.sanitize(String(item.answer ?? ""), PURIFY_OPTS).trim();
    if (q && a) cards.push({ question: q, answer: a });
  }
  if (cards.length === 0) throw new Error("No valid question/answer pairs in JSON");
  return cards;
}

/**
 * GET /ai-chat — static UI lives at /ai-chat.html
 */
router.get("/", (req, res) => {
  res.redirect(302, "/ai-chat.html");
});

/**
 * GET /ai-chat/models — names from local Ollama (`ollama list` /api/tags)
 */
router.get("/models", requireAuth, async (req, res) => {
  try {
    const r = await fetch(OLLAMA_TAGS_API, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({
        error: err.error || "Could not list Ollama models",
        models: [],
        defaultModel: OLLAMA_MODEL,
        base: OLLAMA_BASE,
      });
    }
    const data = await r.json();
    const raw = Array.isArray(data.models) ? data.models : [];
    const models = raw
      .map((m) => (m && (m.name || m.model)) || "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    res.json({ models, defaultModel: OLLAMA_MODEL, base: OLLAMA_BASE });
  } catch (e) {
    res.status(503).json({
      error: e.message || "Ollama unreachable",
      models: [],
      defaultModel: OLLAMA_MODEL,
      base: OLLAMA_BASE,
    });
  }
});

/**
 * POST /ai-chat
 * Send a topic to Ollama and stream JSON flashcards (array of {question, answer}).
 * Body: { prompt, model?: string, cardCount?: number (1–25), systemPrompt?: string }
 */
router.post("/", requireAuth, async (req, res) => {
  const { prompt, systemPrompt: customSystem } = req.body;
  const cardCount = clampCardCount(req.body.cardCount);
  const bodyModel = req.body.model;
  const model =
    typeof bodyModel === "string" && bodyModel.trim()
      ? bodyModel.trim().slice(0, 240)
      : OLLAMA_MODEL;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const systemPrompt =
    customSystem && typeof customSystem === "string"
      ? customSystem
      : `You are a flashcard generator. Output ONLY valid JSON: a single array of exactly ${cardCount} objects. Each object must have string keys "question" and "answer" only. No markdown code fences, no explanation or commentary before or after the array. Questions must be clear and concise; answers must be accurate and useful for studying (typically 1–4 sentences unless the topic needs a bit more).`;

  const userPrompt = `${prompt.trim()}\n\nReturn exactly ${cardCount} flashcards as one JSON array: [{"question":"...","answer":"..."}, ...]`;

  try {
    const response = await fetch(OLLAMA_STREAM_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: userPrompt,
        system: systemPrompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to connect to Ollama" }));
      return res.status(response.status).json({ error: errorData.error || errorData.message || "Ollama error" });
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let promptTokens = null;
    let completionTokens = null;

    const absorbOllamaMeta = (json) => {
      if (!json || typeof json !== "object") return;
      if (typeof json.prompt_eval_count === "number") promptTokens = json.prompt_eval_count;
      if (typeof json.eval_count === "number") completionTokens = json.eval_count;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          absorbOllamaMeta(json);
          if (json.response) {
            res.write(JSON.stringify({ response: json.response, done: false }) + "\n");
          }
        } catch {
          // ignore partial / non-JSON lines
        }
      }
    }

    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer.trim());
        absorbOllamaMeta(json);
        if (json.response) {
          res.write(JSON.stringify({ response: json.response, done: false }) + "\n");
        }
      } catch {
        /* ignore */
      }
    }

    const donePayload = { response: "", done: true };
    if (promptTokens != null) donePayload.promptTokens = promptTokens;
    if (completionTokens != null) donePayload.completionTokens = completionTokens;
    res.write(JSON.stringify(donePayload) + "\n");
    res.end();

  } catch (error) {
    console.error("AI Chat error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * POST /ai-chat/completed
 * Sanitize a single answer string (legacy / simple flows)
 */
router.post("/completed", requireAuth, async (req, res) => {
  const { prompt, answer } = req.body;

  if (!answer) {
    return res.status(400).json({ error: "No answer provided" });
  }

  res.json({
    prompt,
    answer: DOMPurify.sanitize(String(answer), PURIFY_OPTS),
  });
});

/**
 * POST /ai-chat/parse-cards
 * Parse model output into sanitized { question, answer }[].
 * Body: { raw: string }
 */
router.post("/parse-cards", requireAuth, (req, res) => {
  const { raw } = req.body;
  if (raw == null || typeof raw !== "string") {
    return res.status(400).json({ error: "raw text is required" });
  }
  try {
    const cards = extractCardsFromRaw(raw);
    res.json({ cards });
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not parse flashcards" });
  }
});

/**
 * POST /ai-chat/save-batch
 * Body: { deckId: string, cards: { question, answer }[] }
 */
router.post("/save-batch", requireAuth, async (req, res) => {
  const { deckId, cards } = req.body;

  if (!deckId || typeof deckId !== "string") {
    return res.status(400).json({ error: "deckId is required" });
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: "cards must be a non-empty array" });
  }

  const client = await pool.connect();
  try {
    const deckCheck = await client.query(
      `SELECT id FROM decks WHERE id = $1 AND user_id = $2`,
      [deckId, req.session.userId]
    );
    if (deckCheck.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    await client.query("BEGIN");
    const cardIds = [];
    for (const c of cards) {
      const q = DOMPurify.sanitize(String(c.question ?? ""), PURIFY_OPTS).trim();
      const a = DOMPurify.sanitize(String(c.answer ?? ""), PURIFY_OPTS).trim();
      if (!q || !a) continue;
      const id = `card-${uuidv4()}`;
      await client.query(
        `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
        [id, deckId, q, a]
      );
      cardIds.push(id);
    }

    if (cardIds.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No valid cards to save" });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      count: cardIds.length,
      cardIds,
      message: `Saved ${cardIds.length} flashcard${cardIds.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Save batch error:", error);
    res.status(500).json({ error: error.message || "Failed to save flashcards" });
  } finally {
    client.release();
  }
});

/**
 * POST /ai-chat/save
 * Save the Q&A pair to the database
 */
router.post("/save", requireAuth, async (req, res) => {
  const { prompt, answer, deckId, deckTitle } = req.body;

  if (!prompt || !answer) {
    return res.status(400).json({ error: "Prompt and answer are required" });
  }

  try {
    let deckIdToUse = deckId;

    if (!deckIdToUse && deckTitle) {
      const result = await pool.query(
        `SELECT id FROM decks WHERE user_id = $1 AND title = $2`,
        [req.session.userId, deckTitle]
      );
      if (result.rows.length > 0) {
        deckIdToUse = result.rows[0].id;
      }
    }

    if (!deckIdToUse) {
      return res.status(400).json({ error: "Deck not found. Please specify a deck ID or matching deck title." });
    }

    const ownershipCheck = await pool.query(
      `SELECT id FROM decks WHERE id = $1 AND user_id = $2`,
      [deckIdToUse, req.session.userId]
    );
    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ error: "deck not found" });
    }

    const cleanPrompt = DOMPurify.sanitize(String(prompt), PURIFY_OPTS).trim();
    const cleanAnswer = DOMPurify.sanitize(String(answer), PURIFY_OPTS).trim();

    if (!cleanPrompt || !cleanAnswer) {
      return res.status(400).json({ error: "Prompt and answer are required" });
    }

    const cardId = `card-${uuidv4()}`;
    const result = await pool.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic') RETURNING id`,
      [cardId, deckIdToUse, cleanPrompt, cleanAnswer]
    );

    res.json({
      success: true,
      cardId: result.rows[0].id,
      message: "Flashcard saved successfully!",
    });
  } catch (error) {
    console.error("Save flashcard error:", error);
    res.status(500).json({ error: error.message || "Failed to save flashcard" });
  }
});

export default router;
