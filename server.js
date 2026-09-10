const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const QRCode = require("qrcode");
const db = require("./config/database");
const multer =require("multer");
const app = express();
const upload = multer({
    dest: path.join(__dirname, "images")
}); 

const BASE_URL = process.env.BASE_URL || "https://menu-qr-maquis-4.onrender.com"; 
// Lire les données envoyées par les formulaires
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Gestion des sessions
app.use(
    session({
        secret: "MENU_MAQUIS_SECRET_2026",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

// Fichiers publics
app.use(express.static(path.join(__dirname, "public")));

// Page d'accueil
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "menu.html"));
});
app.get("/", (req, res) => {
    res.redirect("/menu/menu.html");
}); 

// Page connexion Super Admin
app.get("/admin/login", (req, res) => {
    res.sendFile(path.join(__dirname, "admin", "login.html"));
});

// Connexion Super Admin
app.post("/admin/login", (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send("Email et mot de passe obligatoires.");
    }

    db.get(
        "SELECT * FROM super_admin WHERE email = ?",
        [email],
        (err, admin) => {

            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur.");
            }

            if (!admin) {
                return res.status(401).send("Email ou mot de passe incorrect.");
            }

            bcrypt.compare(password, admin.mot_de_passe, (err, resultat) => {

                if (err) {
                    console.error(err);
                    return res.status(500).send("Erreur serveur.");
                }

                if (!resultat) {
                    return res.status(401).send("Email ou mot de passe incorrect.");
                }

                req.session.adminId = admin.id;
                req.session.adminNom = admin.nom;

                res.redirect("/admin/dashboard");
            });
        }
    );
});

// Tableau de bord protégé
app.get("/admin/dashboard", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(__dirname, "admin", "dashboard.html")
    );
}); 
// Gestion des patrons
app.get("/admin/patrons", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(__dirname, "admin", "patrons.html")
    );
}); 
// Liste des patrons
app.get("/admin/patrons/liste", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(`
        SELECT
            patrons.id,
            patrons.nom,
            patrons.telephone,
            patrons.email,
            patrons.whatsapp_actif,
            maquis.id AS maquis_id,
            maquis.nom AS nom_maquis,
            maquis.actif
        FROM patrons
        LEFT JOIN maquis
            ON maquis.patron_id = patrons.id
        ORDER BY patrons.id DESC
    `, (err, rows) => {

        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Erreur lors de la récupération des patrons"
            });
        }

        res.json(rows);
    });
}); 

