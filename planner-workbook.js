const plannerWorkbook = (() => {
  let session;
  let worksheets;
  let request;
  let loadError;
  let selectedName;
  let search;

  function reset() {
    session = null;
    worksheets = null;
    request = null;
    loadError = false;
    selectedName = null;
    search = "";
  }

  function makeElement(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function displayCell(value) {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return value == null ? "" : String(value);
  }

  function workbookLink(target) {
    if (typeof target !== "string") return null;
    try {
      const url = new URL(target);
      return ["https:", "http:", "mailto:"].includes(url.protocol) ? url : null;
    } catch (_error) {
      return null;
    }
  }

  function worksheetCell(sheet, address, value) {
    const text = displayCell(value);
    const url = workbookLink(sheet.payload.links?.[address]);
    const cell = makeElement("td", null, url ? null : text);
    if (url) {
      const link = makeElement("a", "planner-workbook-link", text || url.href);
      link.href = url.href;
      if (url.protocol !== "mailto:") {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      cell.append(link);
    }
    const formula = sheet.payload.formulas?.[address];
    if (typeof formula === "string" && formula) {
      const details = makeElement("details", "planner-workbook-formula");
      const summary = makeElement("summary", null, "Formula");
      summary.setAttribute("aria-label", `Formula in ${address}`);
      details.append(summary, makeElement("code", null, formula.startsWith("=") ? formula : `=${formula}`));
      cell.append(details);
    }
    return cell;
  }

  async function load(token) {
    try {
      const result = await plannerRpc("planner_load_workbook", { p_session_token: token });
      if (session !== token) return;
      worksheets = Array.isArray(result) ? [...result].sort((a, b) => a.position - b.position) : [];
      loadError = false;
    } catch (_error) {
      if (session === token) loadError = true;
    } finally {
      if (session === token) request = null;
    }
  }

  async function downloadSource(token, button) {
    button.disabled = true;
    button.textContent = "Preparing workbook…";
    try {
      const source = await plannerRpc("planner_load_workbook_source", { p_session_token: token });
      if (session !== token) return;
      if (!source?.name || !source?.content) throw new Error("The workbook copy is unavailable.");

      const bytes = Uint8Array.from(atob(source.content), character => character.charCodeAt(0));
      const file = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const objectUrl = URL.createObjectURL(file);
      const link = makeElement("a");
      link.href = objectUrl;
      link.download = source.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (error) {
      if (session === token) toast(error.message || "The workbook could not be downloaded.", true);
    } finally {
      button.textContent = "Download workbook";
      button.disabled = false;
    }
  }

  function worksheetTable(sheet, rows) {
    const region = makeElement("div", "planner-workbook-scroll");
    region.tabIndex = 0;
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", `${sheet.name} worksheet rows`);
    const table = makeElement("table", "planner-workbook-table");
    const header = table.createTHead().insertRow();
    for (const title of ["Row", ...sheet.payload.columns]) {
      const cell = makeElement("th", null, title);
      cell.scope = "col";
      header.append(cell);
    }
    const body = table.createTBody();
    for (const [sourceRow, values] of rows) {
      const row = document.createElement("tr");
      const rowLabel = makeElement("th", "planner-workbook-row-number", sourceRow);
      rowLabel.scope = "row";
      row.append(rowLabel);
      for (let index = 0; index < sheet.payload.columns.length; index += 1) {
        const address = `${sheet.payload.columns[index]}${sourceRow}`;
        row.append(worksheetCell(sheet, address, values[index]));
      }
      body.append(row);
    }
    region.append(table);
    return region;
  }

  function drawingLabels(drawings) {
    const section = makeElement("section", "planner-workbook-drawings");
    const list = makeElement("ul", "planner-workbook-labels");
    for (const drawing of drawings) {
      const item = makeElement("li", null, drawing.text);
      if (drawing.anchor) item.append(makeElement("small", null, `Position ${drawing.anchor}`));
      list.append(item);
    }
    section.append(makeElement("h3", null, "Drawing labels"), list);
    return section;
  }

  function isWorkbookJpeg(value) {
    return typeof value === "string" && value.length >= 8 && value.length <= 500000 &&
      value.length % 4 === 0 && value.startsWith("/9j/") && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
  }

  function worksheetImages(images) {
    const section = makeElement("section", "planner-workbook-images");
    const gallery = makeElement("div", "planner-workbook-gallery");
    for (const { label, jpeg } of images) {
      const name = displayCell(label).trim() || "Image from the workbook";
      const figure = makeElement("figure");
      const image = makeElement("img");
      image.alt = name;
      image.loading = "lazy";
      image.decoding = "async";
      image.src = `data:image/jpeg;base64,${jpeg}`;
      figure.append(image, makeElement("figcaption", null, name));
      gallery.append(figure);
    }
    section.append(makeElement("h3", null, "Workbook images"), gallery);
    return section;
  }

  function render(container, { token }) {
    if (session !== token) {
      reset();
      session = token;
    }
    const section = makeElement("section", "workspace-card planner-workbook");
    const header = makeElement("header", "planner-workbook-header");
    const download = makeElement("button", "secondary-action", "Download workbook");
    download.type = "button";
    download.addEventListener("click", () => downloadSource(token, download));
    header.append(makeElement("h2", "planner-workbook-heading", "South Africa workbook"), download);
    section.append(header);
    container.replaceChildren(section);

    function paint() {
      if (!section.isConnected || session !== token) return;
      download.hidden = !worksheets?.length;
      section.replaceChildren(header);
      if (loadError) {
        const message = makeElement("p", "empty-state", "The workbook could not load.");
        message.setAttribute("role", "alert");
        const retry = makeElement("button", "secondary-action", "Try again");
        retry.type = "button";
        retry.addEventListener("click", () => {
          loadError = false;
          paint();
        });
        section.append(message, retry);
        return;
      }
      if (!worksheets) {
        const loading = makeElement("p", null, "Loading workbook…");
        loading.setAttribute("role", "status");
        section.append(loading);
        if (!request) request = load(token);
        request.then(paint);
        return;
      }
      if (!worksheets.length) {
        section.append(makeElement("p", "empty-state", "No worksheets are available."));
        return;
      }

      const picker = makeElement("select");
      picker.setAttribute("aria-label", "Worksheet");
      const field = makeElement("label", "form-label", "Worksheet");
      const filter = makeElement("input");
      filter.type = "search";
      filter.value = search;
      const filterField = makeElement("label", "form-label", "Search this worksheet");
      field.append(picker);
      filterField.append(filter);
      const controls = makeElement("div", "planner-workbook-controls");
      controls.append(field, filterField);
      for (const worksheet of worksheets) {
        const option = makeElement("option", null, worksheet.name);
        option.value = worksheet.name;
        picker.append(option);
      }
      if (worksheets.some(sheet => sheet.name === selectedName)) picker.value = selectedName;
      const status = makeElement("p", "planner-workbook-status");
      status.setAttribute("role", "status");
      const content = makeElement("div", "planner-workbook-content");
      section.append(controls, status, content);

      function drawWorksheet() {
        selectedName = picker.value;
        const sheet = worksheets.find(worksheet => worksheet.name === selectedName);
        const query = search.trim().toLocaleLowerCase();
        const matches = value => displayCell(value).toLocaleLowerCase().includes(query);
        const rows = query ? sheet.payload.rows.filter(([number, values]) => matches(number) ||
          sheet.payload.columns.some((column, index) => {
            const address = `${column}${number}`;
            return matches(values[index]) || matches(sheet.payload.links?.[address]) || matches(sheet.payload.formulas?.[address]);
          })) : sheet.payload.rows;
        const labels = sheet.payload.drawings || [];
        const drawings = query ? labels.filter(drawing => matches(drawing.text) || matches(drawing.anchor)) : labels;
        const availableImages = Array.isArray(sheet.payload.images) ? sheet.payload.images : [];
        const images = availableImages.filter(image => isWorkbookJpeg(image?.jpeg) && (!query || matches(image.label)));
        const rowCount = `${rows.length} ${rows.length === 1 ? "row" : "rows"}`;
        const counts = [query ? `${rowCount} of ${sheet.payload.rows.length}` : rowCount];
        if (drawings.length) counts.push(`${drawings.length} drawing ${drawings.length === 1 ? "label" : "labels"}`);
        if (images.length) counts.push(`${images.length} ${images.length === 1 ? "image" : "images"}`);
        status.textContent = counts.join(" · ");
        content.replaceChildren();
        if (rows.length) content.append(worksheetTable(sheet, rows));
        if (drawings.length) content.append(drawingLabels(drawings));
        if (images.length) content.append(worksheetImages(images));
        if (!rows.length && !drawings.length && !images.length) content.append(makeElement("p", "empty-state", query ? "No matches in this worksheet." : "This worksheet is empty."));
      }

      picker.addEventListener("change", () => {
        search = "";
        filter.value = "";
        drawWorksheet();
      });
      filter.addEventListener("input", () => {
        search = filter.value;
        drawWorksheet();
      });
      drawWorksheet();
    }

    paint();
  }

  reset();
  return { render, reset };
})();

function renderPlannerWorkbook(container, context) {
  plannerWorkbook.render(container, context);
}

function resetPlannerWorkbook() {
  plannerWorkbook.reset();
}
