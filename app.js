const STORAGE_KEY = "my-loyalty-cards-v1";
const THEME_KEY = "my-loyalty-cards-theme";

const CARD_TYPES = {
    EAN13: {
        label: "EAN-13",
        bwip: "ean13"
    },
    EAN8: {
        label: "EAN-8",
        bwip: "ean8"
    },
    UPC: {
        label: "UPC-A",
        bwip: "upca"
    },
    CODE128: {
        label: "Code 128",
        bwip: "code128"
    },
    QR: {
        label: "QR Code",
        bwip: "qrcode"
    },
    DATAMATRIX: {
        label: "Data Matrix",
        bwip: "datamatrix"
    },
    AZTEC: {
        label: "Aztec",
        bwip: "azteccode"
    }
};

let cards = loadCards();
let editingId = null;
let viewingId = null;

let scannerReader = null;
let scannerStream = null;
let scanning = false;
let wakeLock = null;

/* ------------------------------------------------------------------
   Storage
------------------------------------------------------------------ */

function loadCards() {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY));

        if (!Array.isArray(value)) {
            return [];
        }

        return value;
    } catch {
        return [];
    }
}

function saveCards() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

/* ------------------------------------------------------------------
   DOM
------------------------------------------------------------------ */

const cardListScreen = document.getElementById("cardListScreen");
const editScreen = document.getElementById("editScreen");
const transferScreen = document.getElementById("transferScreen");
const scannerScreen = document.getElementById("scannerScreen");
const viewerScreen = document.getElementById("viewerScreen");

const cardList = document.getElementById("cardList");
const emptyState = document.getElementById("emptyState");

const addCardButton = document.getElementById("addCardButton");
const importExportButton = document.getElementById("importExportButton");
const themeButton = document.getElementById("themeButton");

const editBackButton = document.getElementById("editBackButton");
const editTitle = document.getElementById("editTitle");

const cardForm = document.getElementById("cardForm");
const cardName = document.getElementById("cardName");
const cardCode = document.getElementById("cardCode");
const cardType = document.getElementById("cardType");
const cardColour = document.getElementById("cardColour");
const scanButton = document.getElementById("scanButton");
const deleteCardButton = document.getElementById("deleteCardButton");

const transferBackButton = document.getElementById("transferBackButton");
const copyAllButton = document.getElementById("copyAllButton");
const shareAllButton = document.getElementById("shareAllButton");
const pasteButton = document.getElementById("pasteButton");
const importButton = document.getElementById("importButton");
const importText = document.getElementById("importText");
const transferStatus = document.getElementById("transferStatus");

const scannerBackButton = document.getElementById("scannerBackButton");
const scannerVideo = document.getElementById("scannerVideo");
const scannerStatus = document.getElementById("scannerStatus");

const viewerBackButton = document.getElementById("viewerBackButton");
const viewerShareButton = document.getElementById("viewerShareButton");
const viewerName = document.getElementById("viewerName");
const viewerCode = document.getElementById("viewerCode");
const viewerEditButton = document.getElementById("viewerEditButton");
const viewerDeleteButton = document.getElementById("viewerDeleteButton");

/* ------------------------------------------------------------------
   Screens
------------------------------------------------------------------ */

function showScreen(screen) {
    [
        cardListScreen,
        editScreen,
        transferScreen,
        scannerScreen,
        viewerScreen
    ].forEach(element => element.classList.add("hidden"));

    screen.classList.remove("hidden");
}

function showList() {
    stopScanner();
    releaseWakeLock();

    viewingId = null;
    editingId = null;

    showScreen(cardListScreen);
    renderCards();
}

function openAddCard() {
    editingId = null;

    editTitle.textContent = "Add Card";
    deleteCardButton.classList.add("hidden");

    cardName.value = "";
    cardCode.value = "";
    cardType.value = "EAN13";
    cardColour.value = "#2d7d46";

    showScreen(editScreen);
    cardName.focus();
}

function openEditCard(id) {
    const card = cards.find(c => c.id === id);

    if (!card) {
        return;
    }

    editingId = id;

    editTitle.textContent = "Edit Card";
    deleteCardButton.classList.remove("hidden");

    cardName.value = card.name;
    cardCode.value = card.code;
    cardType.value = card.type;
    cardColour.value = card.colour || "#2d7d46";

    showScreen(editScreen);
}

function openTransfer() {
    importText.value = "";
    transferStatus.classList.add("hidden");
    showScreen(transferScreen);
}