// Ajouter un patron et son maquis
app.post("/admin/patrons", async (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).send("Non autorisé.");
    }

    const {
        nomPatron,
        nomMaquis,
        telephone,
        email,
        motDePasse,
        adresse,
        horaires
    } = req.body;

    if (!nomPatron || !nomMaquis || !telephone || !email || !motDePasse) {
        return res.status(400).send("Veuillez remplir tous les champs obligatoires.");
    }

    try {

        const hash = await bcrypt.hash(motDePasse, 10);

        db.run(
            `INSERT INTO patrons
            (nom, telephone, email, mot_de_passe)
            VALUES (?, ?, ?, ?)`,
            [nomPatron, telephone, email, hash],
            function (err) {

                if (err) {
                    console.error(err);

                    if (err.message.includes("UNIQUE")) {
                        return res.status(400).send("Cet email existe déjà.");
                    }

                    return res.status(500).send("Erreur lors de la création du patron.");
                }

                const patronId = this.lastID;

                db.run(
                    `INSERT INTO maquis
                    (patron_id, nom, telephone, adresse, horaires)
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        patronId,
                        nomMaquis,
                        telephone,
                        adresse || "",
                        horaires || ""
                    ],
                    function (err) {

                        if (err) {
                            console.error(err);
                            return res.status(500).send(
                                "Patron créé, mais erreur lors de la création du maquis."
                            );
                        }

                        res.redirect("/admin/patrons");
                    }
                );
            }
        );

    } catch (error) {
        console.error(error);
        res.status(500).send("Erreur serveur.");
    }
}); 
// Suspendre ou réactiver un maquis
app.post("/admin/patrons/:id/statut", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const patronId = req.params.id;

    db.get(
        `SELECT actif FROM maquis WHERE patron_id = ?`,
        [patronId],
        (err, maquis) => {

            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            if (!maquis) {
                return res.status(404).json({
                    error: "Maquis introuvable"
                });
            }

            const nouveauStatut = maquis.actif ? 0 : 1;

            db.run(
                `UPDATE maquis SET actif = ? WHERE patron_id = ?`,
                [nouveauStatut, patronId],
                (err) => {

                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Impossible de modifier le statut"
                        });
                    }

                    res.json({
                        success: true,
                        actif: nouveauStatut
                    });
                }
            );
        }
    );
}); 
// Récupérer les informations d'un patron
app.get("/admin/patrons/:id", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const patronId = req.params.id;

    db.get(`
        SELECT
            patrons.id,
            patrons.nom,
            patrons.telephone,
            patrons.email,
            maquis.id AS maquis_id,
            maquis.nom AS nom_maquis,
            maquis.adresse,
            maquis.horaires
        FROM patrons
        LEFT JOIN maquis
            ON maquis.patron_id = patrons.id
        WHERE patrons.id = ?
    `, [patronId], (err, patron) => {

        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Erreur lors de la récupération du patron"
            });
        }

        if (!patron) {
            return res.status(404).json({
                error: "Patron introuvable"
            });
        }

        res.json(patron);
    });
});

// ===============================
// SUPPRIMER UN PRODUIT
// ===============================

app.delete("/patron/produits/:id", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const produitId = req.params.id;

    db.run(
        `DELETE FROM produits
         WHERE id = ? AND maquis_id = ?`,
        [produitId, req.session.maquisId],
        function(err) {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur lors de la suppression."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Produit introuvable."
                });
            }

            res.json({
                success: true,
                message: "Produit supprimé avec succès."
            });
        }
    );
}); 
// ===============================
// CHANGER LA DISPONIBILITÉ
// ===============================

app.put("/patron/produits/:id/disponibilite", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const produitId = req.params.id;

    db.run(
        `UPDATE produits
         SET disponible = CASE
             WHEN disponible = 1 THEN 0
             ELSE 1
         END
         WHERE id = ? AND maquis_id = ?`,
        [produitId, req.session.maquisId],
        function(err) {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur lors du changement."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Produit introuvable."
                });
            }

            db.get(
                `SELECT disponible
                 FROM produits
                 WHERE id = ? AND maquis_id = ?`,
                [produitId, req.session.maquisId],
                (err, produit) => {

                    if (err || !produit) {
                        return res.status(500).json({
                            error: "Erreur serveur."
                        });
                    }

                    res.json({
                        success: true,
                        disponible: produit.disponible
                    });
                }
            );
        }
    );
}); 

// Modifier les informations d'un patron
app.put("/admin/patrons/:id", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const patronId = req.params.id;

    const {
        nom,
        telephone,
        email,
        nom_maquis,
        adresse,
        horaires
    } = req.body;

    if (!nom || !email || !nom_maquis) {
        return res.status(400).json({
            error: "Nom, email et nom du maquis sont obligatoires."
        });
    }

    db.run(`
        UPDATE patrons
        SET nom = ?, telephone = ?, email = ?
        WHERE id = ?
    `, [
        nom,
        telephone,
        email,
        patronId
    ], function(err) {

        if (err) {
            console.error(err);

            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({
                    error: "Cet email est déjà utilisé."
                });
            }

            return res.status(500).json({
                error: "Erreur lors de la modification du patron."
            });
        }

        db.run(`
            UPDATE maquis
            SET nom = ?, telephone = ?, adresse = ?, horaires = ?
            WHERE patron_id = ?
        `, [
            nom_maquis,
            telephone,
            adresse || "",
            horaires || "",
            patronId
        ], function(err) {

            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Patron modifié, mais erreur avec le maquis."
                });
            }

            res.json({
                success: true,
                message: "Patron modifié avec succès."
            });
        });
    });
}); 

// ===================================
// ADMIN - ACTIVER UN ABONNEMENT
// ===================================

app.post(
    "/admin/maquis/:id/abonnement",
    (req, res) => {

        const maquisId =
            req.params.id;

        const jours =
            Number(req.body.jours);


        // Vérifier la durée
        if (
            ![30, 90, 365].includes(jours)
        ) {

            return res.status(400).json({
                error:
                    "Durée d'abonnement invalide"
            });

        }


        // Calcul de la date de fin
        const dateFin =
            new Date();

        dateFin.setDate(
            dateFin.getDate() + jours
        );


        db.run(`
            UPDATE maquis
            SET
                abonnement_fin = ?,
                abonnement_jours = ?,
                actif = 1
            WHERE id = ?
        `,
        [
            dateFin.toISOString(),
            jours,
            maquisId
        ],
        function (err) {

            if (err) {

                return res.status(500).json({
                    error: err.message
                });

            }


            if (
                this.changes === 0
            ) {

                return res.status(404).json({
                    error:
                        "Maquis introuvable"
                });

            }


            res.json({
                success: true,
                message:
                    "Abonnement activé avec succès",
                abonnement_fin:
                    dateFin.toISOString()
            });

        });

    }
); 

// ===================================
// ADMIN - ACTIVER UN ABONNEMENT
// ===================================

app.post(
    "/admin/maquis/:id/abonnement",
    (req, res) => {

        if (!req.session.adminId) {
            return res.status(401).json({
                error: "Non autorisé"
            });
        }

        const maquisId =
            req.params.id;

        const jours =
            Number(req.body.jours);


        if (
            ![30, 90, 365].includes(jours)
        ) {

            return res.status(400).json({
                error:
                    "Durée d'abonnement invalide"
            });

        }


        const maintenant =
            new Date();


        let dateFin =
            new Date();


        dateFin.setDate(
            dateFin.getDate() +
            jours
        );


        db.run(
            `
            UPDATE maquis
            SET
                abonnement_fin = ?,
                abonnement_jours = ?,
                actif = 1
            WHERE id = ?
            `,
            [
                dateFin.toISOString(),
                jours,
                maquisId
            ],

            function(err) {

                if (err) {

                    console.error(
                        "Erreur abonnement :",
                        err.message
                    );

                    return res.status(500).json({
                        error: err.message
                    });

                }


                if (
                    this.changes === 0
                ) {

                    return res.status(404).json({
                        error:
                            "Maquis introuvable"
                    });

                }


                res.json({

                    success: true,

                    message:
                        "Abonnement activé avec succès",

                    abonnement_fin:
                        dateFin.toISOString(),

                    jours:
                        jours

                });

            }
        );

    }
); 

// ===============================
// AJOUTER UN ABONNEMENT
// ===============================
app.post("/admin/patrons/:id/abonnement", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({ error: "Non autorisé" });
    }

    const patronId = req.params.id;
    const duree = parseInt(req.body.duree);

    if (![30, 90, 365].includes(duree)) {
        return res.status(400).json({
            error: "Durée d'abonnement invalide."
        });
    }

    db.get(
        `SELECT id FROM maquis WHERE patron_id = ?`,
        [patronId],
        (err, maquis) => {

            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Erreur serveur" });
            }

            if (!maquis) {
                return res.status(404).json({
                    error: "Maquis introuvable."
                });
            }

            const dateDebut = new Date();
            const dateFin = new Date();

            dateFin.setDate(dateFin.getDate() + duree);

            const debut = dateDebut.toISOString().slice(0, 10);
            const fin = dateFin.toISOString().slice(0, 10);

            db.run(
                `INSERT INTO abonnements
                (maquis_id, date_debut, date_fin, statut)
                VALUES (?, ?, ?, 'actif')`,
                [maquis.id, debut, fin],
                err => {

                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Erreur lors de la création de l'abonnement."
                        });
                    }

                    // Réactiver automatiquement le maquis
                    db.run(
                        `UPDATE maquis SET actif = 1 WHERE id = ?`,
                        [maquis.id],
                        err => {

                            if (err) {
                                console.error(err);
                                return res.status(500).json({
                                    error: "Abonnement créé mais impossible de réactiver le maquis."
                                });
                            }

                            res.json({
                                success: true,
                                date_debut: debut,
                                date_fin: fin
                            });
                        }
                    );
                }
            );
        }
    );
});


// ===============================
// VOIR L'ABONNEMENT ACTUEL
// ===============================
app.get("/admin/patrons/:id/abonnement", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({ error: "Non autorisé" });
    }

    const patronId = req.params.id;

    db.get(`
        SELECT
            abonnements.id,
            abonnements.date_debut,
            abonnements.date_fin,
            abonnements.statut
        FROM abonnements
        JOIN maquis
            ON maquis.id = abonnements.maquis_id
        WHERE maquis.patron_id = ?
        ORDER BY abonnements.id DESC
        LIMIT 1
    `, [patronId], (err, abonnement) => {

        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Erreur serveur"
            });
        }

        res.json(abonnement || null);
    });
}); 
 
// ===============================
// PAGE DE CONNEXION DU PATRON
// ===============================

app.get("/patron/login", (req, res) => {
    res.sendFile(
        path.join(__dirname, "patron", "login.html")
    );
}); 

app.post("/patron/login", (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: "Email et mot de passe obligatoires."
        });
    }

    db.get(
        `SELECT * FROM patrons WHERE email = ?`,
        [email],
        (err, patron) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur."
                });
            }

            if (!patron) {
                return res.status(401).json({
                    error: "Email ou mot de passe incorrect."
                });
            }
console.log("PATRON TROUVÉ :", patron.email);
console.log("HASH :", patron.mot_de_passe); 
            bcrypt.compare(
                password,
                patron.mot_de_passe,
                (err, resultat) => {

                    if (err) {
                        console.error(err);

                        return res.status(500).json({
                            error: "Erreur serveur."
                        });
                    }

                    if (!resultat) {
                        return res.status(401).json({
                            error: "Email ou mot de passe incorrect."
                        });
                    }

                    // Chercher le maquis du patron
                    db.get(
                        `SELECT * FROM maquis WHERE patron_id = ?`,
                        [patron.id],
                        (err, maquis) => {

                            if (err) {
                                console.error(err);

                                return res.status(500).json({
                                    error: "Erreur serveur."
                                });
                            }

                            if (!maquis) {
                                return res.status(400).json({
                                    error: "Aucun maquis associé à ce patron."
                                });
                            }

                            // Créer la session du patron
                            req.session.patronId = patron.id;
                            req.session.patronNom = patron.nom;
                            req.session.maquisId = maquis.id;

                            // UNE SEULE réponse
                            req.session.patronId = patron.id;
req.session.patronNom = patron.nom;
req.session.maquisId = maquis.id;

req.session.save((err) => {
    if (err) {
        console.error("Erreur session :", err);

        return res.status(500).json({
            error: "Impossible de créer la session."
        });
    }

    return res.json({
        success: true
    });
}); 

                        }
                    );
                }
            );
        }
    );
}); 
// ===============================
// DASHBOARD PATRON
// ===============================

app.get("/patron/dashboard", (req, res) => {

    if (!req.session.patronId) {
        return res.redirect("/patron/login");
    }

    res.sendFile(
        path.join(__dirname, "patron", "dashboard.html")
    );
}); 
app.get("/patron/dashboard-data", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const patronId = req.session.patronId;

    db.get(
        `SELECT id, nom, telephone, email
         FROM patrons
         WHERE id = ?`,
        [patronId],
        (err, patron) => {

            if (err || !patron) {
                return res.status(500).json({
                    error: "Patron introuvable"
                });
            }

            db.get(
                `SELECT *
                 FROM maquis
                 WHERE patron_id = ?`,
                [patronId],
                (err, maquis) => {

                    if (err || !maquis) {
                        return res.status(404).json({
                            error: "Maquis introuvable"
                        });
                    }

                    db.get(
                        `SELECT *
                         FROM abonnements
                         WHERE maquis_id = ?
                         ORDER BY id DESC
                         LIMIT 1`,
                        [maquis.id],
                        (err, abonnement) => {

                            if (err) {
                                abonnement = null;
                            }

                            db.get(
                                `SELECT COUNT(*) AS total
                                 FROM produits
                                 WHERE maquis_id = ?`,
                                [maquis.id],
                                (err, produits) => {

                                    const totalProduits =
                                        produits ? produits.total : 0;

                                    db.get(
                                        `SELECT COUNT(*) AS total
                                         FROM commandes
                                         WHERE maquis_id = ?`,
                                        [maquis.id],
                                        (err, commandes) => {

                                            const totalCommandes =
                                                commandes
                                                    ? commandes.total
                                                    : 0;

                                            res.json({
                                                patron: patron,
                                                maquis: maquis,
                                                abonnement: abonnement,
                                                produits: totalProduits,
                                                commandes: totalCommandes
                                            });

                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}); 
app.get("/patron/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.error(err);
        }

        res.redirect("/patron/login");
    });

}); 
app.get("/patron/categories", (req, res) => {

    if (!req.session.patronId) {
        return res.redirect("/patron/login");
    }

    res.sendFile(
        path.join(__dirname, "patron", "categories.html")
    );
});


app.get("/patron/categories/liste", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `SELECT * FROM categories
         WHERE maquis_id = ?
         ORDER BY id DESC`,
        [req.session.maquisId],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            res.json(rows);
        }
    );
});
// ===============================
// MODIFIER UNE CATÉGORIE
// ===============================

app.put("/patron/categories/:id", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const id = req.params.id;
    const { nom } = req.body;

    if (!nom || !nom.trim()) {
        return res.status(400).json({
            error: "Nom obligatoire."
        });
    }

    db.run(
        `UPDATE categories
         SET nom = ?
         WHERE id = ? AND maquis_id = ?`,
        [
            nom.trim(),
            id,
            req.session.maquisId
        ],
        function(err) {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur lors de la modification."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Catégorie introuvable."
                });
            }

            res.json({
                success: true,
                message: "Catégorie modifiée avec succès."
            });
        }
    );
});


// ===============================
// SUPPRIMER UNE CATÉGORIE
// ===============================

app.delete("/patron/categories/:id", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const id = req.params.id;

    db.get(
        `SELECT COUNT(*) AS total
         FROM produits
         WHERE categorie_id = ?
         AND maquis_id = ?`,
        [id, req.session.maquisId],
        (err, resultat) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur."
                });
            }

            if (resultat.total > 0) {
                return res.status(400).json({
                    error: "Impossible de supprimer cette catégorie : des produits y sont encore associés."
                });
            }

            db.run(
                `DELETE FROM categories
                 WHERE id = ? AND maquis_id = ?`,
                [id, req.session.maquisId],
                function(err) {

                    if (err) {
                        console.error(err);

                        return res.status(500).json({
                            error: "Erreur lors de la suppression."
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            error: "Catégorie introuvable."
                        });
                    }

                    res.json({
                        success: true,
                        message: "Catégorie supprimée."
                    });
                }
            );
        }
    );
}); 


app.post("/patron/categories", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const { nom } = req.body;

    if (!nom) {
        return res.status(400).json({
            error: "Nom obligatoire"
        });
    }

    db.run(
        `INSERT INTO categories (maquis_id, nom)
         VALUES (?, ?)`,
        [req.session.maquisId, nom],
        function(err) {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur lors de la création"
                });
            }

            res.json({
                success: true,
                id: this.lastID
            });
        }
    );
}); 
app.get("/patron/produits", (req, res) => {

    if (!req.session.patronId) {
        return res.redirect("/patron/login");
    }

    res.sendFile(
        path.join(__dirname, "patron", "produits.html")
    );
});
app.post("/patron/produits/ajouter", (req, res)=> {
const {
        nom,
        categorie_id,
        prix,
        description
    } = req.body;

    if (!nom || !categorie_id || !prix) {
        return res.status(400).json({
            error: "Nom, catégorie et prix obligatoires"
        });
    }

    db.run(
        `INSERT INTO produits
        (maquis_id, categorie_id, nom, description, prix)
        VALUES (?, ?, ?, ?, ?)`,
        [
            req.session.maquisId,
            categorie_id,
            nom,
            description || "",
            prix
        ],
        function(err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    error: "Erreur lors de l'ajout du produit"
                });
            }

            res.json({
                success: true,
                id: this.lastID
            });

        }
    );

}); 

// ===============================
// AJOUTER UN PRODUIT AVEC PHOTO
// ===============================

app.post("/patron/produits", upload.single("photo"), (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const {
        nom,
        categorie_id,
        prix,
        description
    } = req.body;

    if (!nom || !categorie_id || !prix) {
        return res.status(400).json({
            error: "Nom, catégorie et prix sont obligatoires."
        });
    }

    // Vérifier la catégorie
    db.get(
        `SELECT id
         FROM categories
         WHERE id = ? AND maquis_id = ?`,
        [categorie_id, req.session.maquisId],
        (err, categorie) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur."
                });
            }

            if (!categorie) {
                return res.status(400).json({
                    error: "Catégorie invalide."
                });
            }

            // Nom du fichier photo
            const photo = req.file
                ? "/images/" + req.file.filename
                : "";

            db.run(
                `INSERT INTO produits
                (maquis_id, categorie_id, nom, description, prix, photo, disponible)
                VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [
                    req.session.maquisId,
                    categorie_id,
                    nom,
                    description || "",
                    prix,
                    photo
                ],
                function(err) {

                    if (err) {
                        console.error(err);

                        return res.status(500).json({
                            error: "Erreur lors de l'ajout du produit."
                        });
                    }

                    res.json({
                        success: true,
                        id: this.lastID,
                        photo: photo,
                        message: "Produit ajouté avec succès."
                    });
                }
            );
        }
    );
}); 

