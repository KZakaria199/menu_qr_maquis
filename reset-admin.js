const db = require("./config/database");
const bcrypt = require("bcrypt");

const email = "add226@gmail.com";
const nouveauMotDePasse = "change1234";

bcrypt.hash(nouveauMotDePasse, 10, (err, hash) => {
    if (err) {
        console.error("Erreur :", err);
        return;
    }

    db.run(
        `UPDATE super_admin SET mot_de_passe = ? WHERE email = ?`,
        [hash, email],
        function (err) {
            if (err) {
                console.error("Erreur :", err.message);
                return;
            }

            console.log("Mot de passe Super Admin réinitialisé avec succès !");
            console.log("Email :", email);
            console.log("Mot de passe :", nouveauMotDePasse);

            db.close();
        }
    );
}); 