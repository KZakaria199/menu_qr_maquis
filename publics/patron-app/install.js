let deferredPrompt;

window.addEventListener(
    "beforeinstallprompt",
    event => {

        event.preventDefault();

        deferredPrompt = event;

        const bouton =
            document.getElementById(
                "installerApp"
            );

        if (bouton) {

            bouton.style.display =
                "block";

        }

    }
);


async function installerApplication() {

    if (!deferredPrompt) {

        alert(
            "L'installation n'est pas encore disponible."
        );

        return;

    }

    deferredPrompt.prompt();

    await deferredPrompt.userChoice;

    deferredPrompt = null;

    const bouton =
        document.getElementById(
            "installerApp"
        );

    if (bouton) {

        bouton.style.display =
            "none";

    }

} 