// ===============================
// MODIFIER LE STATUT D'UNE COMMANDE
// ===============================

app.put("/patron/commandes/:id/statut", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const commandeId = req.params.id;

    const { statut } = req.body;


    // Statuts autorisés
    const statutsAutorises = [
        "nouvelle",
        "preparation",
        "prete",
        "servie",
        "annulee"
    ];


    if (!statut) {
        return res.status(400).json({
            error: "Statut obligatoire."
        });
    }


    if (!statutsAutorises.includes(statut)) {
        return res.status(400).json({
            error: "Statut invalide."
        });
    }


    db.run(
        `
        UPDATE commandes

        SET statut = ?

        WHERE id = ?
        AND maquis_id = ?
        `,
        [
            statut,
            commandeId,
            req.session.maquisId
        ],

        function(err) {

            if (err) {

                console.error(
                    "Erreur modification statut :",
                    err.message
                );

                return res.status(500).json({
                    error: err.message
                });

            }


            if (this.changes === 0) {

                return res.status(404).json({
                    error: "Commande introuvable."
                });

            }


            return res.json({
                success: true,
                message: "Statut modifié avec succès.",
                statut: statut
            });

        }

    );

}); 


// ===============================
// MODIFIER UN PRODUIT AVEC PHOTO
// ===============================