function openViewer(id) {
    const card = cards.find(c => c.id === id);

    if (!card) {
        return;
    }

    viewingId = id;

    viewerName.textContent = card.name;

    viewerScreen.style.setProperty(
        "--viewer-accent",
        card.colour || "#2d7d46"
    );

    showScreen(viewerScreen);
    renderCode(card);
    requestWakeLock();
}

/* ------------------------------------------------------------------
   Card list
------------------------------------------------------------------ */

function renderCards() {
    cardList.innerHTML = "";

    emptyState.classList.toggle("hidden", cards.length !== 0);

    for (const card of cards) {
        const row = document.createElement("div");
        row.className = "card-row";

        const colour = document.createElement("div");
        colour.className = "card-colour";
        colour.style.background = card.colour || "#2d7d46";

        const info = document.createElement("div");
        info.className = "card-info";
        info.addEventListener("click", () => openViewer(card.id));

        const name = document.createElement("div");
        name.className = "card-name";
        name.textContent = card.name;

        const type = document.createElement("div");
        type.className = "card-type";
        type.textContent = CARD_TYPES[card.type]?.label || card.type;

        info.append(name, type);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const share = document.createElement("button");
        share.className = "card-action";
        share.textContent = "↗";
        share.title = "Share card";

        share.addEventListener("click", event => {
            event.stopPropagation();
            shareCard(card);
        });

        const edit = document.createElement("button");
        edit.className = "card-action";
        edit.textContent = "✎";
        edit.title = "Edit card";

        edit.addEventListener("click", event => {
            event.stopPropagation();
            openEditCard(card.id);
        });

        actions.append(share, edit);
        row.append(colour, info, actions);

        cardList.appendChild(row);
    }
}

/* ------------------------------------------------------------------
   Card editing
------------------------------------------------------------------ */

cardForm.addEventListener("submit", event => {
    event.preventDefault();

    const name = cardName.value.trim();
    const code = cardCode.value.trim();
    const type = cardType.value;
    const colour = cardColour.value;

    if (!name || !code || !CARD_TYPES[type]) {
        return;
    }

    if (editingId) {
        const card = cards.find(c => c.id === editingId);

        if (card) {
            card.name = name;
            card.code = code;
            card.type = type;
            card.colour = colour;
        }
    } else {
        cards.push({
            id: crypto.randomUUID(),
            name,
            code,
            type,
            colour
        });
    }

    saveCards();
    showList();
});

deleteCardButton.addEventListener("click", () => {
    if (!editingId) {
        return;
    }

    const card = cards.find(c => c.id === editingId);

    if (!card) {
        return;
    }

    if (!confirm(`Delete "${card.name}"?`)) {
        return;
    }

    cards = cards.filter(c => c.id !== editingId);

    saveCards();
    showList();
});

viewerDeleteButton.addEventListener("click", () => {
    if (!viewingId) {
        return;
    }

    const card = cards.find(c => c.id === viewingId);

    if (!card) {
        return;
    }

    if (!confirm(`Delete "${card.name}"?`)) {
        return;
    }

    cards = cards.filter(c => c.id !== viewingId);

    saveCards();
    showList();
});

viewerEditButton.addEventListener("click", () => {
    if (viewingId) {
        openEditCard(viewingId);
    }
});

/* ------------------------------------------------------------------
   Barcode rendering
------------------------------------------------------------------ */

function renderCode(card) {
    const type = CARD_TYPES[card.type];

    if (!type || !window.bwipjs) {
        return;
    }

    const is2D = ["QR", "DATAMATRIX", "AZTEC"].includes(card.type);

    const options = {
        bcid: type.bwip,
        text: card.code,
        scale: is2D ? 5 : 4,
        includetext: false,

        /*
         * The surrounding CSS container supplies the quiet zone.
         * Keep the generated barcode itself tight.
         */
        paddingwidth: 0,
        paddingheight: 0,

        backgroundcolor: "FFFFFF"
    };

    if (card.type === "QR") {
        options.eclevel = "M";
    }

    try {
        window.bwipjs.toCanvas(viewerCode, options);
    } catch (error) {
        console.error("Barcode rendering failed:", error);
    }
}

/* ------------------------------------------------------------------
   Portable definitions
------------------------------------------------------------------ */

function cardDefinition(card) {
    return {
        type: "loyalty-card",
        version: 1,
        card: {
            name: card.name,
            code: card.code,
            type: card.type,
            colour: card.colour || "#2d7d46"
        }
    };
}

