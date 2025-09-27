// legend-styler.js (or inline in your JS file)
(function (global) {
  // --- CONFIG (can be changed before calling start) ---
  const config = {
    selector: '.container .legend ul li.hasToggle',
    fallbackColor: '#0078d4',
    observe: true,       // watch for dynamically added nodes
  };

  // --- INTERNAL STATE ---
  const state = {
    appliedAttr: 'data-legend-styled',
    observers: new Set(),
    observedRoots: new WeakSet(),
    running: false,
  };

  // --- UTILITIES ---
  const PROPS = [
    ['display', 'flex'],
    ['justify-content', 'center'],
    ['align-items', 'center'],
    ['width', '28px'],
    ['height', '28px'],
    ['border-radius', '50%'],
    ['background-color', () => `var(--legend-calendar-color, ${config.fallbackColor})`],
    ['color', '#fff'],
    ['font-weight', '700'],
    ['font-size', '14px'],
    ['list-style', 'none'],
  ];

  function styleLegendItem(el) {
    console.log('styleLegendItem:', el);
    console.log('styleLegendItem:', el.text());

    if (!el || el.nodeType !== 1 || el.getAttribute(state.appliedAttr)) return;
    for (const [prop, value] of PROPS) {
      el.style.setProperty(prop, typeof value === 'function' ? value() : value, 'important');
    }
    el.setAttribute(state.appliedAttr, '1');
  }

  function scanRoot(root) {
    try {
      root.querySelectorAll(config.selector).forEach(styleLegendItem);
    } catch (e) {
      console.warn('Selector failed:', config.selector, e);
    }
  }

  function walkAllOpenShadows(root = document) {
    scanRoot(root);
    root.querySelectorAll('*').forEach(node => {
        console.log('querySelectorAll:', node);

      if (node.shadowRoot) {
        scanRoot(node.shadowRoot);
        walkAllOpenShadows(node.shadowRoot);
      }
    });
  }

  function observeRoot(root) {
    if (!config.observe || state.observedRoots.has(root)) return;
    state.observedRoots.add(root);

    const obs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;

          if (node.matches?.(config.selector)) styleLegendItem(node);
          node.querySelectorAll?.(config.selector).forEach(styleLegendItem);

          if (node.shadowRoot) {
            scanRoot(node.shadowRoot);
            observeRoot(node.shadowRoot);
          }
          node.querySelectorAll?.('*').forEach(child => {
            if (child.shadowRoot) {
              scanRoot(child.shadowRoot);
              observeRoot(child.shadowRoot);
            }
          });
        }
      }
    });

    obs.observe(root, { childList: true, subtree: true });
    state.observers.add(obs);
  }

  function run() {
    if (state.running) return;
    state.running = true;

    // Ensure the CSS variable is available (for components that use it)
    document.documentElement.style.setProperty('--legend-calendar-color', config.fallbackColor);

    // Initial pass across light DOM + any open shadow roots
    walkAllOpenShadows(document);

    // Attach observers
    observeRoot(document);
    document.querySelectorAll('*').forEach(el => {
        console.log('obs:', el);

      if (el.shadowRoot) observeRoot(el.shadowRoot);
    });

    console.log('%cLegend styles applied.', 'color:#0078d4;font-weight:700');
    console.log('• Stop watching: legendStyler.stop()');
    console.log('• Revert inline styles: legendStyler.revert()');
  }

  function start(options) {
    // Options: number (delay ms) OR object { delay, waitForDom, selector, fallbackColor, observe }
    let delay = 3000;
    let waitForDom = false;

    if (typeof options === 'number') {
      delay = options;
    } else if (options && typeof options === 'object') {
      delay = options.delay ?? delay;
      waitForDom = !!options.waitForDom;
      if (options.selector) config.selector = options.selector;
      if (options.fallbackColor) config.fallbackColor = options.fallbackColor;
      if (typeof options.observe === 'boolean') config.observe = options.observe;
    }

    const kickoff = () => setTimeout(run, Math.max(0, delay));
    if (waitForDom && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', kickoff, { once: true });
    } else {
      kickoff();
    }
  }

  function stop() {
    state.observers.forEach(o => o.disconnect());
    state.observers.clear();
    state.running = false;
    console.log('Legend style observer(s) disconnected.');
  }

  function revert() {
    function revertInRoot(root) {
      try {
        root.querySelectorAll(config.selector).forEach(el => {
          console.log('Reverting styles for:', el);
          for (const [prop] of PROPS) el.style.removeProperty(prop);
          el.removeAttribute(state.appliedAttr);
        });
      } catch {}
    }
    (function revertWalk(root = document) {
      revertInRoot(root);
      root.querySelectorAll('*').forEach(n => n.shadowRoot && revertWalk(n.shadowRoot));
    })();
    console.log('Legend styles reverted (inline styles removed).');
  }

  // Expose API
  global.legendStyler = { start, stop, revert, config };
})(window);
window.legendStyler.start({ delay: 1000, waitForDom: true });