app.put(
    "/patron/produits/:id",
    upload.single("photo"),
    (req, res) => {

        if (!req.session.patronId) {
            return res.status(401).json({
                error: "Non autorisé"
            });
        }

        const produitId = req.params.id;

        const {
            nom,
            categorie_id,
            prix,
            description
        } = req.body;

        if (!nom || !categorie_id || !prix) {
            return res.status(400).json({
                error: "Nom, catégorie et prix sont obligatoires."
            });
        }

        // Vérifier le produit
        db.get(
            `SELECT *
             FROM produits
             WHERE id = ? AND maquis_id = ?`,
            [produitId, req.session.maquisId],
            (err, produit) => {

                if (err) {
                    console.error(err);

                    return res.status(500).json({
                        error: "Erreur serveur."
                    });
                }

                if (!produit) {
                    return res.status(404).json({
                        error: "Produit introuvable."
                    });
                }

                // Vérifier la catégorie
                db.get(
                    `SELECT id
                     FROM categories
                     WHERE id = ? AND maquis_id = ?`,
                    [categorie_id, req.session.maquisId],
                    (err, categorie) => {

                        if (err) {
                            console.error(err);

                            return res.status(500).json({
                                error: "Erreur serveur."
                            });
                        }

                        if (!categorie) {
                            return res.status(400).json({
                                error: "Catégorie invalide."
                            });
                        }

                        // Si nouvelle photo
                        let photo = produit.photo;

                        if (req.file) {
                            photo = "/images/" + req.file.filename;
                        }

                        db.run(
                            `UPDATE produits
                             SET nom = ?,
                                 categorie_id = ?,
                                 prix = ?,
                                 description = ?,
                                 photo = ?
                             WHERE id = ?
                             AND maquis_id = ?`,
                            [
                                nom,
                                categorie_id,
                                prix,
                                description || "",
                                photo,
                                produitId,
                                req.session.maquisId
                            ],
                            function(err) {

                                if (err) {
                                    console.error(err);

                                    return res.status(500).json({
                                        error: "Erreur lors de la modification."
                                    });
                                }

                                res.json({
                                    success: true,
                                    message: "Produit modifié avec succès.",
                                    photo: photo
                                });

                            }
                        );

                    }
                );

            }
        );

    }
); 

app.get("/patron/produits/liste", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `SELECT * FROM produits
         WHERE maquis_id = ?
         ORDER BY id DESC`,
        [req.session.maquisId],
        (err, rows) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            res.json(rows);
        }
    );
}); 
app.get("/patron/tables", (req, res) => {

    if (!req.session.patronId) {
        return res.redirect("/patron/login");
    }

    res.sendFile(
        path.join(__dirname, "patron", "tables.html")
    );
});


app.get("/patron/tables/liste", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `SELECT * FROM tables_maquis
         WHERE maquis_id = ?
         ORDER BY numero ASC`,
        [req.session.maquisId],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            res.json(rows);
        }
    );
});


app.post("/patron/tables", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const { numero } = req.body;

    db.run(
        `INSERT INTO tables_maquis
         (maquis_id, numero)
         VALUES (?, ?)`,
        [req.session.maquisId, numero],
        function(err) {

            if (err) {
                return res.status(500).json({
                    error: "Erreur lors de l'ajout"
                });
            }

            res.json({
                success: true,
                id: this.lastID
            });
        }
    );
});

 // ===============================
// SUPPRIMER UNE TABLE
// ===============================

app.delete("/patron/tables/:id", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const tableId = req.params.id;

    db.run(
        `DELETE FROM tables_maquis
         WHERE id = ? AND maquis_id = ?`,
        [tableId, req.session.maquisId],
        function(err) {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur lors de la suppression."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Table introuvable."
                });
            }

            res.json({
                success: true,
                message: "Table supprimée."
            });
        }
    );
}); 

// ===============================
// ACTIVER / DÉSACTIVER UNE TABLE
// ===============================

app.put("/patron/tables/:id/statut", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const tableId = req.params.id;

    db.run(
        `UPDATE tables_maquis
         SET actif = CASE
             WHEN actif = 1 THEN 0
             ELSE 1
         END
         WHERE id = ? AND maquis_id = ?`,
        [tableId, req.session.maquisId],
        function(err) {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Table introuvable."
                });
            }

            res.json({
                success: true,
                message: "Statut de la table modifié."
            });
        }
    );
}); 

app.post("/patron/tables/:id/qr", async (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const tableId = req.params.id;

    db.get(
        `SELECT * FROM tables_maquis
         WHERE id = ? AND maquis_id = ?`,
        [tableId, req.session.maquisId],
        async (err, table) => {

            if (err || !table) {
                return res.status(404).json({
                    error: "Table introuvable"
                });
            }

           const urlMenu =
    `${BASE_URL}/menu?table=${table.numero}&maquis=${table.maquis_id}`;
            try {

                const qr = await QRCode.toDataURL(lien);

                db.run(
                    `UPDATE tables_maquis
                     SET qr_code = ?
                     WHERE id = ?`,
                    [qr, tableId],
                    err => {

                        if (err) {
                            return res.status(500).json({
                                error: "Erreur QR"
                            });
                        }

                        res.json({
                            success: true,
                            qr_code: qr
                        });

                    }
                );

            } catch (error) {

                res.status(500).json({
                    error: "Impossible de créer le QR"
                });

            }
        }
    );
}); 
app.get("/patron/commandes", (req, res) => {

    if (!req.session.patronId) {
        return res.redirect("/patron/login");
    }

    res.sendFile(
        path.join(__dirname, "patron", "commandes.html")
    );
});

// ===============================
// LISTE DES COMMANDES DU PATRON
// AVEC LES PRODUITS
// ===============================

app.get("/patron/commandes/liste", (req, res) => {

    if (!req.session.patronId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }


    db.all(
        `
        SELECT
            commandes.id,
            commandes.maquis_id,
            commandes.table_id,
            commandes.total,
            commandes.statut,
            commandes.created_at,

            tables_maquis.numero AS numero_table

        FROM commandes

        LEFT JOIN tables_maquis
            ON commandes.table_id = tables_maquis.id

        WHERE commandes.maquis_id = ?

        ORDER BY commandes.id DESC
        `,
        [req.session.maquisId],

        (err, commandes) => {

            if (err) {

                console.error(
                    "Erreur commandes :",
                    err.message
                );

                return res.status(500).json({
                    error: err.message
                });

            }


            if (commandes.length === 0) {
                return res.json([]);
            }


            let commandesRestantes =
                commandes.length;

            let erreurEnvoyee =
                false;


            commandes.forEach(commande => {


                db.all(
                    `
                    SELECT
                        id,
                        commande_id,
                        produit_id,
                        nom,
                        prix,
                        quantite

                    FROM commande_produits

                    WHERE commande_id = ?

                    ORDER BY id ASC
                    `,
                    [commande.id],

                    (err, produits) => {

                        if (erreurEnvoyee) {
                            return;
                        }


                        if (err) {

                            erreurEnvoyee = true;

                            console.error(
                                "Erreur produits :",
                                err.message
                            );

                            return res.status(500).json({
                                error: err.message
                            });

                        }


                        // Ajouter les produits
                        // directement dans la commande
                        commande.produits =
                            produits;


                        commandesRestantes--;


                        // Lorsque toutes les commandes
                        // ont reçu leurs produits
                        if (commandesRestantes === 0) {

                            return res.json(
                                commandes
                            );

                        }

                    }

                );


            });

        }

    );

}); 


