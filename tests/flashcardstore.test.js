import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Note: In a real project, you'd move your helper functions 
// from server.js into a "Store" class like your Todo example.
// This test assumes a similar structure for your Flashcards.

describe("Flashcard Logic", () => {
  let decks;

  beforeEach(() => {
    // Resetting to default state before each test
    decks = {
      'deck-1': {
        id: 'deck-1',
        title: 'JavaScript Basics',
        category: 'Programming',
        cards: [
          { id: 'card-1', question: 'Q1', answer: 'A1' }
        ]
      }
    };
  });

  // ----------------------------------------------------------- Deck Operations

  describe("Deck Management", () => {
    it("adds a new deck with a unique ID", () => {
      const title = "New Language";
      const id = "deck-new-123";
      decks[id] = { id, title, category: 'General', cards: [] };
      
      assert.equal(decks[id].title, "New Language");
      assert.equal(decks[id].cards.length, 0);
    });

    it("prevents adding a deck with an empty title", () => {
      const addDeck = (title) => {
        if (!title || !title.trim()) throw new Error("Title is required");
      };
      assert.throws(() => addDeck(""), /Title is required/);
    });

    it("retrieves all decks as a list", () => {
      const deckList = Object.values(decks);
      assert.equal(deckList.length, 1);
      assert.equal(deckList[0].id, 'deck-1');
    });

    it("deletes a deck by ID", () => {
      delete decks['deck-1'];
      assert.equal(decks['deck-1'], undefined);
    });
  });

  // ----------------------------------------------------------- Card Operations

  describe("Card Management", () => {
    it("adds a card to a specific deck", () => {
      const deck = decks['deck-1'];
      const newCard = { id: 'card-99', question: '2+2?', answer: '4' };
      deck.cards.push(newCard);
      
      assert.equal(deck.cards.length, 2);
      assert.equal(deck.cards[1].question, '2+2?');
    });

    it("updates an existing card's content", () => {
      const card = decks['deck-1'].cards.find(c => c.id === 'card-1');
      card.question = "Updated Question";
      
      assert.equal(decks['deck-1'].cards[0].question, "Updated Question");
    });

    it("deletes a specific card from a deck", () => {
      const deck = decks['deck-1'];
      const initialCount = deck.cards.length;
      
      const idx = deck.cards.findIndex(c => c.id === 'card-1');
      deck.cards.splice(idx, 1);
      
      assert.equal(deck.cards.length, initialCount - 1);
      assert.equal(deck.cards.find(c => c.id === 'card-1'), undefined);
    });
  });

  // ----------------------------------------------------------- Filtering Logic

  describe("Filtering Logic", () => {
    it("filters decks by category correctly", () => {
      // Adding a second deck with a different category
      decks['deck-2'] = { id: 'deck-2', title: 'Test', category: 'Math', cards: [] };
      
      const allDecks = Object.values(decks);
      const programmingDecks = allDecks.filter(d => d.category === 'Programming');
      
      assert.equal(programmingDecks.length, 1);
      assert.equal(programmingDecks[0].category, 'Programming');
    });
  });
});