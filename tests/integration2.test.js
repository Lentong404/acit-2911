import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../server.js";
import pool from "../db/pool.js"; 
import { createAuthedAgent, cleanupTestUsers } from "./helpers.js";

describe("API Endpoint Integration Suite", () => {
  let agent, userId;

  after(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM card_choices");
    await pool.query("DELETE FROM cards");
    await pool.query("DELETE FROM decks");
    await cleanupTestUsers();

    ({ agent, userId } = await createAuthedAgent(app));

    await pool.query(
      "INSERT INTO decks (id, user_id, title, category) VALUES ($1, $2, $3, $4)",
      ["deck-integration-1", userId, "API Test Deck", "Testing"]
    );
  });

  describe("POST /api/decks/:deckId/cards", () => {
    it("should process a multi-choice card payload, save it to the DB, and return it with aggregate choices", async () => {
      const complexPayload = {
        question: "What is the capital of Canada?",
        answer: "Ottawa",
        cardType: "multiple_choice",
        choices: [
          { choice_text: "Ottawa", is_correct: true },
          { choice_text: "Vancouver", is_correct: false }
        ]
      };

      const res = await agent
        .post("/api/decks/deck-integration-1/cards")
        .send(complexPayload)
        .expect("Content-Type", /json/)
        .expect(201);

      const correctChoice = res.body.choices.find(c => c.isCorrect === true);

      console.log('DEBUG RESPONSE BODY:', JSON.stringify(res.body, null, 2));
      assert.match(res.body.id, /^card-/);
      assert.equal(res.body.cardType, "multiple_choice");
      assert.equal(res.body.choices.length, 2);
      assert.ok(correctChoice, 'Should have found a correct choice');
      assert.strictEqual(correctChoice.choiceText, 'Ottawa');

      const dbCard = await pool.query("SELECT * FROM cards WHERE id = $1", [res.body.id]);
      const dbChoices = await pool.query("SELECT * FROM card_choices WHERE card_id = $1", [res.body.id]);

      assert.equal(dbCard.rows.length, 1);
      assert.equal(dbChoices.rows.length, 2);
    });

    it("should enforce input sanitization and save scrubbed strings to the database", async () => {
      const dirtyPayload = {
        question: "Hello <script>alert('xss')</script>World",
        answer: "Safe Answer <iframe src='malicious.site'></iframe>"
      };

      const res = await agent
        .post("/api/decks/deck-integration-1/cards")
        .send(dirtyPayload)
        .expect(201);

      assert.equal(res.body.question, "Hello World");
      assert.equal(res.body.answer, "Safe Answer ");

      const dbCheck = await pool.query("SELECT question FROM cards WHERE id = $1", [res.body.id]);
      assert.equal(dbCheck.rows[0].question, "Hello World");
    });
  });

  describe("GET /api/decks/:deckId", () => {
    it("should return a clean 404 error packet when requesting an unknown deck id", async () => {
      const res = await agent
        .get("/api/decks/deck-does-not-exist")
        .expect(404);

      assert.deepEqual(res.body, { error: "deck not found" });
    });
  });
});