app.get("/menu", (req, res) => {

    res.sendFile(
        path.join(__dirname, "menu.html")
    );

}); 
app.get("/menu/produits", (req, res) => {

    const numeroTable = req.query.table;
const maquisId = req.query.maquis;
    if (!numeroTable) {
        return res.status(400).json({
            error: "Table non précisée."
        });
    }

    db.get(
        `SELECT
            tables_maquis.id,
            tables_maquis.numero,
            maquis.id AS maquis_id,
            maquis.nom,
            maquis.actif,
            maquis.abonnement_fin
        
         FROM tables_maquis
         JOIN maquis
            ON maquis.id = tables_maquis.maquis_id
         WHERE tables_maquis.numero = ?
AND tables_maquis.maquis_id = ?`,
[numeroTable, maquisId],
        (err, table) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur."
                });
            }

            if (!table) {
                return res.status(404).json({
                    error: "Table introuvable."
                });
            }

            if (!table.actif) {
                return res.status(403).json({
                    error: "Ce maquis est actuellement suspendu."
                });
            }
// Vérifier l'abonnement

if (!table.abonnement_fin) {

    return res.status(403).json({
        error:
        "Ce maquis n'a pas d'abonnement actif."
    });

}


const dateFin =
new Date(
    table.abonnement_fin
);


if (
    dateFin <
    new Date()
) {

    return res.status(403).json({
        error:
        "L'abonnement de ce maquis a expiré."
    });

} 

            db.all(
                `SELECT
                    id,
                    nom,
                    categorie_id,
                    prix,
                    description,
                    photo,
                    disponible
                 FROM produits
                 WHERE maquis_id = ?
                 AND disponible = 1
                 ORDER BY id DESC`,
                [table.maquis_id],
                (err, produits) => {

                    if (err) {
                        console.error(err);

                        return res.status(500).json({
                            error: "Erreur lors du chargement du menu."
                        });
                    }

                    res.json({
                        maquis: {
                            id: table.maquis_id,
                            nom: table.nom
                        },
                        table: table.numero,
                        produits: produits
                    });

                }
            );

        }
    );

}); 

// ===============================
// ENVOYER UNE COMMANDE CLIENT
// ===============================

app.post("/menu/commande", (req, res) => {

    const { table, maquis, produits } = req.body;

    if (!table || !Array.isArray(produits) || produits.length === 0) {

        return res.status(400).json({
            error: "Commande vide ou maquis non précisé."
        });

    }
if (!tableInfo) {
    return res.status(404).json({
        error: "Table introuvable pour ce maquis."
    });
}

// Chercher la table DU BON MAQUIS
db.get(
    `
    SELECT
        tables_maquis.*,
        maquis.actif,
        maquis.abonnement_fin
    FROM tables_maquis
    INNER JOIN maquis
        ON maquis.id = tables_maquis.maquis_id
    WHERE tables_maquis.numero = ?
    AND tables_maquis.maquis_id = ?
    `,
    [table, maquis],
    (err, tableInfo) => {
   
            if (err) {

                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur."
                });

            }
if (!tableInfo.actif) {

    return res.status(403).json({
        error:
        "Cette table est désactivée."
    });

}


if (!tableInfo.abonnement_fin) {

    return res.status(403).json({
        error:
        "Le maquis n'a pas d'abonnement actif."
    });

}


const dateFin =
new Date(
    tableInfo.abonnement_fin
);


if (
    dateFin <
    new Date()
) {

    return res.status(403).json({
        error:
        "L'abonnement du maquis a expiré."
    });

} 

            const maquisId = tableInfo.maquis_id;


            // Calcul du total
            let total = 0;

            produits.forEach(produit => {

                total +=
                    Number(produit.prix || 0) *
                    Number(produit.quantite || 1);

            });


            // Créer la commande
            db.run(
                `
                INSERT INTO commandes
                (
                    maquis_id,
                    table_id,
                    total,
                    statut
                )
                VALUES (?, ?, ?, ?)
                `,

                [
                    maquisId,
                    tableInfo.id,
                    total,
                    "nouvelle"
                ],

                function(err) {

                    if (err) {

                        console.error(
                            "Erreur commande :",
                            err.message
                        );

                        return res.status(500).json({
                            error: "Impossible d'enregistrer la commande."
                        });

                    }


                    const commandeId = this.lastID;


                    // Compteur des produits enregistrés
                    let index = 0;


                    function enregistrerProduit() {


                        // Tous les produits sont terminés
                        if (index >= produits.length) {

    // Vérifier si WhatsApp est activé
    db.get(
        `SELECT
            patrons.telephone,
            patrons.whatsapp_actif,
            maquis.nom AS nom_maquis
         FROM maquis
         INNER JOIN patrons
            ON patrons.id = maquis.patron_id
         WHERE maquis.id = ?`,
        [maquisId],
        (err, patronInfo) => {

            if (err) {
                console.error("Erreur WhatsApp :", err.message);

                return res.json({
                    success: true,
                    commande_id: commandeId,
                    total: total
                });
            }

            let whatsapp_url = null;

            if (
                patronInfo &&
                patronInfo.whatsapp_actif &&
                patronInfo.telephone
            ) {

                let numero = String(
                    patronInfo.telephone
                ).replace(/\D/g, "");

                // Numéro Burkina Faso
                if (numero.length === 8) {
                    numero = "226" + numero;
                }

                // Construire le message
                let message =
                    "🔔 NOUVELLE COMMANDE\n\n" +
                    "🏪 Maquis : " +
                    patronInfo.nom_maquis +
                    "\n" +
                    "🪑 Table : " +
                    table +
                    "\n\n";

                produits.forEach(produit => {

                    const nom =
                        produit.nom ||
                        produit.name ||
                        "Produit";

                    const prix =
                        Number(produit.prix || 0);

                    const quantite =
                        Number(produit.quantite || 1);

                    const sousTotal =
                        prix * quantite;

                    message +=
                        "• " +
                        nom +
                        " x" +
                        quantite +
                        " = " +
                        sousTotal +
                        " FCFA\n";
                });

                message +=
                    "\n💰 TOTAL : " +
                    total +
                    " FCFA";

                whatsapp_url =
                    "https://wa.me/" +
                    numero +
                    "?text=" +
                    encodeURIComponent(message);
            }

            return res.json({
                success: true,
                commande_id: commandeId,
                total: total,
                whatsapp_actif:
                    patronInfo
                        ? patronInfo.whatsapp_actif
                        : 0,
                whatsapp_url: whatsapp_url
            });

        }
    );

    return;
}


                        const produit = produits[index];


                        const nomProduit =
                            produit.nom ||
                            produit.name ||
                            "Produit";


                        const prixProduit =
                            Number(produit.prix || 0);


                        const quantiteProduit =
                            Number(produit.quantite || 1);


                        const produitId =
                            produit.id || null;


                        db.run(
                            `
                            INSERT INTO commande_produits
                            (
                                commande_id,
                                produit_id,
                                nom,
                                prix,
                                quantite
                            )
                            VALUES (?, ?, ?, ?, ?)
                            `,

                            [
                                commandeId,
                                produitId,
                                nomProduit,
                                prixProduit,
                                quantiteProduit
                            ],

                            function(err) {

                                if (err) {

                                    console.error(
                                        "ERREUR PRODUIT :",
                                        err.message
                                    );

                                    return res.status(500).json({
                                        error:
                                            "Impossible d'enregistrer le produit : "
                                            + err.message
                                    });

                                }


                                console.log(
                                    "Produit enregistré :",
                                    nomProduit
                                );


                                index++;


                                enregistrerProduit();

                            }

                        );

                    }


                    enregistrerProduit();

                }

            );

        }

    );

}); 

// ===============================
// PRÉPARER LA TABLE DES PRODUITS
// DES COMMANDES
// ===============================

