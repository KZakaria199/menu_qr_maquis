const db = require("./database");

// 1. TABLE DES PATRONS
db.run(`
    CREATE TABLE IF NOT EXISTS patrons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        telephone TEXT,
        email TEXT UNIQUE,
        mot_de_passe TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// 2. TABLE DES MAQUIS
db.run(`
    CREATE TABLE IF NOT EXISTS maquis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patron_id INTEGER NOT NULL,
        nom TEXT NOT NULL,
        logo TEXT,
        telephone TEXT,
        adresse TEXT,
        horaires TEXT,
        actif INTEGER DEFAULT 1,
        FOREIGN KEY (patron_id) REFERENCES patrons(id)
    )
`);

// 3. TABLE DES CATÉGORIES
db.run(`
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        maquis_id INTEGER NOT NULL,
        nom TEXT NOT NULL,
        FOREIGN KEY (maquis_id) REFERENCES maquis(id)
    )
`);

// 4. TABLE DES PRODUITS
db.run(`
    CREATE TABLE IF NOT EXISTS produits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        maquis_id INTEGER NOT NULL,
        categorie_id INTEGER,
        nom TEXT NOT NULL,
        description TEXT,
        prix INTEGER NOT NULL,
        photo TEXT,
        disponible INTEGER DEFAULT 1,
        FOREIGN KEY (maquis_id) REFERENCES maquis(id),
        FOREIGN KEY (categorie_id) REFERENCES categories(id)
    )
`);

// 5. TABLE DES TABLES DU MAQUIS
db.run(`
    CREATE TABLE IF NOT EXISTS tables_maquis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        maquis_id INTEGER NOT NULL,
        numero INTEGER NOT NULL,
        qr_code TEXT,
        actif INTEGER DEFAULT 1,
        FOREIGN KEY (maquis_id) REFERENCES maquis(id)
    )
`);

// 6. TABLE DES COMMANDES
db.run(`
    CREATE TABLE IF NOT EXISTS commandes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        maquis_id INTEGER NOT NULL,
        table_id INTEGER,
        total INTEGER DEFAULT 0,
        statut TEXT DEFAULT 'nouvelle',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (maquis_id) REFERENCES maquis(id),
        FOREIGN KEY (table_id) REFERENCES tables_maquis(id)
    )
`);

// 7. PRODUITS D'UNE COMMANDE
db.run(`
    CREATE TABLE IF NOT EXISTS commande_produits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commande_id INTEGER NOT NULL,
        produit_id INTEGER NOT NULL,
        quantite INTEGER NOT NULL,
        prix INTEGER NOT NULL,
        FOREIGN KEY (commande_id) REFERENCES commandes(id),
        FOREIGN KEY (produit_id) REFERENCES produits(id)
    )
`);

// 8. ABONNEMENTS
db.run(`
    CREATE TABLE IF NOT EXISTS abonnements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        maquis_id INTEGER NOT NULL,
        date_debut DATE NOT NULL,
        date_fin DATE NOT NULL,
        statut TEXT DEFAULT 'actif',
        FOREIGN KEY (maquis_id) REFERENCES maquis(id)
    )
`);
// 9. TABLE DU SUPER ADMIN
db.run(`
    CREATE TABLE IF NOT EXISTS super_admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        mot_de_passe TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`); 
db.run(`
    CREATE TABLE IF NOT EXISTS commande_produits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commande_id INTEGER NOT NULL,
        produit_id INTEGER,
        nom TEXT NOT NULL,
        prix REAL NOT NULL,
        quantite INTEGER NOT NULL DEFAULT 1
    )
`); 

console.log("Les tables ont été créées avec succès."); 