function collectionDefinition() {
    return {
        type: "loyalty-cards",
        version: 1,
        cards: cards.map(card => ({
            name: card.name,
            code: card.code,
            type: card.type,
            colour: card.colour || "#2d7d46"
        }))
    };
}

function definitionText(card) {
    return JSON.stringify(cardDefinition(card), null, 2);
}

function collectionText() {
    return JSON.stringify(collectionDefinition(), null, 2);
}

/* ------------------------------------------------------------------
   Import validation
------------------------------------------------------------------ */

function validateCardDefinition(card) {
    if (!card || typeof card !== "object") {
        throw new Error("Invalid card definition.");
    }

    const name = String(card.name || "").trim();
    const code = String(card.code || "").trim();
    const type = card.type;

    if (!name) {
        throw new Error("Card is missing its name.");
    }

    if (!code) {
        throw new Error(`"${name}" is missing its card number.`);
    }

    if (!CARD_TYPES[type]) {
        throw new Error(`"${name}" has an unsupported barcode type.`);
    }

    return {
        name,
        code,
        type,
        colour:
            typeof card.colour === "string" && card.colour
                ? card.colour
                : "#2d7d46"
    };
}

function parseImport(text) {
    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("That doesn't appear to be valid JSON.");
    }

    if (!data || typeof data !== "object") {
        throw new Error("Invalid card definition.");
    }

    if (data.version !== 1) {
        throw new Error("Unsupported definition version.");
    }

    if (data.type === "loyalty-card") {
        return [validateCardDefinition(data.card)];
    }

    if (data.type === "loyalty-cards") {
        if (!Array.isArray(data.cards)) {
            throw new Error("Collection does not contain a cards array.");
        }

        return data.cards.map(validateCardDefinition);
    }

    throw new Error("This isn't a Loyalty Cards definition.");
}

function isDuplicate(card) {
    return cards.some(existing =>
        existing.type === card.type &&
        existing.code === card.code
    );
}

/* ------------------------------------------------------------------
   Clipboard / sharing
------------------------------------------------------------------ */

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);

    textarea.select();
    document.execCommand("copy");

    textarea.remove();
}

async function shareText(title, text) {
    if (navigator.share) {
        try {
            await navigator.share({
                title,
                text
            });

            return true;
        } catch (error) {
            if (error?.name === "AbortError") {
                return true;
            }
        }
    }

    await copyText(text);
    return false;
}

async function shareCard(card) {
    const text = definitionText(card);

    await shareText(
        `${card.name} loyalty card`,
        text
    );
}

async function shareAll() {
    const text = collectionText();

    await shareText(
        "My loyalty cards",
        text
    );
}

viewerShareButton.addEventListener("click", async () => {
    if (!viewingId) {
        return;
    }

    const card = cards.find(c => c.id === viewingId);

    if (card) {
        await shareCard(card);
    }
});

copyAllButton.addEventListener("click", async () => {
    await copyText(collectionText());

    showTransferStatus(
        `Copied ${cards.length} card${cards.length === 1 ? "" : "s"}.`
    );
});

shareAllButton.addEventListener("click", async () => {
    await shareAll();
});

pasteButton.addEventListener("click", async () => {
    if (!navigator.clipboard?.readText) {
        showTransferStatus(
            "Clipboard access isn't available here. Paste into the box manually."
        );
        return;
    }

    try {
        importText.value = await navigator.clipboard.readText();
        showTransferStatus("Pasted from clipboard.");
    } catch {
        showTransferStatus(
            "Couldn't read the clipboard. Paste into the box manually."
        );
    }
});

importButton.addEventListener("click", () => {
    const text = importText.value.trim();

    if (!text) {
        showTransferStatus("Paste a card definition first.");
        return;
    }

    try {
        const imported = parseImport(text);

        const newCards = imported.filter(card => !isDuplicate(card));
        const duplicates = imported.length - newCards.length;

        for (const card of newCards) {
            cards.push({
                id: crypto.randomUUID(),
                ...card
            });
        }

        saveCards();

        if (newCards.length === 0) {
            showTransferStatus(
                `${imported.length} card${imported.length === 1 ? "" : "s"} found — all already exist.`
            );
        } else if (duplicates > 0) {
            showTransferStatus(
                `Imported ${newCards.length} new card${newCards.length === 1 ? "" : "s"}; skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}.`
            );
        } else {
            showTransferStatus(
                `Imported ${newCards.length} card${newCards.length === 1 ? "" : "s"}.`
            );
        }

        renderCards();
    } catch (error) {
        showTransferStatus(error.message || "Import failed.");
    }
});

