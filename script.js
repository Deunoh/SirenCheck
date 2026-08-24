const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";

const form = document.getElementById("search-form");
const input = document.getElementById("query-input");
const button = document.getElementById("search-btn");
const errorEl = document.getElementById("error-message");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");
const historyListEl = document.getElementById("history-list");

const HISTORY_KEY = "sirencheck:history";
const HISTORY_MAX = 6;

const EFFECTIF_LABELS = {
  NN: "Effectif non renseigné",
  "00": "0 salarié",
  "01": "1 à 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  11: "10 à 19 salariés",
  12: "20 à 49 salariés",
  21: "50 à 99 salariés",
  22: "100 à 199 salariés",
  31: "200 à 249 salariés",
  32: "250 à 499 salariés",
  41: "500 à 999 salariés",
  42: "1 000 à 1 999 salariés",
  51: "2 000 à 4 999 salariés",
  52: "5 000 à 9 999 salariés",
  53: "10 000 salariés et plus",
};

const FORME_JURIDIQUE_LABELS = {
  1000: "Entrepreneur individuel",
  5202: "SNC",
  5410: "SARL",
  5498: "SARL",
  5499: "SARL",
  5505: "SA à conseil d'administration",
  5599: "SA",
  5710: "SAS",
  5720: "SASU",
  5800: "SE (société européenne)",
  6100: "Caisse d'épargne",
  6540: "Société coopérative",
  9220: "Association déclarée",
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

input.addEventListener("input", () => {
  if (input.value.trim() === "") {
    hideError();
    hideResult();
    renderHistory();
  } else {
    hideHistory();
  }
});

renderHistory();

function runSearch() {
  const raw = input.value.replace(/\s|\./g, "");
  hideError();
  hideResult();
  hideHistory();

  if (!/^\d{9}(\d{5})?$/.test(raw)) {
    showError("Merci de saisir un SIREN (9 chiffres) ou un SIRET (14 chiffres) valide.");
    return;
  }

  setLoading(true);

  const url = `${API_BASE}?q=${encodeURIComponent(raw)}&per_page=1`;

  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("network");
      return res.json();
    })
    .then((data) => {
      const company = data.results && data.results[0];
      if (!company) {
        showError("Aucune entreprise trouvée pour ce numéro.");
        return;
      }
      renderCompany(company, raw);
      addToHistory(raw, company);
    })
    .catch(() => {
      showError("Impossible de contacter l'API. Réessayez dans un instant.");
    })
    .finally(() => setLoading(false));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // localStorage indisponible (navigation privée, quota) : on ignore silencieusement
  }
}

function addToHistory(query, company) {
  const list = loadHistory().filter((entry) => entry.query !== query);
  list.unshift({ query, name: company.nom_complet || null, company });
  saveHistory(list.slice(0, HISTORY_MAX));
}

function renderHistory() {
  const list = loadHistory();
  if (list.length === 0) {
    hideHistory();
    return;
  }

  historyListEl.innerHTML = list
    .map((entry, i) => {
      const numberLabel = entry.query.length === 14 ? formatSiret(entry.query) : formatSiren(entry.query);
      return `
        <button type="button" class="history-item" data-index="${i}">
          <span class="history-name">${escapeHtml(entry.name || "Nom inconnu")}</span>
          <span class="history-num">${numberLabel}</span>
        </button>
      `;
    })
    .join("");

  historyEl.hidden = false;
}

function hideHistory() {
  historyEl.hidden = true;
}

historyListEl.addEventListener("click", (event) => {
  const btn = event.target.closest(".history-item");
  if (!btn) return;
  const list = loadHistory();
  const entry = list[Number(btn.dataset.index)];
  if (!entry) return;

  input.value = entry.query;
  hideError();
  hideHistory();
  renderCompany(entry.company, entry.query);
});

function setLoading(isLoading) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "Recherche..." : "Rechercher";
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

function hideResult() {
  resultEl.hidden = true;
  resultEl.innerHTML = "";
}

function renderCompany(company, queried) {
  const isSiret = queried.length === 14;
  const etablissement = isSiret && company.matching_etablissements && company.matching_etablissements[0]
    ? company.matching_etablissements[0]
    : company.siege;

  const isActive = company.etat_administratif === "A";
  const tvaNumbers = company.tva;
  const hasTva = Array.isArray(tvaNumbers) && tvaNumbers.length > 0;

  const adresse = etablissement
    ? etablissement.adresse || [etablissement.code_postal, etablissement.libelle_commune].filter(Boolean).join(" ")
    : "Adresse non disponible";

  const effectifLabel = EFFECTIF_LABELS[company.tranche_effectif_salarie] || "Non renseigné";
  const formeLabel = FORME_JURIDIQUE_LABELS[company.nature_juridique] || `Code ${company.nature_juridique || "n/c"}`;
  const dateCreation = formatDate(company.date_creation);

  resultEl.innerHTML = `
    <div class="result-header">
      <h2 class="result-name">${escapeHtml(company.nom_complet || "—")}</h2>
      <p class="result-sub">SIREN ${formatSiren(company.siren)}${isSiret ? ` · SIRET ${formatSiret(queried)}` : ""}</p>
      <div class="badges">
        <span class="badge ${isActive ? "green" : "red"}">
          ${isActive ? "Active" : "Cessée"}
        </span>
        <span class="badge amber">${escapeHtml(formeLabel)}</span>
      </div>
    </div>

    <div class="tva-panel ${hasTva ? "assujetti" : "non-assujetti"}">
      <span class="tva-icon">${hasTva ? "✓" : "!"}</span>
      <div>
        <p class="tva-title">${hasTva ? "Assujettie à la TVA" : "Non assujettie à la TVA (ou non renseigné)"}</p>
        <p class="tva-detail">
          ${hasTva
            ? `N° de TVA intracommunautaire actif : ${escapeHtml(tvaNumbers[0])}`
            : "Aucun numéro de TVA intracommunautaire actif recensé (franchise en base ou donnée absente)."}
        </p>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <span class="label">Date de création</span>
        <span class="value">${dateCreation}</span>
      </div>
      <div class="info-item">
        <span class="label">Effectif</span>
        <span class="value">${escapeHtml(effectifLabel)}</span>
      </div>
      <div class="info-item">
        <span class="label">Activité principale (APE)</span>
        <span class="value">${escapeHtml(company.activite_principale || "n/c")}</span>
      </div>
      <div class="info-item">
        <span class="label">Nombre d'établissements</span>
        <span class="value">${company.nombre_etablissements ?? "n/c"} (dont ${company.nombre_etablissements_ouverts ?? 0} ouverts)</span>
      </div>
      <div class="info-item full">
        <span class="label">Adresse ${isSiret ? "de l'établissement" : "du siège"}</span>
        <span class="value">${escapeHtml(adresse)}</span>
      </div>
    </div>
  `;

  resultEl.hidden = false;
}

function formatSiren(siren) {
  if (!siren) return "n/c";
  return siren.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

function formatSiret(siret) {
  if (!siret || siret.length !== 14) return siret;
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`;
}

function formatDate(isoDate) {
  if (!isoDate) return "n/c";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
