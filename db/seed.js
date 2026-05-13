import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "./pool.js"; // Adjust path to your pg pool

export async function seedDatabase() {
  const client = await pool.connect();
  
  try {
    console.log("Starting database seeding (Appending data)...");
    await client.query("BEGIN");

    // Insert two test users with real bcrypt hashes
    const aliceHash = await bcrypt.hash("alicepass", 12);
    const bobHash = await bcrypt.hash("bobpass", 12);

    const aliceId = "user-" + crypto.randomUUID();
    const bobId = "user-" + crypto.randomUUID();

    await client.query(
      `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
      [aliceId, "alice", aliceHash]
    );
    await client.query(
      `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
      [bobId, "bob", bobHash]
    );

    // ========================================== DECK 1: WEB DEVELOPMENT
    const deck1Id = "deck-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO decks (id, user_id, title, category) VALUES ($1, $2, $3, $4)`,
      [deck1Id, aliceId, "Web Development Essentials", "Programming"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck1Id, "What does DOM stand for?", "Document Object Model"]
    );

    const card1Mcq1 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card1Mcq1, deck1Id, "Which array method returns a shallow copy of a portion of an array?", "slice"]
    );
    const choices1 = [
      { text: "splice", correct: false }, { text: "slice", correct: true },
      { text: "shift", correct: false }, { text: "push", correct: false }
    ];
    for (const c of choices1) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card1Mcq1, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck1Id, "JavaScript is a statically typed language.", "False"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck1Id, "What CSS property controls the stack order of elements?", "z-index"]
    );

    const card1Mcq2 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card1Mcq2, deck1Id, "Which HTTP status code represents a resource that was permanently moved?", "301"]
    );
    const choices2 = [
      { text: "201 Created", correct: false }, { text: "301 Moved Permanently", correct: true },
      { text: "403 Forbidden", correct: false }, { text: "502 Bad Gateway", correct: false }
    ];
    for (const c of choices2) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card1Mcq2, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck1Id, "The HTTP 'OPTIONS' method is used to initiate a CORS preflight request.", "True"]
    );

    // ========================================== DECK 2: WORLD HISTORY
    const deck2Id = "deck-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO decks (id, user_id, title, category) VALUES ($1, $2, $3, $4)`,
      [deck2Id, aliceId, "World War II Trivia", "History"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck2Id, "In what year did World War II officially end?", "1945"]
    );

    const card2Mcq1 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card2Mcq1, deck2Id, "Who was the Prime Minister of Great Britain during most of WWII?", "Winston Churchill"]
    );
    const choices3 = [
      { text: "Neville Chamberlain", correct: false }, { text: "Winston Churchill", correct: true },
      { text: "Clement Attlee", correct: false }
    ];
    for (const c of choices3) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card2Mcq1, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck2Id, "The United States joined WWII immediately following the invasion of Poland.", "False"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck2Id, "What was the codename for the secret US project that developed the atomic bomb?", "Manhattan Project"]
    );

    const card2Mcq2 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card2Mcq2, deck2Id, "Which conference in 1945 brought together Allied leaders to plan Europe's postwar reorganization?", "Yalta Conference"]
    );
    const choices4 = [
      { text: "Tehran Conference", correct: false }, { text: "Potsdam Conference", correct: false },
      { text: "Yalta Conference", correct: true }
    ];
    for (const c of choices4) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card2Mcq2, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck2Id, "The Battle of Midway is widely considered the turning point of the war in the Pacific.", "True"]
    );

    // ========================================== DECK 3: ADVANCED POSTGRESQL
    const deck3Id = "deck-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO decks (id, user_id, title, category) VALUES ($1, $2, $3, $4)`,
      [deck3Id, bobId, "Advanced PostgreSQL Internals", "Databases"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck3Id, "What mechanism does PostgreSQL use to handle concurrent modifications without locking rows?", "MVCC"]
    );

    const card3Mcq1 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card3Mcq1, deck3Id, "Which index type is default and handles equality and range queries?", "B-Tree"]
    );
    const choices5 = [
      { text: "Hash", correct: false }, { text: "B-Tree", correct: true },
      { text: "GIN", correct: false }, { text: "GiST", correct: false }
    ];
    for (const c of choices5) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card3Mcq1, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck3Id, "Running VACUUM FULL always requires a full table lock.", "True"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck3Id, "What parameter determines the maximum size of transaction logs stored before a checkpoint?", "max_wal_size"]
    );

    const card3Mcq2 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card3Mcq2, deck3Id, "Which isolation level completely prevents serialization anomalies and write skew?", "Serializable"]
    );
    const choices6 = [
      { text: "Read Committed", correct: false }, { text: "Repeatable Read", correct: false },
      { text: "Serializable", correct: true }
    ];
    for (const c of choices6) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card3Mcq2, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck3Id, "The GIN (Generalized Inverted Index) type is suboptimal for full-text search indexing.", "False"]
    );

    // ========================================== DECK 4: WEB SECURITY
    const deck4Id = "deck-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO decks (id, user_id, title, category) VALUES ($1, $2, $3, $4)`,
      [deck4Id, bobId, "Web Application Security", "Cybersecurity"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck4Id, "What does CORS stand for?", "Cross-Origin Resource Sharing"]
    );

    const card4Mcq1 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card4Mcq1, deck4Id, "Which cookie attribute prevents client-side scripts from reading cookie tokens?", "HttpOnly"]
    );
    const choices7 = [
      { text: "Secure", correct: false }, { text: "SameSite", correct: false },
      { text: "HttpOnly", correct: true }
    ];
    for (const c of choices7) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card4Mcq1, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck4Id, "A Content Security Policy (CSP) can fully eliminate risk from XSS attacks when misconfigured.", "False"]
    );

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'basic')`,
      ["card-" + crypto.randomUUID(), deck4Id, "What attack payload vector tricks a authenticated browser into performing actions it didn't intend to?", "CSRF"]
    );

    const card4Mcq2 = "card-" + crypto.randomUUID();
    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'multiple_choice')`,
      [card4Mcq2, deck4Id, "Which cryptographic primitive is best suited for hashing human passwords?", "argon2id"]
    );
    const choices8 = [
      { text: "MD5", correct: false }, { text: "SHA-256", correct: false },
      { text: "argon2id", correct: true }
    ];
    for (const c of choices8) {
      await client.query(
        `INSERT INTO card_choices (id, card_id, choice_text, is_correct) VALUES ($1, $2, $3, $4)`,
        ["choice-" + crypto.randomUUID(), card4Mcq2, c.text, c.correct]
      );
    }

    await client.query(
      `INSERT INTO cards (id, deck_id, question, answer, card_type) VALUES ($1, $2, $3, $4, 'true_false')`,
      ["card-" + crypto.randomUUID(), deck4Id, "Using parameterized queries natively protects database targets from classic SQL injection vectors.", "True"]
    );

    await client.query("COMMIT");
    console.log("Database successfully populated with cards!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seeding failed, transaction rolled back:", error);
  } finally {
    client.release();
  }
}

if (process.argv[1] === import.meta.filename) {
  seedDatabase().then(() => pool.end());
}