db.serialize(() => {

    // Créer la table si elle n'existe pas
    db.run(`
        CREATE TABLE IF NOT EXISTS commande_produits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            commande_id INTEGER NOT NULL,
            produit_id INTEGER
        )
    `);

// ===============================
// AJOUT COLONNES ABONNEMENT
// ===============================

db.run(`
    ALTER TABLE maquis
    ADD COLUMN abonnement_fin TEXT
`, (err) => {

    if (
        err &&
        !err.message.includes("duplicate column")
    ) {
        console.error(
            "Erreur abonnement_fin :",
            err.message
        );
    }

});


db.run(`
    ALTER TABLE maquis
    ADD COLUMN abonnement_jours INTEGER DEFAULT 0
`, (err) => {

    if (
        err &&
        !err.message.includes("duplicate column")
    ) {
        console.error(
            "Erreur abonnement_jours :",
            err.message
        );
    }

}); 


    // Vérifier les colonnes existantes
    db.all(
        `PRAGMA table_info(commande_produits)`,
        (err, colonnes) => {

            if (err) {
                console.error(
                    "Erreur vérification commande_produits :",
                    err.message
                );

                return;
            }

            const nomsColonnes =
                colonnes.map(colonne => colonne.name);


            // Ajouter NOM s'il manque
            if (!nomsColonnes.includes("nom")) {

                db.run(
                    `ALTER TABLE commande_produits
                     ADD COLUMN nom TEXT`,
                    (err) => {

                        if (err) {
                            console.error(
                                "Erreur ajout colonne nom :",
                                err.message
                            );
                        } else {
                            console.log(
                                "Colonne nom ajoutée."
                            );
                        }

                    }
                );

            }


            // Ajouter PRIX s'il manque
            if (!nomsColonnes.includes("prix")) {

                db.run(
                    `ALTER TABLE commande_produits
                     ADD COLUMN prix REAL`,
                    (err) => {

                        if (err) {
                            console.error(
                                "Erreur ajout colonne prix :",
                                err.message
                            );
                        } else {
                            console.log(
                                "Colonne prix ajoutée."
                            );
                        }

                    }
                );

            }


            // Ajouter QUANTITE si elle manque
            if (!nomsColonnes.includes("quantite")) {

                db.run(
                    `ALTER TABLE commande_produits
                     ADD COLUMN quantite INTEGER DEFAULT 1`,
                    (err) => {

                        if (err) {
                            console.error(
                                "Erreur ajout colonne quantite :",
                                err.message
                            );
                        } else {
                            console.log(
                                "Colonne quantite ajoutée."
                            );
                        }

                    }
                );

            }

        }
    );

}); 

// ===============================
// AJOUT OPTION WHATSAPP PATRON
// ===============================

db.run(`
    ALTER TABLE patrons
    ADD COLUMN whatsapp_actif INTEGER DEFAULT 0
`, (err) => {
    if (err && !err.message.includes("duplicate column name")) {
        console.error("Erreur colonne whatsapp_actif :", err.message);
    } else {
        console.log("✅ Option WhatsApp prête.");
    }
});
// ===================================
// INFORMATIONS ABONNEMENT DU PATRON
// ===================================

app.get("/patron/abonnement/info", (req, res) => {

    if (!req.session.patronId) {

        return res.status(401).json({
            error: "Non connecté"
        });

    }

    db.get(`
        SELECT
            id,
            nom,
            actif,
            abonnement_fin,
            abonnement_jours
        FROM maquis
        WHERE id = ?
    `,
    [req.session.maquisId],
    (err, maquis) => {

        if (err) {

            return res.status(500).json({
                error: err.message
            });

        }

        if (!maquis) {

            return res.status(404).json({
                error: "Maquis introuvable"
            });

        }

        res.json(maquis);

    });

}); 


// ===============================
// PRODUITS D'UNE COMMANDE
// ===============================

app.get(
    "/patron/commandes/:id/produits",
    (req, res) => {

        if (!req.session.patronId) {
            return res.status(401).json({
                error: "Non autorisé"
            });
        }

        const commandeId = req.params.id;

        // Vérifier que la commande appartient
        // bien au maquis du patron
        db.get(
            `
            SELECT id
            FROM commandes
            WHERE id = ?
            AND maquis_id = ?
            `,
            [
                commandeId,
                req.session.maquisId
            ],
            (err, commande) => {

                if (err) {
                    console.error(err);

                    return res.status(500).json({
                        error: err.message
                    });
                }

                if (!commande) {
                    return res.status(404).json({
                        error: "Commande introuvable"
                    });
                }

                // Récupérer les produits
                db.all(
                    `
                    SELECT
                        id,
                        commande_id,
                        produit_id,
                        nom,
                        prix,
                        quantite
                    FROM commande_produits
                    WHERE commande_id = ?
                    ORDER BY id ASC
                    `,
                    [commandeId],
                    (err, produits) => {

                        if (err) {
                            console.error(
                                "Erreur produits commande :",
                                err.message
                            );

                            return res.status(500).json({
                                error: err.message
                            });
                        }

                        return res.json(produits);
                    }
                );

            }
        );

    }
); 
// ===============================
// PAGE GESTION DES QR CODES
// ===============================

app.get("/patron/qrcodes", (req, res) => {

    if (!req.session.patronId) {
        return res.redirect("/patron/login");
    }

    res.sendFile(
        path.join(
            __dirname,
            "patron",
            "qrcodes.html"
        )
    );

}); 
// ===============================
// PARAMÈTRES DU MAQUIS
// ===============================

app.get("/patron/parametres", (req, res) => {

    if (!req.session.patronId) {
        return res.redirect("/patron/login");
    }

    res.sendFile(
        path.join(
            __dirname,
            "patron",
            "parametres.html"
        )
    );

}); 
// ===============================
// GÉNÉRER QR CODE D'UNE TABLE
// ===============================

app.get(
    "/patron/qrcodes/:tableId",
    (req, res) => {

        if (!req.session.patronId) {

            return res.status(401).json({
                error: "Non autorisé"
            });

        }


        const tableId =
            req.params.tableId;


        db.get(
            `
            SELECT *
            FROM tables_maquis
            WHERE id = ?
            AND maquis_id = ?
            `,
            [
                tableId,
                req.session.maquisId
            ],
            (err, table) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({
                        error: "Erreur serveur"
                    });

                }


                if (!table) {

                    return res.status(404).json({
                        error: "Table introuvable"
                    });

                }
const urlMenu =
    `${BASE_URL}/menu?maquis=${table.maquis_id}&table=${table.numero}`;
                QRCode.toDataURL(
                    urlMenu,
                    (err, qrcode) => {

                        if (err) {

                            console.error(err);

                            return res.status(500).json({
                                error:
                                    "Impossible de générer le QR Code"
                            });

                        }


                        res.json({

                            success: true,

                            table: table.numero,

                            url: urlMenu,

                            qrcode: qrcode

                        });

                    }
                );

            }
        );

    }
); 
// ===============================
// INFORMATIONS DU MAQUIS
// ===============================

app.get("/patron/maquis", (req, res) => {

    console.log(
        "SESSION PATRON :",
        req.session
    );

    if (!req.session.patronId) {

        return res.status(401).json({
            error: "Non autorisé"
        });

    }


    db.get(
        `
        SELECT
            id,
            nom,
            telephone,
            adresse,
            horaires,
            logo
        FROM maquis
        WHERE id = ?
        `,
        [
            req.session.maquisId
        ],
        (err, maquis) => {

            if (err) {

                console.error(
                    "ERREUR MAQUIS :",
                    err.message
                );

                return res.status(500).json({
                    error: "Erreur serveur"
                });

            }


            console.log(
                "ID MAQUIS RECHERCHÉ :",
                req.session.maquisId
            );

            console.log(
                "MAQUIS TROUVÉ :",
                maquis
            );


            if (!maquis) {

                return res.status(404).json({
                    error: "Maquis introuvable"
                });

            }


            return res.json(maquis);

        }
    );

}); 

// ===============================
// MODIFIER LES INFORMATIONS DU MAQUIS
// ===============================