function showTransferStatus(message) {
    transferStatus.textContent = message;
    transferStatus.classList.remove("hidden");
}

/* ------------------------------------------------------------------
   Scanner
------------------------------------------------------------------ */

scanButton.addEventListener("click", startScanner);

scannerBackButton.addEventListener("click", () => {
    stopScanner();
    showScreen(editScreen);
});

async function startScanner() {
    if (!window.ZXing) {
        scannerStatus.textContent = "Barcode scanner is unavailable.";
        return;
    }

    showScreen(scannerScreen);

    scannerStatus.textContent =
        "Centre the barcode and fill as much of the frame as practical.";

    try {
        scannerReader = new window.ZXing.BrowserMultiFormatReader();

        scannerReader.possibleFormats = [
            window.ZXing.BarcodeFormat.EAN_13,
            window.ZXing.BarcodeFormat.EAN_8,
            window.ZXing.BarcodeFormat.UPC_A,
            window.ZXing.BarcodeFormat.CODE_128,
            window.ZXing.BarcodeFormat.QR_CODE,
            window.ZXing.BarcodeFormat.DATA_MATRIX,
            window.ZXing.BarcodeFormat.AZTEC
        ];

        scanning = true;

        await scannerReader.decodeFromConstraints(
            {
                video: {
                    facingMode: {
                        ideal: "environment"
                    }
                }
            },
            scannerVideo,
            (result, error) => {
                if (!scanning || !result) {
                    return;
                }

                const type = typeForZXingFormat(
                    result.getBarcodeFormat()
                );

                if (!type) {
                    scannerStatus.textContent =
                        "Barcode detected, but its format isn't supported.";
                    return;
                }

                cardCode.value = result.getText();
                cardType.value = type;

                stopScanner();
                showScreen(editScreen);

                scannerStatus.textContent = "Barcode detected.";
            }
        );
    } catch (error) {
        console.error(error);

        scannerStatus.textContent =
            "Couldn't start the camera. Check camera permission.";
    }
}

function typeForZXingFormat(format) {
    const B = window.ZXing.BarcodeFormat;

    switch (format) {
        case B.EAN_13:
            return "EAN13";

        case B.EAN_8:
            return "EAN8";

        case B.UPC_A:
            return "UPC";

        case B.CODE_128:
            return "CODE128";

        case B.QR_CODE:
            return "QR";

        case B.DATA_MATRIX:
            return "DATAMATRIX";

        case B.AZTEC:
            return "AZTEC";

        default:
            return null;
    }
}

function stopScanner() {
    scanning = false;

    if (scannerReader) {
        try {
            scannerReader.reset();
        } catch {
            // Ignore scanner cleanup errors.
        }

        scannerReader = null;
    }

    if (scannerVideo.srcObject) {
        for (const track of scannerVideo.srcObject.getTracks()) {
            track.stop();
        }

        scannerVideo.srcObject = null;
    }

    scannerStream = null;
}

/* ------------------------------------------------------------------
   Wake Lock
------------------------------------------------------------------ */

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

async function releaseWakeLock() {
    if (!wakeLock) {
        return;
    }

    try {
        await wakeLock.release();
    } catch {
        // Ignore.
    }

    wakeLock = null;
}

document.addEventListener("visibilitychange", async () => {
    if (
        document.visibilityState === "visible" &&
        !viewerScreen.classList.contains("hidden")
    ) {
        await requestWakeLock();
    }
});

/* ------------------------------------------------------------------
   Theme
------------------------------------------------------------------ */

function loadTheme() {
    const theme = localStorage.getItem(THEME_KEY);

    if (theme === "light") {
        document.documentElement.classList.add("light");
    }
}

themeButton.addEventListener("click", () => {
    const light = document.documentElement.classList.toggle("light");

    localStorage.setItem(
        THEME_KEY,
        light ? "light" : "dark"
    );
});

/* ------------------------------------------------------------------
   Navigation
------------------------------------------------------------------ */

addCardButton.addEventListener("click", openAddCard);
importExportButton.addEventListener("click", openTransfer);

editBackButton.addEventListener("click", showList);
transferBackButton.addEventListener("click", showList);

viewerBackButton.addEventListener("click", showList);

/* ------------------------------------------------------------------
   Initialisation
------------------------------------------------------------------ */

loadTheme();
renderCards();
