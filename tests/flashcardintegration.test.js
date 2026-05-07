import { describe, it } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import app from "../server.js"; // Import your Express app

describe("Flashcard API Integration", () => {

  // ----------------------------------------------------------- GET /api/decks
  describe("GET /api/decks", () => {
    it("returns 200 and a JSON array", async () => {
      const res = await supertest(app).get("/api/decks");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it("returns at least the default decks on first load", async () => {
      const res = await supertest(app).get("/api/decks");
      // Checks if 'JavaScript Basics' exists in any of the returned decks
      const hasBasics = res.body.some(d => d.title === "JavaScript Basics");
      assert.ok(hasBasics);
    });
  });

  // ---------------------------------------------------------- POST /api/decks
  describe("POST /api/decks", () => {
    it("returns 201 and the new deck object", async () => {
      const newDeck = { title: "Science", category: "STEM" };
      const res = await supertest(app)
        .post("/api/decks")
        .send(newDeck);
      
      assert.equal(res.status, 201);
      assert.equal(res.body.title, "Science");
      assert.ok(res.body.id.startsWith("deck-"));
    });

    it("returns 400 if the title is missing", async () => {
      const res = await supertest(app)
        .post("/api/decks")
        .send({ category: "Empty" });
      
      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Title is required");
    });

    it("returns 400 if the title is only whitespace", async () => {
      const res = await supertest(app)
        .post("/api/decks")
        .send({ title: "   " });
      
      assert.equal(res.status, 400);
    });
  });

  // ---------------------------------------------------- POST /api/decks/:id/cards
  describe("POST /api/decks/:deckId/cards", () => {
    it("adds a card to an existing deck", async () => {
      // Using 'deck-1' from your getDefaultDecks
      const newCard = { question: "1+1", answer: "2" };
      const res = await supertest(app)
        .post("/api/decks/deck-1/cards")
        .send(newCard);

      assert.equal(res.status, 201);
      assert.equal(res.body.question, "1+1");
      assert.ok(res.body.id.startsWith("card-"));
    });

    it("returns 404 for a non-existent deck", async () => {
      const res = await supertest(app)
        .post("/api/decks/fake-id/cards")
        .send({ question: "Q", answer: "A" });
      
      assert.equal(res.status, 404);
      assert.equal(res.body.error, "Deck not found");
    });
  });

  // -------------------------------------------------------- DELETE /api/decks/:id
  describe("DELETE /api/decks/:id", () => {
    it("returns success:true when deleting a deck", async () => {
      // First create a deck to delete so we don't ruin our defaults
      const setup = await supertest(app)
        .post("/api/decks")
        .send({ title: "Delete Me" });
      
      const res = await supertest(app).delete(`/api/decks/${setup.body.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    it("returns 404 when deleting a deck that doesn't exist", async () => {
      const res = await supertest(app).delete("/api/decks/ghost-id");
      assert.equal(res.status, 404);
    });
  });
});
