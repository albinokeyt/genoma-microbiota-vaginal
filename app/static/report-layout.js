(function (root) {
  function paginate(report) {
    if (!report.offsetHeight || report.dataset.paginated === "true" || report.dataset.layoutError) return;
    const original = report.innerHTML;
    delete report.dataset.layoutError;
    try {
      for (const source of [...report.querySelectorAll(".report-page")]) {
        const header = source.querySelector(".report-header");
        const footer = source.querySelector(".report-footer");
        const queue = [...source.children].filter((node) => node !== header && node !== footer);
        const makeBody = (page) => {
          const body = document.createElement("div");
          body.className = "report-body";
          page.insertBefore(body, page.querySelector(".report-footer"));
          return body;
        };
        queue.forEach((node) => node.remove());
        let page = source;
        let body = makeBody(page);
        let section = null;
        const fits = () => !body.lastElementChild || body.lastElementChild.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom - 3;
        const hasContent = () => [...body.children].some((node) => !node.matches(".report-section-title"));
        const nextPage = (repeatSection = false) => {
          const orphan = body.lastElementChild?.matches(".report-section-title") ? body.lastElementChild : null;
          if (orphan) orphan.remove();
          if (!hasContent()) throw new Error("Un bloque supera el espacio disponible en A4.");
          const next = source.cloneNode(false);
          next.append(header.cloneNode(true), footer.cloneNode(true));
          page.after(next);
          page = next;
          body = makeBody(page);
          if (orphan) body.append(orphan);
          else if (repeatSection && section) body.append(section.cloneNode(true));
        };

        while (queue.length) {
          const node = queue.shift();
          if (node.matches(".report-section-title")) section = node;
          body.append(node);
          if (fits()) continue;

          if (node.matches(".finding-board") && node.children.length > 1) {
            const remainder = node.cloneNode(false);
            while (!fits() && node.children.length) remainder.prepend(node.lastElementChild);
            if (!node.children.length) node.remove();
            nextPage(true);
            queue.unshift(remainder);
            continue;
          }

          if (node.matches("table") && node.tBodies[0]?.rows.length > 1) {
            const remainder = node.cloneNode(true);
            remainder.tBodies[0].replaceChildren();
            const moveRow = () => remainder.tBodies[0].prepend(node.tBodies[0].lastElementChild);
            while (!fits() && node.tBodies[0].rows.length) moveRow();
            // Avoid a continuation containing only one or two table rows.
            while (remainder.tBodies[0].rows.length < 3 && node.tBodies[0].rows.length > 3) moveRow();
            if (node.tBodies[0].rows.length < 3) {
              const rows = [...node.tBodies[0].rows, ...remainder.tBodies[0].rows];
              remainder.tBodies[0].replaceChildren(...rows);
              node.remove();
            }
            nextPage(true);
            queue.unshift(remainder);
            continue;
          }

          node.remove();
          if (hasContent()) {
            nextPage();
            queue.unshift(node);
            continue;
          }

          if (node.matches(".text-panel, .legal-note")) {
            const text = [...node.childNodes].map((child) => child.nodeName === "BR" ? "\n" : child.textContent).join("");
            const words = text.match(/\S+\s*/g) || [];
            let low = 0, high = words.length;
            node.style.whiteSpace = "pre-wrap";
            body.append(node);
            while (low < high) {
              const count = Math.ceil((low + high) / 2);
              node.textContent = words.slice(0, count).join("");
              if (fits()) low = count;
              else high = count - 1;
            }
            if (!low) throw new Error("No hay espacio para el texto del informe.");
            node.textContent = words.slice(0, low).join("");
            const remainder = node.cloneNode(false);
            remainder.textContent = words.slice(low).join("");
            nextPage(true);
            queue.unshift(remainder);
            continue;
          }
          throw new Error("Un bloque supera el espacio disponible en A4.");
        }
      }
      report.querySelectorAll(".report-footer b").forEach((counter, index) => { counter.textContent = index + 1; });
      report.dataset.paginated = "true";
    } catch (error) {
      report.innerHTML = original;
      report.dataset.layoutError = error.message;
    }
  }
  root.ReportLayout = { paginate };
})(window);
