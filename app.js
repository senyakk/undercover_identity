const signupForm = document.querySelector("#signupForm");
const tokenForm = document.querySelector("#tokenForm");
const statusLine = document.querySelector("#statusLine");
const resultBox = document.querySelector("#resultBox");
const romanceOkInput = document.querySelector("#romanceOk");
const partnerNameField = document.querySelector("#partnerNameField");
const partnerNameInput = partnerNameField.querySelector("input");

const params = new URLSearchParams(window.location.search);
const tokenFromUrl = params.get("token");

init();

romanceOkInput.addEventListener("change", syncPartnerField);

async function init() {
  syncPartnerField();
  await refreshState();
  if (tokenFromUrl) {
    await reveal(tokenFromUrl);
  }
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = signupForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Requesting...";

  try {
    const form = new FormData(signupForm);
    const partnerName = String(form.get("partnerName") || "").trim();
    const payload = {
      name: form.get("name"),
      attendance: form.get("attendance"),
      partnerName,
      romanceOk: form.has("romanceOk"),
      musicOk: form.has("musicOk"),
      cameraOk: form.has("cameraOk"),
      foodDrinkOk: form.has("foodDrinkOk")
    };

    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Signup failed");

    signupForm.reset();
    syncPartnerField();
    showSignupSuccess(data.revealUrl, data.revealCode, data.assignment);
    await refreshState();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Request dossier";
  }
});

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(tokenForm);
  const token = extractToken(form.get("token"));
  if (token) await reveal(token);
});

async function refreshState() {
  try {
    const response = await fetch("/api/state");
    const data = await response.json();
    const label = data.drawComplete
      ? `Draw complete. ${data.participantCount} agents are in the field. Late signup is still open.`
      : `${data.participantCount} agent${data.participantCount === 1 ? "" : "s"} registered. Draw pending.`;
    statusLine.textContent = label;
  } catch {
    statusLine.textContent = "Agency channel offline. Try again in a moment.";
  }
}

async function reveal(token) {
  try {
    resultBox.className = "result empty";
    resultBox.textContent = "Opening private channel...";
    const response = await fetch(`/api/reveal?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Reveal failed");

    if (!data.drawComplete) {
      resultBox.className = "result empty";
      resultBox.innerHTML = `
        <h3>Dossier registered</h3>
        <p>${escapeHtml(data.name)}, your cover is not cleared yet. Return with this link after Mission Control runs the draw.</p>
      `;
      return;
    }

    renderAssignment(data.assignment);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function renderAssignment(assignment) {
  resultBox.className = "result";
  resultBox.innerHTML = assignmentHtml(assignment);
}

function assignmentHtml(assignment) {
  return `
    <h3>CLASSIFIED DOSSIER</h3>
    <dl>
      <div>
        <dt>Undercover identity</dt>
        <dd>${escapeHtml(identityLabel(assignment))}</dd>
      </div>
      ${assignment.stabbingTarget ? `
        <div>
          <dt>Stabbing target</dt>
          <dd>${escapeHtml(assignment.stabbingTarget)}</dd>
          <dd class="hint">You are given one person to stab during the party. You only know their role. Find out their name and secretly report to the organisers.</dd>
        </div>
      ` : ""}
      <div>
        <dt>Mission</dt>
        <dd>${escapeHtml(assignment.mission)}</dd>
      </div>
      ${assignment.outfit ? `
        <div>
          <dt>Disguise inspiration</dt>
          <dd>${escapeHtml(assignment.outfit)}</dd>
          <dd class="hint">This is only a recommendation or inspiration. Wear whatever works for you.</dd>
        </div>
      ` : ""}
      <div>
        <dt>Bonus objective</dt>
        <dd>${escapeHtml(assignment.bonus)}</dd>
      </div>
      <div>
        <dt>If exposed</dt>
        <dd>Deny everything. Then commit harder.</dd>
      </div>
    </dl>
  `;
}

function showSignupSuccess(revealUrl, revealCode, assignment = null) {
  resultBox.className = "result";
  resultBox.innerHTML = `
    <h3>Dossier link issued</h3>
    <p>${assignment ? "The draw has already run, so your role is ready now. Save this private link too." : "Save this private link. It is your only normal way back into the reveal channel."}</p>
    <div class="copy-row">
      <input value="${escapeAttribute(revealUrl)}" readonly aria-label="Private reveal link">
      <button type="button" id="copyLink">Copy</button>
    </div>
    <p class="microcopy">Reveal code: <strong>${escapeHtml(revealCode)}</strong></p>
    ${assignment ? assignmentHtml(assignment) : ""}
  `;

  document.querySelector("#copyLink").addEventListener("click", async () => {
    await navigator.clipboard.writeText(revealUrl);
    document.querySelector("#copyLink").textContent = "Copied";
  });
}

function identityLabel(assignment) {
  return assignment.identity
    ? `${assignment.title} (${assignment.identity})`
    : assignment.title;
}

function showMessage(message, isError = false) {
  resultBox.className = isError ? "result" : "result empty";
  resultBox.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function extractToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return normalizeRevealCode(url.searchParams.get("token") || raw);
  } catch {
    return normalizeRevealCode(raw);
  }
}

function normalizeRevealCode(value) {
  const code = String(value || "").trim();
  return /^[a-z]{5}$/i.test(code) ? code.toUpperCase() : code;
}

function syncPartnerField() {
  const enabled = romanceOkInput.checked;
  partnerNameField.hidden = !enabled;
  partnerNameInput.disabled = !enabled;
  if (!enabled) partnerNameInput.value = "";
}
