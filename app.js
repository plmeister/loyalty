```javascript
import {
  BrowserMultiFormatReader,
  BarcodeFormat
} from "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";


const STORAGE_KEY = "my-loyalty-cards-v1";
const THEME_KEY = "my-loyalty-cards-theme";

let cards = loadCards();

let scannerReader = null;
let scannerControls = null;

let wakeLock = null;
let currentViewerCardId = null;


/* -------------------------------------------------------------------------- */
/* DOM                                                                         */
/* -------------------------------------------------------------------------- */

const cardList = document.getElementById("cardList");
const emptyState = document.getElementById("emptyState");

const cardModal = document.getElementById("cardModal");
const modalTitle = document.getElementById("modalTitle");
const cardForm = document.getElementById("cardForm");

const cardId = document.getElementById("cardId");
const cardName = document.getElementById("cardName");
const cardCode = document.getElementById("cardCode");
const cardType = document.getElementById("cardType");
const cardColour = document.getElementById("cardColour");

const scannerModal = document.getElementById("scannerModal");
const scannerVideo = document.getElementById("scannerVideo");
const scannerStatus = document.getElementById("scannerStatus");

const viewer = document.getElementById("viewer");
const viewerCardName = document.getElementById("viewerCardName");
const viewerBarcode = document.getElementById("viewerBarcode");
const viewerQr = document.getElementById("viewerQr");
const viewerCodeValue = document.getElementById("viewerCodeValue");


/* -------------------------------------------------------------------------- */
/* Theme                                                                       */
/* -------------------------------------------------------------------------- */

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);

  if (saved === "light" || saved === "dark") {
    document.documentElement.dataset.theme = saved;
  } else {
    document.documentElement.dataset.theme = "dark";
  }

  updateThemeButton();
}

function toggleTheme() {
  const current =
    document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark";

  const next = current === "dark" ? "light" : "dark";

  document.documentElement.dataset.theme = next;

  localStorage.setItem(THEME_KEY, next);

  updateThemeButton();
}

function updateThemeButton() {
  const button = document.getElementById("themeToggle");

  const isLight =
    document.documentElement.dataset.theme === "light";

  button.textContent = isLight ? "🌙" : "☀️";
  button.setAttribute(
    "aria-label",
    isLight
      ? "Switch to dark theme"
      : "Switch to light theme"
  );
}


/* -------------------------------------------------------------------------- */
/* Storage                                                                      */
/* -------------------------------------------------------------------------- */

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCards() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(cards)
  );
}


/* -------------------------------------------------------------------------- */
/* Rendering                                                                    */
/* -------------------------------------------------------------------------- */

function renderCards() {
  cardList.innerHTML = "";

  emptyState.classList.toggle(
    "hidden",
    cards.length !== 0
  );

  for (const card of cards) {
    const element = document.createElement("article");

    element.className = "card-item";

    element.innerHTML = `
      <div
        class="card-colour"
        style="background:${escapeHtml(card.colour)}"
      ></div>

      <div class="card-info">
        <div class="card-name">
          ${escapeHtml(card.name)}
        </div>

        <div class="card-code">
          ${escapeHtml(formatTypeName(card.type))}
          ·
          ${escapeHtml(card.code)}
        </div>
      </div>

      <div class="card-buttons">
        <button
          type="button"
          class="view-card-button"
          data-id="${escapeHtml(card.id)}"
          aria-label="Show card"
        >▣</button>

        <button
          type="button"
          class="edit-card-button"
          data-id="${escapeHtml(card.id)}"
          aria-label="Edit card"
        >✎</button>
      </div>
    `;

    cardList.appendChild(element);
  }
}

function formatTypeName(type) {
  switch (type) {
    case "EAN13":
      return "EAN-13";

    case "EAN8":
      return "EAN-8";

    case "UPC":
      return "UPC-A";

    case "CODE128":
      return "Code 128";

    case "QR":
      return "QR Code";

    default:
      return type;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* -------------------------------------------------------------------------- */
/* Add / edit cards                                                             */
/* -------------------------------------------------------------------------- */

function openAddCard() {
  modalTitle.textContent = "Add Card";

  cardId.value = "";
  cardName.value = "";
  cardCode.value = "";
  cardType.value = "EAN13";
  cardColour.value = "#2d7d46";

  cardModal.classList.remove("hidden");

  setTimeout(() => cardName.focus(), 50);
}

function openEditCard(id) {
  const card = cards.find(c => c.id === id);

  if (!card) {
    return;
  }

  modalTitle.textContent = "Edit Card";

  cardId.value = card.id;
  cardName.value = card.name;
  cardCode.value = card.code;
  cardType.value = card.type;
  cardColour.value = card.colour || "#2d7d46";

  cardModal.classList.remove("hidden");
}

function closeCardModal() {
  cardModal.classList.add("hidden");
}

function saveCardFromForm(event) {
  event.preventDefault();

  const id = cardId.value || crypto.randomUUID();

  const card = {
    id,
    name: cardName.value.trim(),
    code: cardCode.value.trim(),
    type: cardType.value,
    colour: cardColour.value
  };

  if (!card.name || !card.code) {
    return;
  }

  const existingIndex = cards.findIndex(
    existing => existing.id === id
  );

  if (existingIndex >= 0) {
    cards[existingIndex] = card;
  } else {
    cards.push(card);
  }

  saveCards();
  renderCards();
  closeCardModal();
}


/* -------------------------------------------------------------------------- */
/* Scanner                                                                      */
/* -------------------------------------------------------------------------- */

async function openScanner() {
  scannerStatus.textContent =
    "Point the camera at a barcode or QR code.";

  scannerModal.classList.remove("hidden");

  try {
    await startScanner();
  } catch (error) {
    console.error(error);

    scannerStatus.textContent =
      getScannerErrorMessage(error);
  }
}

async function startScanner() {
  stopScanner();

  scannerReader = new BrowserMultiFormatReader();

  /*
   * Restrict recognition to formats useful for loyalty cards.
   *
   * Importantly, BarcodeFormat is the actual ZXing enum. Comparing against
   * stringified enum values is unreliable because the enum values are
   * numeric internally.
   */
  scannerReader.possibleFormats = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE
  ];

  const devices =
    await BrowserMultiFormatReader.listVideoInputDevices();

  if (!devices || devices.length === 0) {
    throw new Error("No camera found.");
  }

  /*
   * Prefer the rear-facing camera on phones.
   */
  const preferredDevice =
    devices.find(device =>
      /back|rear|environment/i.test(device.label)
    ) || devices[devices.length - 1];

  const deviceId = preferredDevice.deviceId;

  scannerStatus.textContent =
    "Point the camera at a barcode or QR code.";

  scannerControls =
    await scannerReader.decodeFromVideoDevice(
      deviceId,
      scannerVideo,
      (result, error) => {
        if (!result) {
          return;
        }

        handleScanResult(result);
      }
    );
}

function handleScanResult(result) {
  const code = result.getText();

  const format = result.getBarcodeFormat();

  const type = typeForZXingFormat(format);

  if (!type) {
    scannerStatus.textContent =
      "Code detected, but the format isn't supported.";

    return;
  }

  /*
   * Automatically populate BOTH the code and the detected format.
   */
  cardCode.value = code;
  cardType.value = type;

  scannerStatus.textContent =
    `${formatTypeName(type)} detected`;

  /*
   * Stop the camera before returning to the form.
   */
  stopScanner();

  scannerModal.classList.add("hidden");

  /*
   * Put focus back on the code field.
   */
  setTimeout(() => cardCode.focus(), 50);
}

function typeForZXingFormat(format) {
  switch (format) {
    case BarcodeFormat.EAN_13:
      return "EAN13";

    case BarcodeFormat.EAN_8:
      return "EAN8";

    case BarcodeFormat.UPC_A:
      return "UPC";

    case BarcodeFormat.CODE_128:
      return "CODE128";

    case BarcodeFormat.QR_CODE:
      return "QR";

    default:
      return null;
  }
}

function stopScanner() {
  if (scannerControls) {
    try {
      scannerControls.stop();
    } catch {
      // Ignore cleanup errors.
    }

    scannerControls = null;
  }

  if (scannerVideo.srcObject) {
    for (const track of scannerVideo.srcObject.getTracks()) {
      track.stop();
    }

    scannerVideo.srcObject = null;
  }

  scannerReader = null;
}

function closeScanner() {
  stopScanner();
  scannerModal.classList.add("hidden");
}

function getScannerErrorMessage(error) {
  const message = String(error?.message || error);

  if (/permission|notallowed|denied/i.test(message)) {
    return "Camera permission was denied. Allow camera access and try again.";
  }

  if (/secure|https/i.test(message)) {
    return "Camera access requires HTTPS. GitHub Pages provides this automatically.";
  }

  if (/camera|device|not found/i.test(message)) {
    return "No usable camera was found.";
  }

  return "Unable to start the camera.";
}


/* -------------------------------------------------------------------------- */
/* Viewer                                                                      */
/* -------------------------------------------------------------------------- */

async function openViewer(id) {
  const card = cards.find(c => c.id === id);

  if (!card) {
    return;
  }

  currentViewerCardId = id;

  viewerCardName.textContent = card.name;
  viewerCodeValue.textContent = card.code;

  viewerBarcode.innerHTML = "";
  viewerQr.style.display = "none";
  viewerBarcode.style.display = "none";

  if (card.type === "QR") {
    viewerQr.style.display = "block";

    try {
      await QRCode.toCanvas(
        viewerQr,
        card.code,
        {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 500
        }
      );
    } catch (error) {
      console.error(error);

      viewerCodeValue.textContent =
        "Unable to render QR code.";
    }
  } else {
    viewerBarcode.style.display = "block";

    try {
      renderBarcode(card);
    } catch (error) {
      console.error(error);

      viewerCodeValue.textContent =
        "Unable to render barcode.";
    }
  }

  viewer.classList.remove("hidden");

  await requestWakeLock();
}

function renderBarcode(card) {
  let format;

  switch (card.type) {
    case "EAN13":
      format = "ean13";
      break;

    case "EAN8":
      format = "ean8";
      break;

    case "UPC":
      format = "upc";
      break;

    case "CODE128":
      format = "CODE128";
      break;

    default:
      throw new Error("Unsupported barcode type.");
  }

  JsBarcode(viewerBarcode, card.code, {
    format,
    displayValue: false,
    margin: 10,
    width: 3,
    height: 180,
    background: "#ffffff",
    lineColor: "#000000"
  });
}

function closeViewer() {
  releaseWakeLock();

  viewer.classList.add("hidden");

  currentViewerCardId = null;
}

function editViewerCard() {
  if (!currentViewerCardId) {
    return;
  }

  const id = currentViewerCardId;

  closeViewer();
  openEditCard(id);
}

function deleteViewerCard() {
  if (!currentViewerCardId) {
    return;
  }

  const card = cards.find(
    c => c.id === currentViewerCardId
  );

  if (!card) {
    return;
  }

  const confirmed =
    window.confirm(
      `Delete "${card.name}"?`
    );

  if (!confirmed) {
    return;
  }

  cards = cards.filter(
    c => c.id !== currentViewerCardId
  );

  saveCards();
  renderCards();
  closeViewer();
}


/* -------------------------------------------------------------------------- */
/* Wake Lock                                                                   */
/* -------------------------------------------------------------------------- */

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!wakeLock) {
    return;
  }

  try {
    wakeLock.release();
  } catch {
    // Ignore.
  }

  wakeLock = null;
}


/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

document
  .getElementById("themeToggle")
  .addEventListener("click", toggleTheme);

document
  .getElementById("addCardButton")
  .addEventListener("click", openAddCard);

document
  .getElementById("closeCardModal")
  .addEventListener("click", closeCardModal);

document
  .getElementById("cancelCardButton")
  .addEventListener("click", closeCardModal);

document
  .getElementById("scanButton")
  .addEventListener("click", openScanner);

document
  .getElementById("closeScannerButton")
  .addEventListener("click", closeScanner);

document
  .getElementById("closeViewerButton")
  .addEventListener("click", closeViewer);

document
  .getElementById("editViewerButton")
  .addEventListener("click", editViewerCard);

document
  .getElementById("deleteViewerButton")
  .addEventListener("click", deleteViewerCard);

cardForm.addEventListener(
  "submit",
  saveCardFromForm
);


/*
 * Event delegation for the card list.
 */
cardList.addEventListener("click", event => {
  const viewButton =
    event.target.closest(".view-card-button");

  if (viewButton) {
    openViewer(viewButton.dataset.id);
    return;
  }

  const editButton =
    event.target.closest(".edit-card-button");

  if (editButton) {
    openEditCard(editButton.dataset.id);
  }
});


/*
 * Close things when clicking modal backgrounds.
 */
cardModal
  .querySelector(".modal-backdrop")
  .addEventListener("click", closeCardModal);

scannerModal
  .querySelector(".modal-backdrop")
  .addEventListener("click", closeScanner);


/*
 * Escape closes the currently visible overlay.
 */
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") {
    return;
  }

  if (!viewer.classList.contains("hidden")) {
    closeViewer();
    return;
  }

  if (!scannerModal.classList.contains("hidden")) {
    closeScanner();
    return;
  }

  if (!cardModal.classList.contains("hidden")) {
    closeCardModal();
  }
});


/*
 * iOS/Safari can release the Wake Lock when the page becomes hidden.
 * Re-acquire it when the viewer becomes visible again.
 */
document.addEventListener("visibilitychange", async () => {
  if (
    document.visibilityState === "visible" &&
    !viewer.classList.contains("hidden")
  ) {
    await requestWakeLock();
  }
});


/* -------------------------------------------------------------------------- */
/* Initialisation                                                              */
/* -------------------------------------------------------------------------- */

loadTheme();
renderCards();
```
