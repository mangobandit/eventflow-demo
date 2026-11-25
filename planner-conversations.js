const plannerConversationUI = (function createConversationUi() {
  "use strict";

  const pageSize = 100;
  const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function dateLabel(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.valueOf()) ? "" : dateFormat.format(date);
  }

  function closed(thread) {
    return Boolean(thread.revoked_at) || Date.parse(thread.expires_at) <= Date.now();
  }

  function awaiting(thread) {
    return !closed(thread) && thread.last_role === "client";
  }

  function threadState(thread) {
    if (thread.revoked_at) return "Link revoked";
    if (closed(thread)) return "Link expired";
    if (awaiting(thread)) return "Awaiting reply";
    return thread.last_role === "planner" ? "Planner replied" : "No messages yet";
  }

  function threadUrl(scope, thread, view) {
    const address = new URL(location.pathname, location.origin);
    address.searchParams.set("project", scope);
    address.searchParams.set("thread", thread);
    address.hash = view;
    return `${address.pathname}${address.search}${address.hash}`;
  }

  function renderThread(container, options) {
    const { title, role, load, send, closedLink = false, afterSend, permalink = "" } = options;
    let history = [];
    let loading = false;
    let sending = false;
    let loaded = false;
    let hasOlder = false;
    const label = role === "client" ? "Send message" : "Send reply";
    const button = role === "client" ? "workspace-client-button" : "secondary-action";
    const submitStyle = role === "client" ? button : "primary-action";

    container.innerHTML = `<header class="conversation-thread-head"><h3 tabindex="-1">${escape(title)}</h3>
      <div class="conversation-actions">
        ${permalink ? `<button type="button" class="${button}" data-conversation-copy>Copy thread link</button>` : ""}
        <button type="button" class="${button}" data-conversation-refresh>Refresh messages</button>
      </div></header>
      <p class="conversation-status" role="status"></p>
      <button type="button" class="${button} conversation-older" data-conversation-older hidden>Load earlier messages</button>
      <ol class="conversation-messages" aria-label="Messages" tabindex="0"></ol>
      ${closedLink ? '<p class="conversation-closed">This link is closed to new messages.</p>' : `<form class="conversation-compose">
        ${role === "client" ? '<label>Your name <input name="name" autocomplete="name" maxlength="120" required></label>' : ""}
        <label>${role === "client" ? "Message for your planner" : "Reply to client"} <textarea name="body" maxlength="2000" rows="3" required></textarea></label>
        <button type="submit" class="${submitStyle}">${label}</button>
      </form>`}`;

    const status = container.querySelector(".conversation-status");
    const list = container.querySelector(".conversation-messages");
    const refreshButton = container.querySelector("[data-conversation-refresh]");
    const olderButton = container.querySelector("[data-conversation-older]");
    const form = container.querySelector(".conversation-compose");
    const submit = form?.querySelector("button[type=submit]");

    function merge(rows) {
      history = [...new Map([...history, ...rows].map(message => [message.id, message])).values()]
        .sort((first, second) => Date.parse(first.created_at) - Date.parse(second.created_at) || first.id.localeCompare(second.id));
    }

    function paint(prepend = false) {
      const previousHeight = list.scrollHeight;
      const previousTop = list.scrollTop;
      const nearBottom = previousHeight - previousTop - list.clientHeight < 50;
      list.innerHTML = history.map(message => {
        const sender = message.name || (message.role === "planner" ? "Planner" : "Client");
        const isOwn = message.role === role;
        return `<li class="conversation-message${isOwn ? " conversation-message-own" : ""}">
          <div class="conversation-message-meta"><b>${escape(sender)}</b>
            <small>${message.role === "planner" ? "Planner" : "Client"}</small>
            <time datetime="${escape(message.created_at)}">${escape(dateLabel(message.created_at))}</time></div>
          <p>${escape(message.body)}</p>
        </li>`;
      }).join("") || (loaded ? '<li class="conversation-empty">No messages yet.</li>' : "");
      olderButton.hidden = !hasOlder;
      if (prepend) list.scrollTop = previousTop + list.scrollHeight - previousHeight;
      else if (nearBottom) list.scrollTop = list.scrollHeight;
    }

    async function refresh(older = false) {
      if (loading || sending) return;
      loading = true;
      refreshButton.disabled = olderButton.disabled = true;
      if (submit) submit.disabled = true;
      status.textContent = older ? "Opening earlier messages…" : "Loading messages…";
      try {
        const rows = await load(older ? history[0]?.id || null : null);
        if (!container.isConnected) return;
        const batch = Array.isArray(rows) ? rows : [];
        if (older || !loaded || !history.length) hasOlder = batch.length >= pageSize;
        loaded = true;
        merge(batch);
        paint(older);
        status.textContent = "";
      } catch (error) {
        if (container.isConnected) status.textContent = error.message || "Could not open this conversation.";
      } finally {
        loading = false;
        refreshButton.disabled = olderButton.disabled = false;
        if (submit) submit.disabled = false;
      }
    }

    refreshButton.addEventListener("click", () => refresh());
    olderButton.addEventListener("click", () => refresh(true));
    container.querySelector("[data-conversation-copy]")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(new URL(permalink, location.origin).href);
        status.textContent = "Private thread link copied.";
      } catch {
        status.textContent = "The browser could not copy the link.";
      }
    });
    form?.addEventListener("submit", async event => {
      event.preventDefault();
      if (sending || loading) return;
      const fields = new FormData(form);
      const name = String(fields.get("name") || "").trim();
      const body = String(fields.get("body") || "").trim();
      if (!body || (role === "client" && !name)) {
        status.textContent = role === "client" ? "Enter your name and a message." : "Enter a reply.";
        return;
      }

      sending = true;
      submit.disabled = refreshButton.disabled = olderButton.disabled = true;
      status.textContent = role === "client" ? "Sending message…" : "Sending reply…";
      try {
        const message = await send(name, body);
        if (!container.isConnected) return;
        if (!message?.id) throw new Error("The message could not be confirmed. Refresh before retrying.");
        merge([message]);
        loaded = true;
        form.elements.body.value = "";
        paint();
        list.scrollTop = list.scrollHeight;
        status.textContent = role === "client" ? "Message sent." : "Reply sent.";
        form.elements.body.focus({ preventScroll: true });
        afterSend?.();
      } catch (error) {
        if (container.isConnected) status.textContent = error.message || "The message could not be sent.";
      } finally {
        sending = false;
        submit.disabled = refreshButton.disabled = olderButton.disabled = false;
      }
    });
    refresh();
    const heading = container.querySelector("h3");
    return { refresh, focus: () => heading.focus(), rename: name => { heading.textContent = name; } };
  }

  function mountPlanner(container, { scope, token, view = "workspace-conversations" }) {
    const query = new URLSearchParams(location.search);
    const requested = query.get("project") === scope && validId.test(query.get("thread") || "") ? query.get("thread") : "";
    let selected = "";
    let onlyOutstanding = false;
    let threads = [];
    let loading = false;
    let queuedRefresh = false;
    let thread;
    let selectedClosed;

    container.innerHTML = `<header class="workspace-section-head"><h2>Client conversations</h2>
      <button type="button" class="secondary-action" data-conversations-reload>Refresh conversations</button></header>
      <p class="conversation-status" role="status"></p>
      <div class="conversation-layout">
        <section class="workspace-card conversation-inbox" aria-label="Project conversations">
          <div class="conversation-actions" role="group" aria-label="Filter conversations">
            <button class="secondary-action" type="button" data-conversations-filter="all" aria-pressed="true">All</button>
            <button class="secondary-action" type="button" data-conversations-filter="outstanding" aria-pressed="false">Awaiting reply <span data-conversations-count></span></button>
          </div>
          <nav class="conversation-links" aria-label="Client threads"></nav>
        </section>
        <section class="workspace-card conversation-thread" aria-label="Open conversation"></section>
      </div>`;

    const status = container.querySelector(".conversation-status");
    const inbox = container.querySelector(".conversation-links");
    const pane = container.querySelector(".conversation-thread");
    const update = container.querySelector("[data-conversations-reload]");
    const count = container.querySelector("[data-conversations-count]");

    function filtered() {
      return onlyOutstanding ? threads.filter(awaiting) : threads;
    }

    function drawList() {
      inbox.innerHTML = filtered().map(item => {
        const title = item.client_name || "Client link";
        const date = dateLabel(item.last_message_at);
        return `<a class="conversation-link" data-conversation-link="${escape(item.link_id)}" href="${escape(threadUrl(scope, item.link_id, view))}"
          ${selected === item.link_id ? 'aria-current="true"' : ""}>
          <b>${escape(title)}</b><small${awaiting(item) ? ' class="conversation-outstanding"' : ""}>${threadState(item)}</small>
          ${date ? `<time datetime="${escape(item.last_message_at)}">${escape(date)}</time>` : ""}
        </a>`;
      }).join("") || `<p>${onlyOutstanding ? "No conversations are awaiting a reply." : "No feedback links for this project. Enable client messages when you create a link."}</p>`;
      count.textContent = `(${threads.filter(awaiting).length})`;
      container.querySelectorAll("[data-conversations-filter]").forEach(button =>
        button.setAttribute("aria-pressed", String((button.dataset.conversationsFilter === "outstanding") === onlyOutstanding)));
    }

    function select(item, userSelected = false) {
      const id = item?.link_id || "";
      const isClosed = item ? closed(item) : false;
      const title = item?.client_name || "Client conversation";
      const url = id ? threadUrl(scope, id, view) : "";
      if (userSelected && url) window.history.replaceState(null, "", url);
      if (id === selected && thread && selectedClosed === isClosed) {
        thread.rename(title);
        if (userSelected) thread.focus();
        return;
      }

      selected = id;
      selectedClosed = isClosed;
      thread = null;
      drawList();
      if (!item) {
        pane.innerHTML = "<p>Select a client conversation.</p>";
        return;
      }

      const parameters = { p_token: token, p_scope: scope, p_link_id: id };
      pane.replaceChildren();
      const host = document.createElement("div");
      pane.append(host);
      thread = renderThread(host, {
        title, role: "planner", closedLink: isClosed, permalink: url,
        load: before => plannerRpc("planner_workspace_conversation", { ...parameters, p_before: before }),
        send: (_name, body) => plannerRpc("planner_workspace_reply", { ...parameters, p_body: body }),
        afterSend: () => {
          refreshThreads();
          if (typeof plannerUpdates !== "undefined") plannerUpdates.refresh(true);
        }
      });
      if (userSelected) thread.focus();
    }

    async function refreshThreads(refreshMessages = false) {
      if (loading) {
        queuedRefresh = true;
        return;
      }
      loading = true;
      update.disabled = true;
      status.textContent = "Loading conversations…";
      try {
        const result = await plannerRpc("planner_workspace_list_conversations", { p_token: token, p_scope: scope });
        if (!container.isConnected) return;
        threads = Array.isArray(result) ? result.filter(item => validId.test(item.link_id || "")) : [];
        const keep = threads.find(item => item.link_id === (selected || requested));
        const previous = thread;
        select(keep || threads.find(awaiting) || threads[0]);
        drawList();
        if (refreshMessages && previous && previous === thread) thread.refresh();
        status.textContent = "";
      } catch (error) {
        if (container.isConnected) status.textContent = error.message || "Could not load client conversations.";
      } finally {
        loading = false;
        update.disabled = false;
        if (queuedRefresh && container.isConnected) {
          queuedRefresh = false;
          refreshThreads();
        }
      }
    }

    update.addEventListener("click", () => refreshThreads(true));
    inbox.addEventListener("click", event => {
      const link = event.target.closest("[data-conversation-link]");
      if (!link || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      select(threads.find(item => item.link_id === link.dataset.conversationLink), true);
    });
    container.querySelectorAll("[data-conversations-filter]").forEach(button => button.addEventListener("click", () => {
      onlyOutstanding = button.dataset.conversationsFilter === "outstanding";
      const current = filtered().find(item => item.link_id === selected);
      select(current || filtered()[0]);
      drawList();
    }));
    refreshThreads();
  }

  function mountClient(container, { token, client }) {
    async function rpc(operation, fields) {
      const { data, error } = await client.rpc(operation, { p_link: token, ...fields });
      if (error?.code === "28000") throw new Error("This link is no longer available. Ask your planner for a new one.");
      if (error) throw new Error("This conversation could not be updated. Try again.");
      return data;
    }

    return renderThread(container, {
      title: "Messages with your planner", role: "client",
      load: before => rpc("planner_workspace_client_messages", { p_before: before }),
      send: (name, body) => rpc("planner_workspace_client_send", { p_name: name, p_body: body })
    });
  }

  return { mountPlanner, mountClient };
})();

function renderPlannerConversations(container, context) { plannerConversationUI.mountPlanner(container, context); }
function renderPlannerClientConversation(container, context) { plannerConversationUI.mountClient(container, context); }
