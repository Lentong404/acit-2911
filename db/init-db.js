import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf-8");

try {
  await pool.query(schema);
  console.log("database tables created!!");
} catch (err) {
  console.error("failed to create database tables");
  console.error(err);
  process.exit(1);
} finally {
  await pool.end();
}