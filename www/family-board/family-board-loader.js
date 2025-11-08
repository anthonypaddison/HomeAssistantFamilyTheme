// Minimal loader: fetches the active files with a fresh cache-buster and in order.
// Loads the controller (chrome) first, then your custom card runtime.

(function () {
    const base = '/local/family-board/';
    const bust = () => String(Math.floor(Date.now() / 1000)); // 1s granularity

    function loadJS(url) {
        return new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = `${url}?v=${bust()}`;
            s.async = false; // preserve order
            s.onload = res;
            s.onerror = () => rej(new Error('Failed to load ' + url));
            document.head.appendChild(s);
        });
    }

    const files = ['family-dashboard-controller.js', 'family-board-jq.js'];

    (async () => {
        for (const f of files) await loadJS(base + f);
    })().catch((e) => {
        console.error('[family-board-loader] ', e);
    });
})();
