// legend-styler.js (updated)
(function (global) {
  // --- CONFIG ---
  const config = {
    selector: '.container .legend ul li.hasToggle',
    // For killing the pseudo-element:
    noIconSelector: 'li.noIcon', // works in light DOM and shadow roots
    fallbackColor: '#0078d4',
    observe: true,
    killBefore: true, // <— turn off if you don't want to inject the ::before killer rule
  };

  // --- STATE ---
  const state = {
    appliedAttr: 'data-legend-styled',
    observers: new Set(),
    observedRoots: new WeakSet(),
    running: false,
  };

  // --- STYLE DEFINITIONS ---
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

  // CSS that hides the pseudo-element:
  const KILL_BEFORE_CSS_DOC = `
    .container .legend ul li.noIcon::before,
    .container .legend ul li.noIcon:before {
      content: none !important;
      display: none !important;
      margin: 0 !important;
      width: 0 !important;
      height: 0 !important;
    }
  `;
  const KILL_BEFORE_CSS_SHADOW = `
    li.noIcon::before,
    li.noIcon:before {
      content: none !important;
      display: none !important;
      margin: 0 !important;
      width: 0 !important;
      height: 0 !important;
    }
  `;

  // --- HELPERS ---
  function styleLegendItem(el) {
    if (!el || el.nodeType !== 1 || el.getAttribute(state.appliedAttr)) return;
    for (const [prop, value] of PROPS) {
      el.style.setProperty(prop, typeof value === 'function' ? value() : value, 'important');
    }
    el.setAttribute(state.appliedAttr, '1');
  }

  // Fallback for closed shadow roots: shrink the pseudo-dot via custom properties.
  // (This can’t remove the 5px margin defined on ::before, but it makes the dot disappear.)
  function suppressBeforeWithVars(el) {
    try {
      el.style.setProperty('--legend-dot-size', '0px', 'important');
      el.style.setProperty('--legend-calendar-color', 'transparent', 'important');
    } catch {}
  }

  function ensureKillBeforeStyle(root) {
    if (!config.killBefore) return;
    const hasQS = typeof root.querySelector === 'function';
    if (hasQS && root.querySelector('#legend-kill-before-style')) return;

    const style = document.createElement('style');
    style.id = 'legend-kill-before-style';
    // Document gets container-scoped selector; shadow roots get local selector
    const isDocument = root === document || root === document.documentElement || root.nodeType === 9;
    style.textContent = isDocument ? KILL_BEFORE_CSS_DOC : KILL_BEFORE_CSS_SHADOW;

    const where = isDocument ? (document.head || document.documentElement) : root;
    where.appendChild(style);
  }

  function scanRoot(root) {
    try {
      root.querySelectorAll(config.selector).forEach(styleLegendItem);
    } catch (e) {
      console.warn('Selector failed:', config.selector, e);
    }

    // Kill ::before by variables (works even in closed shadows if we can reach the LI)
    try {
      root.querySelectorAll(config.noIconSelector).forEach(suppressBeforeWithVars);
      // Also catch plain 'li.noIcon' in case the container path doesn't exist in shadows
      if (config.noIconSelector !== 'li.noIcon') {
        root.querySelectorAll('li.noIcon').forEach(suppressBeforeWithVars);
      }
    } catch {}
  }

  function walkAllOpenShadows(root = document) {
    // Inject the killer rule into this root
    ensureKillBeforeStyle(root);
    // Style items in this root
    scanRoot(root);
    // Recurse into any open shadow roots
    root.querySelectorAll('*').forEach(node => {
      if (node.shadowRoot) {
        ensureKillBeforeStyle(node.shadowRoot);
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

          // Style direct matches
          if (node.matches?.(config.selector)) styleLegendItem(node);

          // Suppress pseudo via variables on noIcon items
          if (node.matches?.(config.noIconSelector) || node.matches?.('li.noIcon')) {
            suppressBeforeWithVars(node);
          }

          // Descendants
          node.querySelectorAll?.(config.selector).forEach(styleLegendItem);
          node.querySelectorAll?.(config.noIconSelector).forEach(suppressBeforeWithVars);
          if (config.noIconSelector !== 'li.noIcon') {
            node.querySelectorAll?.('li.noIcon').forEach(suppressBeforeWithVars);
          }

          // Handle shadow roots created on new nodes
          if (node.shadowRoot) {
            ensureKillBeforeStyle(node.shadowRoot);
            scanRoot(node.shadowRoot);
            observeRoot(node.shadowRoot);
          }
          node.querySelectorAll?.('*').forEach(child => {
            if (child.shadowRoot) {
              ensureKillBeforeStyle(child.shadowRoot);
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

    // Provide default variable so your background-color var resolves
    document.documentElement.style.setProperty('--legend-calendar-color', config.fallbackColor);

    // Inject killer rule + initial pass across document + open shadows
    walkAllOpenShadows(document);

    // Observe document and any existing open shadow roots
    observeRoot(document);
    document.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) observeRoot(el.shadowRoot);
    });

    console.log('%cLegend styles applied and ::before suppressed.', 'color:#0078d4;font-weight:700');
    console.log('• Stop watching: legendStyler.stop()');
    console.log('• Revert inline styles: legendStyler.revert()');
  }

  function start(options) {
    let delay = 3000;
    let waitForDom = false;

    if (typeof options === 'number') {
      delay = options;
    } else if (options && typeof options === 'object') {
      delay = options.delay ?? delay;
      waitForDom = !!options.waitForDom;
      if (options.selector) config.selector = options.selector;
      if (options.noIconSelector) config.noIconSelector = options.noIconSelector;
      if (options.fallbackColor) config.fallbackColor = options.fallbackColor;
      if (typeof options.observe === 'boolean') config.observe = options.observe;
      if (typeof options.killBefore === 'boolean') config.killBefore = options.killBefore;
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

  function removeKillBeforeStyle(root) {
    const sel = '#legend-kill-before-style';
    const style = root.querySelector?.(sel);
    if (style) style.remove();
  }

  function revert() {
    // Remove inline styles & data marks
    function revertInRoot(root) {
      try {
        root.querySelectorAll(config.selector).forEach(el => {
          for (const [prop] of PROPS) el.style.removeProperty(prop);
          el.removeAttribute(state.appliedAttr);
        });
        // Undo variable fallback on noIcon
        root.querySelectorAll(config.noIconSelector).forEach(el => {
          console.log(el.text());
          el.style.removeProperty('--legend-dot-size');
          el.style.removeProperty('--legend-calendar-color');
        });
        if (config.noIconSelector !== 'li.noIcon') {
          root.querySelectorAll('li.noIcon').forEach(el => {
            el.style.removeProperty('--legend-dot-size');
            el.style.removeProperty('--legend-calendar-color');
          });
        }
      } catch {}
      removeKillBeforeStyle(root);
    }

    (function revertWalk(root = document) {
      revertInRoot(root);
      root.querySelectorAll('*').forEach(n => n.shadowRoot && revertWalk(n.shadowRoot));
    })();

    console.log('Legend styles reverted and ::before killer styles removed.');
  }

  // Expose API
  global.legendStyler = { start, stop, revert, config };
})(window);

window.legendStyler.start({ delay: 3000, waitForDom: true });