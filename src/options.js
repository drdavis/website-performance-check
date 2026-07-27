// src/options.js
const DEFAULTS = { orModel: "anthropic/claude-3.5-haiku", locationCode: 2840, languageCode: "en" };
const FIELDS = ["dfLogin", "dfPassword", "orKey", "orModel", "locationCode", "languageCode"];

async function load() {
  const s = await chrome.storage.local.get(null);
  const merged = { ...DEFAULTS, ...s };
  for (const id of FIELDS) {
    const el = document.getElementById(id);
    if (el && merged[id] !== undefined && merged[id] !== null) el.value = merged[id];
  }
}

async function save() {
  const data = {};
  for (const id of FIELDS) data[id] = document.getElementById(id).value.trim();
  data.locationCode = Number(data.locationCode) || DEFAULTS.locationCode;
  data.languageCode = data.languageCode || DEFAULTS.languageCode;
  data.orModel = data.orModel || DEFAULTS.orModel;
  await chrome.storage.local.set(data);
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
}

document.getElementById("save").addEventListener("click", save);
load();
