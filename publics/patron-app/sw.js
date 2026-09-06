const CACHE_NAME = "menu-qr-patron-v1";

const FILES_TO_CACHE = [
    "/patron/login",
    "/patron/dashboard",
    "/patron-app/manifest.json"
];

self.addEventListener("install", event => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(FILES_TO_CACHE);
            })
    );

    self.skipWaiting();

});


self.addEventListener("activate", event => {

    event.waitUntil(
        caches.keys()
            .then(keys => {

                return Promise.all(
                    keys.map(key => {

                        if (
                            key !== CACHE_NAME &&
                            key.startsWith("menu-qr-patron")
                        ) {

                            return caches.delete(key);

                        }

                    })
                );

            })
    );

    self.clients.claim();

});


self.addEventListener("fetch", event => {

    event.respondWith(

        fetch(event.request)
            .catch(() => {

                return caches.match(
                    event.request
                );

            })

    );

}); 
