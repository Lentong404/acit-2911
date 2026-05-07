import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import process from 'process';
import DOMPurify from 'isomorphic-dompurify';




// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


//  Load & Save helpers 
function loadDecks() {
  if (!fs.existsSync(DATA_FILE)) return getDefaultDecks();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    console.warn('Could not read data.json');
    return getDefaultDecks();
  }
}

function saveDecks() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(decks, null, 2), 'utf-8');
}

function getDefaultDecks() {
  return {
    'deck-1': {
      id: 'deck-1',
      title: 'JavaScript Basics',
      category: 'Programming',
      cards: [
        { id: 'card-1', question: 'What is a closure in JavaScript?', answer: 'A closure is a function that has access to variables in its outer scope, even after the outer function has returned.' },
        { id: 'card-2', question: 'What is the difference between let, const, and var?', answer: 'var is function-scoped and hoisted. let is block-scoped and not hoisted. const is block-scoped, not hoisted, and cannot be reassigned.' },
        { id: 'card-3', question: 'What is event delegation?', answer: 'Event delegation is a technique where a single event listener is added to a parent element to handle events from its children, leveraging event bubbling.' }
      ]
    },
    'deck-2': {
      id: 'deck-2',
      title: 'Spanish Vocabulary',
      category: 'Languages',
      cards: [
        { id: 'card-4', question: '¿Cómo estás?', answer: 'How are you?' },
        { id: 'card-5', question: '¿Dónde está el baño?', answer: 'Where is the bathroom?' }
      ]
    },
    'deck-3': {
      id: 'deck-3',
      title: 'React Hooks',
      category: 'Programming',
      cards: [
        { id: 'card-6', question: 'What does useState return?', answer: 'An array with two elements: the current state value and a setter function to update it.' },
        { id: 'card-7', question: 'When does useEffect run?', answer: 'After every render by default. You can control when it runs by passing a dependency array.' }
      ]
    },
    'deck-4': {
      id: 'deck-4',
      title: 'World Capitals',
      category: 'Geography',
      cards: [
        { id: 'card-8', question: 'What is the capital of Japan?', answer: 'Tokyo' },
        { id: 'card-9', question: 'What is the capital of Brazil?', answer: 'Brasília' }
      ]
    }
  };
}

// Load on startup
let decks = loadDecks();

// Deck Routes 
app.get('/api/decks', (req, res) => {
  const deckList = Object.values(decks).map(d => ({
    id: d.id,
    title: d.title,
    category: d.category || '',
    cardCount: d.cards.length
  }));
  res.json(deckList);
});

app.post('/api/decks', (req, res) => {
  const { title, category } = req.body;

  // 1. Check if the raw input exists
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // 2. Sanitize the inputs
  // This strips out <script>, <iframe>, and malicious attributes like 'onerror'
  const cleanTitle = DOMPurify.sanitize(title.trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });
  const cleanCategory = DOMPurify.sanitize((category || '').trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });

  // 3. Optional: Check if sanitization stripped EVERYTHING 
  // (e.g., if the user submitted ONLY a <script> tag)
  if (!cleanTitle) {
    return res.status(400).json({ error: 'Invalid title content' });
  }

  const id = 'deck-' + uuidv4();
  
  // 4. Save the cleaned versions
  decks[id] = { 
    id, 
    title: cleanTitle, 
    category: cleanCategory, 
    cards: [] 
  };

  saveDecks();
  res.status(201).json(decks[id]);
});

app.get('/api/decks/:deckId', (req, res) => {
  const deck = decks[req.params.deckId];
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  res.json(deck);
});

app.put('/api/decks/:deckId', (req, res) => {
  const deck = decks[req.params.deckId];
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  const { title, category } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  deck.title = DOMPurify.sanitize(title.trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });
  deck.category = DOMPurify.sanitize((category || '').trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });
  saveDecks();
  res.json(deck);
});

app.delete('/api/decks/:deckId', (req, res) => {
  if (!decks[req.params.deckId]) return res.status(404).json({ error: 'Deck not found' });
  delete decks[req.params.deckId];
  saveDecks();
  res.json({ success: true });
});

//  Card Routes 
app.get('/api/decks/:deckId/cards', (req, res) => {
  const deck = decks[req.params.deckId];
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  res.json(deck.cards);
});

app.post('/api/decks/:deckId/cards', (req, res) => {
  const deck = decks[req.params.deckId];
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });

  // 1. Sanitize the inputs before they touch your data object
  const cleanQuestion = DOMPurify.sanitize(question.trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });
  const cleanAnswer = DOMPurify.sanitize(answer.trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });

  if (!cleanQuestion || !cleanAnswer) {
  return res.status(400).json({ error: 'Valid question and answer required' });
  }


  // 2. Use the cleaned versions for the new card
  const card = { 
    id: 'card-' + uuidv4(), 
    question: cleanQuestion, 
    answer: cleanAnswer 
  };

  deck.cards.push(card);
  saveDecks();
  res.status(201).json(card);
});


app.put('/api/decks/:deckId/cards/:cardId', (req, res) => {
  const deck = decks[req.params.deckId];
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  const card = deck.cards.find(c => c.id === req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
  card.question = DOMPurify.sanitize(question.trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });
  card.answer = DOMPurify.sanitize(answer.trim(), { FORBID_TAGS: ['style', 'script', 'iframe'] });
  saveDecks();
  res.json(card);
});

app.delete('/api/decks/:deckId/cards/:cardId', (req, res) => {
  const deck = decks[req.params.deckId];
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  const idx = deck.cards.findIndex(c => c.id === req.params.cardId);
  if (idx === -1) return res.status(404).json({ error: 'Card not found' });
  deck.cards.splice(idx, 1);
  saveDecks();
  res.json({ success: true });
});


// This works in Node.js ES Modules to see if this file was run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Flashcard app running at http://localhost:${PORT}`));
}


export default app;
