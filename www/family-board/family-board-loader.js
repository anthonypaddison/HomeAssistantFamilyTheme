// Minimal loader: re-fetches your active files with a fresh cache-buster
(function () {
    const base = '/local/family-board/';
    const bust = () => String(Math.floor(Date.now() / 1000)); // 1s granularity

    function loadJS(url) {
        return new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = `${url}?v=${bust()}`;
            s.async = false; // keep order
            s.onload = res;
            s.onerror = () => rej(new Error('Failed to load ' + url));
            document.head.appendChild(s);
        });
    }

    // Load order: controller first (sets chrome), then your custom card runtime
    // Adjust filenames if you rename them.
    const files = ['family-dashboard-controller.js', 'family-board-jq.js'];

    (async () => {
        for (const f of files) await loadJS(base + f);
        // Optional: also force-reload your CSS inside the card if it isn’t already
        // handled (your card already appends ?timestamp for CSS).
    })().catch((e) => {
        console.error('[family-board-loader] ', e);
    });
})();