app.put(
    "/patron/maquis",
    upload.single("logo"),
    (req, res) => {

        console.log("PUT PARAMÈTRES REÇU");

        if (!req.session.patronId) {
            return res.status(401).json({
                error: "Non autorisé"
            });
        }

        const {
            nom,
            telephone,
            adresse,
            horaires
        } = req.body;

        let logo = null;

        if (req.file) {
            logo =
                "/uploads/" +
                req.file.filename;
        }

        if (!nom) {
            return res.status(400).json({
                error:
                    "Le nom du maquis est obligatoire."
            });
        }

        db.run(
            `
            UPDATE maquis
            SET
                nom = ?,
                telephone = ?,
                adresse = ?,
                horaires = ?,
                logo = CASE
                    WHEN ? IS NOT NULL THEN ?
                    ELSE logo
                END
            WHERE id = ?
            `,
            [
                nom,
                telephone || "",
                adresse || "",
                horaires || "",
                logo,
                logo,
                req.session.maquisId
            ],
            function(err) {

                if (err) {

                    console.error(
                        "Erreur modification maquis :",
                        err.message
                    );

                    return res.status(500).json({
                        error: err.message
                    });

                }

                if (this.changes === 0) {

                    return res.status(404).json({
                        error:
                            "Maquis introuvable."
                    });

                }

                return res.json({
                    success: true,
                    message:
                        "Informations enregistrées avec succès.",
                    logo: logo
                });

            }
        );

    }
); 
// ===============================
// INFORMATIONS DU MAQUIS POUR LE MENU CLIENT
// ===============================

app.get("/menu/maquis/:table", (req, res) => {

    const numeroTable =
        req.params.table;
const maquisId = req.query.maquis;
    db.get(
        `
        SELECT
            maquis.nom,
            maquis.telephone,
            maquis.adresse,
            maquis.horaires,
            maquis.logo
        FROM tables_maquis
        INNER JOIN maquis
            ON tables_maquis.maquis_id = maquis.id
        
            WHERE tables_maquis.numero = ?
AND tables_maquis.maquis_id = ?`,
[numeroTable, maquisId],
        (err, maquis) => {

            if (err) {

                console.error(
                    "Erreur récupération maquis menu :",
                    err.message
                );

                return res.status(500).json({
                    error: "Erreur serveur"
                });

            }

            if (!maquis) {

                return res.status(404).json({
                    error: "Maquis introuvable"
                });

            }

            return res.json(maquis);

        }
    );

}); 

// ===============================
// PAGE GESTION ABONNEMENT PATRON
// ===============================

app.get("/patron/abonnement", (req, res) => {

    if (!req.session.patronId) {

        return res.redirect(
            "/patron/login"
        );

    }

    res.sendFile(
        path.join(
            __dirname,
            "patron",
            "abonnement.html"
        )
    );

}); 

app.get("/admin/maquis", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(
            __dirname,
            "admin",
            "maquis.html"
        )
    );

}); 


// ===============================
// GESTION DES MENUS - SUPER ADMIN
// ===============================

app.get("/admin/menus", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(
            __dirname,
            "admin",
            "menus.html"
        )
    );

});


// ===============================
// GESTION DES QR CODES - SUPER ADMIN
// ===============================

app.get("/admin/qrcodes", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(
            __dirname,
            "admin",
            "qrcodes.html"
        )
    );

});


// ===============================
// GESTION DES ABONNEMENTS - SUPER ADMIN
// ===============================

app.get("/admin/abonnements", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(
            __dirname,
            "admin",
            "abonnements.html"
        )
    );

});


// ===============================
// VOIR LES COMMANDES - SUPER ADMIN
// ===============================

app.get("/admin/commandes", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(
            __dirname,
            "admin",
            "commandes.html"
        )
    );

}); 
// ===============================
// LISTE DES MAQUIS - SUPER ADMIN
// ===============================

app.get("/admin/maquis/liste", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `
        SELECT
            maquis.id,
            maquis.nom,
            maquis.telephone,
            maquis.adresse,
            maquis.horaires,
            maquis.logo,
            maquis.actif,
            maquis.abonnement_fin,
            maquis.abonnement_jours,

            patrons.id AS patron_id,
            patrons.nom AS nom_patron,
            patrons.email AS email_patron

        FROM maquis

        LEFT JOIN patrons
            ON patrons.id = maquis.patron_id

        ORDER BY maquis.id DESC
        `,
        (err, maquis) => {

            if (err) {

                console.error(
                    "Erreur liste maquis :",
                    err.message
                );

                return res.status(500).json({
                    error: "Erreur serveur"
                });

            }

            res.json(maquis);

        }
    );

}); 
// ===================================
// ADMIN - LISTE DES MAQUIS POUR MENUS
// ===================================

app.get("/admin/menus/maquis", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `
        SELECT
            id,
            nom
        FROM maquis
        ORDER BY nom ASC
        `,
        (err, rows) => {

            if (err) {

                console.error(
                    "Erreur récupération maquis :",
                    err.message
                );

                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            res.json(rows);

        }
    );

});


// ===================================
// ADMIN - PRODUITS D'UN MAQUIS
// ===================================

app.get("/admin/menus/produits/:maquisId", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const maquisId = req.params.maquisId;

    db.all(
        `
        SELECT
            produits.id,
            produits.nom,
            produits.prix,
            produits.description,
            produits.photo,
            produits.disponible,

            categories.nom AS categorie

        FROM produits

        LEFT JOIN categories
            ON categories.id =
            produits.categorie_id

        WHERE produits.maquis_id = ?

        ORDER BY produits.id DESC
        `,
        [maquisId],

        (err, produits) => {

            if (err) {

                console.error(
                    "Erreur produits admin :",
                    err.message
                );

                return res.status(500).json({
                    error:
                        "Erreur lors du chargement des produits"
                });

            }

            res.json(produits);

        }
    );

}); 
// ===================================
// ADMIN - LISTE DES MAQUIS POUR QR
// ===================================

app.get("/admin/qrcodes/maquis", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `
        SELECT
            id,
            nom
        FROM maquis
        ORDER BY nom ASC
        `,
        (err, rows) => {

            if (err) {
                console.error(
                    "Erreur maquis QR :",
                    err.message
                );

                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            res.json(rows);

        }
    );

});


// ===================================
// ADMIN - LISTE DES TABLES D'UN MAQUIS
// ===================================

app.get(
    "/admin/qrcodes/tables/:maquisId",
    (req, res) => {

        if (!req.session.adminId) {
            return res.status(401).json({
                error: "Non autorisé"
            });
        }

        const maquisId =
            req.params.maquisId;


        db.all(
            `
            SELECT
                id,
                numero,
                actif,
                qr_code
            FROM tables_maquis
            WHERE maquis_id = ?
            ORDER BY numero ASC
            `,
            [maquisId],

            (err, tables) => {

                if (err) {

                    console.error(
                        "Erreur tables QR :",
                        err.message
                    );

                    return res.status(500).json({
                        error: "Erreur serveur"
                    });

                }

                res.json(tables);

            }
        );

    }
);


// ===================================
// ADMIN - GÉNÉRER QR CODE
// ===================================

