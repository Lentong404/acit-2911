import pool from "./pool.js";

try {
  const result = await pool.query("SELECT NOW()");
  console.log("connected to PostgreSQL");
  console.log(result.rows[0]);
} catch (err) {
  console.error("database connection failed");
  console.error(err);
} finally {
  await pool.end();
}
