(() => {
    const log = (...args) => console.log("[HA gap fix]", ...args);

    const deepQuerySelectorAll = (root, selector) => {
      const elements = [];
      const traverse = node => {
        if (node.shadowRoot) traverse(node.shadowRoot);
        if (node.querySelectorAll) node.querySelectorAll(selector).forEach(el => elements.push(el));
        node.childNodes.forEach(traverse);
      };
      traverse(root);
      return elements;
    };

    const fixGaps = () => {
      const root = document.querySelector('home-assistant');
      if (!root) return log("Home Assistant root not found.");

      const stacks = deepQuerySelectorAll(root, 'hui-horizontal-stack-card');

      stacks.forEach(stack => {
        const shadow = stack.shadowRoot;
        if (!shadow) return;

        const rootDiv = shadow.querySelector('#root');
        if (!rootDiv) return;

        const buttonCards = rootDiv.querySelectorAll('hui-card, hui-button-card');
        let matchFound = false;

        buttonCards.forEach(card => {
          const cardShadow = card.shadowRoot;
          if (!cardShadow) return;

          const labelSpan = cardShadow.querySelector('span[title]');
          const label = labelSpan?.textContent?.toLowerCase() || '';

          if (label.includes('calendar') || label.includes('chores')) {
            matchFound = true;
          }
        });

        if (matchFound) {
          rootDiv.style.gap = '0px';
          rootDiv.style.margin = '0px';
          rootDiv.style.padding = '0px';

          const cards = shadow.querySelectorAll('ha-card, hui-card');
          cards.forEach(card => {
            card.style.margin = '0px';
            card.style.padding = '0px';
          });

          log("✅ Gap removed from stack containing Calendar or Chores.");
        }
      });
    };

    const scheduleFix = () => {
      if (document.readyState === "complete") {
        setTimeout(fixGaps, 500);
      } else {
        window.addEventListener("load", () => setTimeout(fixGaps, 500));
      }

      // Optional: re-run on navigation
      window.addEventListener("location-changed", () => setTimeout(fixGaps, 500));
    };

    scheduleFix();
  })();
