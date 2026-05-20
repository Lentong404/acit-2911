import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../server.js";
import pool from "../db/pool.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { cleanupTestUsers } from "./helpers.js";

async function makeUser(username) {
  const password = `${username}pass`;
  const hash = await bcrypt.hash(password, 12);
  const id = "user-" + uuidv4();
  await pool.query(
    `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
    [id, username, hash]
  );
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password }).expect(200);
  return { id, agent };
}

describe("Deck sharing", () => {
  let alice, bob;
  let aliceDeckId, aliceCardId;

  after(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM share_tokens");
    await pool.query("DELETE FROM card_choices");
    await pool.query("DELETE FROM cards");
    await pool.query("DELETE FROM decks");
    await cleanupTestUsers();

    alice = await makeUser("alice");
    bob = await makeUser("bob");

    aliceDeckId = "deck-" + uuidv4();
    await pool.query(
      `INSERT INTO decks (id, user_id, title, category) VALUES ($1, $2, $3, $4)`,
      [aliceDeckId, alice.id, "Alice's Deck", "Test"]
    );
    aliceCardId = "card-" + uuidv4();
    await pool.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      [aliceCardId, aliceDeckId, "Q", "A"]
    );
  });

  describe("POST /api/decks/:id/share", () => {
    it("returns 401 when unauthenticated", async () => {
      await request(app).post(`/api/decks/${aliceDeckId}/share`).expect(401);
    });

    it("creates a share token for the owner", async () => {
      const res = await alice.agent
        .post(`/api/decks/${aliceDeckId}/share`)
        .expect(201);
      assert.match(res.body.token, /^share-/);

      const check = await pool.query(
        "SELECT deck_id, created_by FROM share_tokens WHERE token = $1",
        [res.body.token]
      );
      assert.equal(check.rows.length, 1);
      assert.equal(check.rows[0].deck_id, aliceDeckId);
      assert.equal(check.rows[0].created_by, alice.id);
    });

    it("is idempotent — returns the same token on repeated calls", async () => {
      const first = await alice.agent
        .post(`/api/decks/${aliceDeckId}/share`)
        .expect(201);
      const second = await alice.agent
        .post(`/api/decks/${aliceDeckId}/share`)
        .expect(200);
      assert.equal(first.body.token, second.body.token);

      const check = await pool.query(
        "SELECT COUNT(*)::int FROM share_tokens WHERE deck_id = $1",
        [aliceDeckId]
      );
      assert.equal(check.rows[0].count, 1);
    });

    it("Bob cannot create a share token for Alice's deck (404)", async () => {
      await bob.agent.post(`/api/decks/${aliceDeckId}/share`).expect(404);

      const check = await pool.query(
        "SELECT COUNT(*)::int FROM share_tokens WHERE deck_id = $1",
        [aliceDeckId]
      );
      assert.equal(check.rows[0].count, 0);
    });

    it("returns 404 for a nonexistent deck", async () => {
      await alice.agent
        .post(`/api/decks/deck-${uuidv4()}/share`)
        .expect(404);
    });
  });

  describe("GET /api/shared/:token", () => {
    let token;

    beforeEach(async () => {
      const res = await alice.agent
        .post(`/api/decks/${aliceDeckId}/share`)
        .expect(201);
      token = res.body.token;
    });

    it("returns the deck and cards without authentication", async () => {
      const res = await request(app).get(`/api/shared/${token}`).expect(200);
      assert.equal(res.body.deck.id, aliceDeckId);
      assert.equal(res.body.deck.title, "Alice's Deck");
      assert.equal(res.body.cards.length, 1);
      assert.equal(res.body.cards[0].question, "Q");
    });

    it("does not expose user_id in the response", async () => {
      const res = await request(app).get(`/api/shared/${token}`).expect(200);
      assert.equal(res.body.deck.user_id, undefined);
    });

    it("works for authenticated non-owner users (Bob can view)", async () => {
      const res = await bob.agent.get(`/api/shared/${token}`).expect(200);
      assert.equal(res.body.deck.title, "Alice's Deck");
    });

    it("returns 404 for a nonexistent token", async () => {
      await request(app).get(`/api/shared/share-${uuidv4()}`).expect(404);
    });

    it("returns 404 after the original deck is deleted (cascade)", async () => {
      await alice.agent.delete(`/api/decks/${aliceDeckId}`).expect(200);
      await request(app).get(`/api/shared/${token}`).expect(404);

      // Confirm the share_token row was cascade-deleted
      const check = await pool.query(
        "SELECT COUNT(*)::int FROM share_tokens WHERE token = $1",
        [token]
      );
      assert.equal(check.rows[0].count, 0);
    });
  });
});