app.post(
    "/admin/qrcodes/:tableId",
    async (req, res) => {

        if (!req.session.adminId) {
            return res.status(401).json({
                error: "Non autorisé"
            });
        }

        const tableId =
            req.params.tableId;


        db.get(
            `
            SELECT
                tables_maquis.id,
                tables_maquis.numero,
                tables_maquis.maquis_id,
                maquis.nom AS nom_maquis

            FROM tables_maquis

            INNER JOIN maquis
                ON maquis.id =
                tables_maquis.maquis_id

            WHERE tables_maquis.id = ?
            `,
            [tableId],

            async (err, table) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({
                        error: "Erreur serveur"
                    });

                }

                if (!table) {

                    return res.status(404).json({
                        error: "Table introuvable"
                    });

                }


                try {

                    // IMPORTANT :
                    // Pour l'instant on utilise
                    // l'adresse actuelle de ton serveur.
const urlMenu =
    `${BASE_URL}/menu?maquis=${table.maquis_id}&table=${table.numero}`;

                    const qrCode =
                        await QRCode.toDataURL(
                            urlMenu
                        );


                    db.run(
                        `
                        UPDATE tables_maquis
                        SET qr_code = ?
                        WHERE id = ?
                        `,
                        [
                            qrCode,
                            tableId
                        ],

                        (err) => {

                            if (err) {

                                console.error(err);

                                return res.status(500).json({
                                    error:
                                        "Erreur enregistrement QR"
                                });

                            }


                            res.json({

                                success: true,

                                table:
                                    table.numero,

                                maquis:
                                    table.nom_maquis,

                                url:
                                    urlMenu,

                                qr_code:
                                    qrCode

                            });

                        }

                    );


                } catch (error) {

                    console.error(
                        "Erreur QR :",
                        error
                    );

                    res.status(500).json({

                        error:
                            "Impossible de générer le QR Code"

                    });

                }

            }

        );

    }
); 
// ===================================
// ADMIN - LISTE DES ABONNEMENTS
// ===================================

app.get("/admin/abonnements/liste", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `
        SELECT
            maquis.id,
            maquis.nom,
            maquis.telephone,
            maquis.actif,
            maquis.abonnement_fin,
            maquis.abonnement_jours,

            patrons.nom AS nom_patron,
            patrons.email AS email_patron

        FROM maquis

        LEFT JOIN patrons
            ON patrons.id = maquis.patron_id

        ORDER BY maquis.id DESC
        `,
        (err, rows) => {

            if (err) {

                console.error(
                    "Erreur abonnements :",
                    err.message
                );

                return res.status(500).json({
                    error: "Erreur serveur"
                });

            }

            res.json(rows);

        }
    );

}); 
// =================================================
// ADMIN - LISTE DE TOUTES LES COMMANDES
// =================================================

app.get("/admin/commandes/liste", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    db.all(
        `
        SELECT
            commandes.id,
            commandes.total,
            commandes.statut,
            commandes.created_at,

            maquis.id AS maquis_id,
            maquis.nom AS nom_maquis,

            patrons.nom AS nom_patron,

            tables_maquis.numero AS numero_table

        FROM commandes

        LEFT JOIN maquis
            ON maquis.id = commandes.maquis_id

        LEFT JOIN patrons
            ON patrons.id = maquis.patron_id

        LEFT JOIN tables_maquis
            ON tables_maquis.id = commandes.table_id

        ORDER BY commandes.id DESC
        `,
        (err, commandes) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: err.message
                });
            }

            res.json(commandes);
        }
    );
});


// =================================================
// ADMIN - PRODUITS D'UNE COMMANDE
// =================================================

app.get("/admin/commandes/:id/produits", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const commandeId = req.params.id;

    db.all(
        `
        SELECT
            nom,
            prix,
            quantite
        FROM commande_produits
        WHERE commande_id = ?
        ORDER BY id ASC
        `,
        [commandeId],
        (err, produits) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: err.message
                });
            }

            res.json(produits);
        }
    );
}); 

// =================================================
// ADMIN - LISTE DE TOUS LES QR CODES
// =================================================

app.get("/admin/qrcodes/liste", (req, res) => {

    if (!req.session.adminId) {

        return res.status(401).json({
            error: "Non autorisé"
        });

    }


    db.all(
        `
        SELECT

            tables_maquis.id,

            tables_maquis.numero,

            tables_maquis.actif,

            tables_maquis.qr_code,

            maquis.id AS maquis_id,

            maquis.nom AS nom_maquis

        FROM tables_maquis

        INNER JOIN maquis

            ON maquis.id =
            tables_maquis.maquis_id

        ORDER BY
            maquis.nom ASC,
            tables_maquis.numero ASC
        `,

        (err, tables) => {

            if (err) {

                console.error(
                    "Erreur liste QR Codes :",
                    err.message
                );

                return res.status(500).json({
                    error: err.message
                });

            }


            return res.json(tables);

        }
    );

}); 
// =====================================
// SUPER ADMIN - SUPPRIMER UN PATRON
// =====================================
app.delete("/admin/patrons/:id", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const patronId = req.params.id;

    db.get(
        `SELECT id FROM maquis WHERE patron_id = ?`,
        [patronId],
        (err, maquis) => {

            if (err) {
                console.error("Erreur recherche maquis :", err.message);
                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            if (!maquis) {

                db.run(
                    `DELETE FROM patrons WHERE id = ?`,
                    [patronId],
                    function (err) {

                        if (err) {
                            console.error(
                                "Erreur suppression patron :",
                                err.message
                            );

                            return res.status(500).json({
                                error: "Impossible de supprimer le patron"
                            });
                        }

                        if (this.changes === 0) {
                            return res.status(404).json({
                                error: "Patron introuvable"
                            });
                        }

                        return res.json({
                            success: true
                        });
                    }
                );

                return;
            }

            const maquisId = maquis.id;

            db.serialize(() => {

                db.run("BEGIN TRANSACTION");

                db.run(
                    `DELETE FROM commande_produits
                     WHERE commande_id IN (
                         SELECT id FROM commandes WHERE maquis_id = ?
                     )`,
                    [maquisId]
                );

                db.run(
                    `DELETE FROM commandes WHERE maquis_id = ?`,
                    [maquisId]
                );

                db.run(
                    `DELETE FROM produits WHERE maquis_id = ?`,
                    [maquisId]
                );

                db.run(
                    `DELETE FROM categories WHERE maquis_id = ?`,
                    [maquisId]
                );

                db.run(
                    `DELETE FROM tables_maquis WHERE maquis_id = ?`,
                    [maquisId]
                );

                db.run(
                    `DELETE FROM abonnements WHERE maquis_id = ?`,
                    [maquisId]
                );

                db.run(
                    `DELETE FROM maquis WHERE id = ?`,
                    [maquisId]
                );

                db.run(
                    `DELETE FROM patrons WHERE id = ?`,
                    [patronId],
                    function (err) {

                        if (err) {

                            console.error(
                                "Erreur suppression patron :",
                                err.message
                            );

                            db.run("ROLLBACK");

                            return res.status(500).json({
                                error: "Impossible de supprimer le patron"
                            });
                        }

                        db.run("COMMIT", (commitErr) => {

                            if (commitErr) {

                                console.error(
                                    "Erreur validation suppression :",
                                    commitErr.message
                                );

                                return res.status(500).json({
                                    error: "Erreur lors de la suppression"
                                });
                            }

                            return res.json({
                                success: true
                            });

                        });
                    }
                );

            });
        }
    );
}); 
// ===============================
// ACTIVER / DESACTIVER WHATSAPP
// ===============================

app.post("/admin/patrons/:id/whatsapp", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            error: "Non autorisé"
        });
    }

    const patronId = req.params.id;

    db.get(
        `SELECT whatsapp_actif FROM patrons WHERE id = ?`,
        [patronId],
        (err, patron) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    error: "Erreur serveur"
                });
            }

            if (!patron) {
                return res.status(404).json({
                    error: "Patron introuvable"
                });
            }

            const nouveauStatut =
                patron.whatsapp_actif ? 0 : 1;

            db.run(
                `UPDATE patrons
                 SET whatsapp_actif = ?
                 WHERE id = ?`,
                [nouveauStatut, patronId],
                (err) => {

                    if (err) {
                        console.error(err);

                        return res.status(500).json({
                            error: "Impossible de modifier WhatsApp"
                        });
                    }

                    res.json({
                        success: true,
                        whatsapp_actif: nouveauStatut
                    });

                }
            );

        }
    );
});
// Démarrage du serveur
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Serveur sur http://0.0.0.0:${PORT}`);
    console.log(`Adresse locale : ${BASE_URL}`);
}); 