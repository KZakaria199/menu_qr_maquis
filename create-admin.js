const db = require("./config/database");
const bcrypt = require("bcrypt");

const nom = "Super Admin";
const email = "add223@.com";
const motDePasse = "Change!";

bcrypt.hash(motDePasse, 10, (err, hash) => {
    if (err) {
        console.error("Erreur :", err);
        return;
    }

    db.run(
        `INSERT INTO super_admin (nom, email, mot_de_passe)
         VALUES (?, ?, ?)`,
        [nom, email, hash],
        function (err) {
            if (err) {
                console.error("Erreur lors de la création :", err.message);
                return;
            }

            console.log("Compte Super Admin créé avec succès !");
            console.log("Email :", email);
            console.log("Mot de passe :", motDePasse);

            db.close();
        }
    );
}); 