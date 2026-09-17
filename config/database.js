const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
  if (err) {
    console.error("Erreur de connexion à PostgreSQL :", err);
  } else {
    console.log("Base de données PostgreSQL connectée avec succès.");
  }
});

module.exports = db; 
