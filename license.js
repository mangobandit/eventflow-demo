(() => {
  const CHECKOUT_SESSION_STORAGE = "eventflow-checkout-session-v1";
  const INSTALLATION_STORAGE = "eventflow-installation-id-v1";
  const ACTIVATION_STORAGE = "eventflow-activation-token-v1";

  const config = window.MXC_CONFIG || {};
  const apiBase = String(
    config.licenseApiBaseUrl ||
    (config.supabaseUrl ? `${String(config.supabaseUrl).replace(/\/$/, "")}/functions/v1` : ""),
  ).replace(/\/$/, "");

  const buyButtons = Array.from(document.querySelectorAll("[data-buy]"));
  const notice = document.getElementById("notice");
  const delivery = document.getElementById("delivery");
  const deliveryMessage = document.getElementById("delivery-message");
  const issueProgress = document.getElementById("issue-progress");
  const keyEnvelope = document.getElementById("key-envelope");
  const deliveredKey = document.getElementById("delivered-key");
  const keyActionStatus = document.getElementById("key-action-status");
  const copyKeyButton = document.getElementById("copy-key");
  const downloadKeyButton = document.getElementById("download-key");
  const activateDeliveredButton = document.getElementById("activate-delivered-key");
  const activationForm = document.getElementById("activation-form");
  const licenceKeyInput = document.getElementById("licence-key");
  const deviceLabelInput = document.getElementById("device-label");
  const activationStatus = document.getElementById("activation-status");
  const activationState = document.getElementById("activation-state");

  let revealedKey = "";

  buyButtons.forEach((button) => button.addEventListener("click", beginCheckout));
  copyKeyButton?.addEventListener("click", copyDeliveredKey);
  downloadKeyButton?.addEventListener("click", downloadDeliveredKey);
  activateDeliveredButton?.addEventListener("click", useDeliveredKey);
  activationForm?.addEventListener("submit", activateLicence);

  handleCheckoutReturn();
  validateStoredActivation();

  async function beginCheckout() {
    if (!apiBase) {
      showNotice("Checkout is not configured yet. Add the Supabase licensing endpoint in config.js.");
      return;
    }

    setBusy(buyButtons, true, "Opening checkout…");
    try {
      const response = await callApi("create-license-checkout", {});
      if (!response.body.url) throw new Error("Stripe Checkout did not return a payment link.");
      window.location.assign(response.body.url);
    } catch (error) {
      showNotice(error.message || "Checkout could not be opened. Please try again.");
      setBusy(buyButtons, false);
    }
  }

  function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const urlSessionId = params.get("session_id");

    if (urlSessionId) {
      storeCheckoutSession(urlSessionId);
      window.history.replaceState(null, "", "license.html?checkout=success");
    }

    if (checkout === "cancelled") {
      showNotice("Checkout was cancelled. Nothing was charged.");
      window.history.replaceState(null, "", "license.html");
      return;
    }

    const sessionId = urlSessionId || readCheckoutSession();
    if (checkout === "success" && sessionId) {
      delivery.hidden = false;
      delivery.scrollIntoView({ block: "start" });
      retrieveLicence(sessionId);
    }
  }

  async function retrieveLicence(sessionId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const response = await callApi("get-license", { session_id: sessionId }, [202]);
        if (response.status === 202 || response.body.pending) {
          deliveryMessage.textContent = "Payment is confirmed. Waiting for the signed Stripe event to finish issuing your key…";
          await wait(1_500);
          continue;
        }

        revealedKey = response.body.license_key;
        if (!revealedKey) throw new Error("The licence was issued without a delivery key.");
        deliveredKey.textContent = revealedKey;
        keyEnvelope.hidden = false;
        issueProgress.hidden = true;
        deliveryMessage.textContent = `Your licence is active for up to ${response.body.activation_limit} installations. Save the key before this secure delivery window closes.`;
        return;
      } catch (error) {
        issueProgress.hidden = true;
        deliveryMessage.textContent = error.message || "Your key could not be retrieved.";
        deliveryMessage.classList.add("error");
        return;
      }
    }

    issueProgress.hidden = true;
    deliveryMessage.textContent = "Key issuance is taking longer than expected. Refresh this page in a moment; your payment is safe.";
  }

  async function copyDeliveredKey() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setActionStatus("Licence key copied.");
    } catch {
      setActionStatus("Copy was blocked. Select the key above and copy it manually.", true);
    }
  }

  function downloadDeliveredKey() {
    if (!revealedKey) return;
    const contents = [
      "EventFlow licence",
      "=================",
      "",
      revealedKey,
      "",
      "Keep this key private. It can activate up to three installations.",
      "Purchase and activation portal: " + window.location.origin + window.location.pathname,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eventflow-licence.txt";
    link.click();
    URL.revokeObjectURL(url);
    setActionStatus("Licence file downloaded.");
  }

  function useDeliveredKey() {
    if (!revealedKey) return;
    licenceKeyInput.value = revealedKey;
    document.getElementById("activate").scrollIntoView({ behavior: "smooth", block: "start" });
    licenceKeyInput.focus({ preventScroll: true });
  }

  async function activateLicence(event) {
    event.preventDefault();
    const button = activationForm.querySelector("button[type='submit']");
    button.disabled = true;
    activationStatus.classList.remove("error");
    activationStatus.textContent = "Checking and binding this installation…";

    try {
      const response = await callApi("activate-license", {
        license_key: licenceKeyInput.value,
        installation_id: getInstallationId(),
        label: deviceLabelInput.value.trim(),
      });
      localStorage.setItem(ACTIVATION_STORAGE, response.body.activation_token);
      licenceKeyInput.value = "";
      setActivationState(
        true,
        `Active · ${response.body.active_activations} of ${response.body.activation_limit} installations used`,
      );
      activationStatus.textContent = "Licence activated. The raw key was not stored in this browser.";
    } catch (error) {
      activationStatus.textContent = error.message || "This licence could not be activated.";
      activationStatus.classList.add("error");
    } finally {
      button.disabled = false;
    }
  }

  async function validateStoredActivation() {
    const activationToken = localStorage.getItem(ACTIVATION_STORAGE);
    if (!activationToken || !apiBase) return;

    try {
      const response = await callApi("activate-license", {
        activation_token: activationToken,
        installation_id: getInstallationId(),
      });
      setActivationState(
        true,
        `Active · ${response.body.active_activations} of ${response.body.activation_limit} installations used`,
      );
    } catch {
      localStorage.removeItem(ACTIVATION_STORAGE);
      setActivationState(false, "No active licence on this browser");
    }
  }

  function getInstallationId() {
    let installationId = localStorage.getItem(INSTALLATION_STORAGE);
    if (!installationId) {
      installationId = crypto.randomUUID();
      localStorage.setItem(INSTALLATION_STORAGE, installationId);
    }
    return installationId;
  }

  function storeCheckoutSession(sessionId) {
    localStorage.setItem(CHECKOUT_SESSION_STORAGE, JSON.stringify({
      id: sessionId,
      saved_at: Date.now(),
    }));
  }

  function readCheckoutSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHECKOUT_SESSION_STORAGE) || "null");
      if (!saved?.id || Date.now() - Number(saved.saved_at || 0) > 31 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(CHECKOUT_SESSION_STORAGE);
        return "";
      }
      return saved.id;
    } catch {
      localStorage.removeItem(CHECKOUT_SESSION_STORAGE);
      return "";
    }
  }

  async function callApi(functionName, body, acceptedStatuses = []) {
    if (!apiBase) throw new Error("The licensing service is not configured.");
    const response = await fetch(`${apiBase}/${functionName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok && !acceptedStatuses.includes(response.status)) {
      throw new Error(responseBody.error || responseBody.message || "The licensing service returned an error.");
    }
    return { status: response.status, body: responseBody };
  }

  function setBusy(buttons, busy, busyLabel = "") {
    buttons.forEach((button) => {
      if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.innerHTML;
      button.disabled = busy;
      if (busy) button.textContent = busyLabel;
      else button.innerHTML = button.dataset.defaultLabel;
    });
  }

  function setActionStatus(message, isError = false) {
    keyActionStatus.textContent = message;
    keyActionStatus.classList.toggle("error", isError);
  }

  function setActivationState(active, message) {
    activationState.classList.toggle("active", active);
    activationState.querySelector("span:last-child").textContent = message;
  }

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
    window.setTimeout(() => {
      notice.hidden = true;
    }, 7_000);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
})();
