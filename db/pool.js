import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new pg.Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "flashcards_db",
  password: String(process.env.DB_PASSWORD || "postgres"),
  port: process.env.DB_PORT || 5432,
});

export default pool;