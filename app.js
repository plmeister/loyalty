import { VIDEO_CONSTRAINTS } from "./scanner.js";

const STORAGE_KEY = "my-loyalty-cards-v1";
const THEME_KEY = "my-loyalty-cards-theme";
const AUTO_KEY = "my-loyalty-cards-autolocate";

const DEFAULT_RADIUS_M = 100;

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

let autoLocateEnabled = localStorage.getItem(AUTO_KEY) === "on";
let nearbyId = null;
let editingLocations = [];

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
const autoLocateButton = document.getElementById("autoLocateButton");

const editBackButton = document.getElementById("editBackButton");
const editTitle = document.getElementById("editTitle");

const cardForm = document.getElementById("cardForm");
const cardName = document.getElementById("cardName");
const cardCode = document.getElementById("cardCode");
const cardType = document.getElementById("cardType");
const cardColour = document.getElementById("cardColour");
const scanButton = document.getElementById("scanButton");
const deleteCardButton = document.getElementById("deleteCardButton");

const locationList = document.getElementById("locationList");
const addLocationButton = document.getElementById("addLocationButton");
const locationStatus = document.getElementById("locationStatus");

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

const actionMenu = document.getElementById("actionMenu");
const actionMenuTitle = document.getElementById("actionMenuTitle");
const actionMenuEdit = document.getElementById("actionMenuEdit");
const actionMenuLocate = document.getElementById("actionMenuLocate");
const actionMenuDelete = document.getElementById("actionMenuDelete");
const actionMenuBackdrop = document.getElementById("actionMenuBackdrop");

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

    if (autoLocateEnabled) {
        refreshNearby().finally(renderCards);
    } else {
        nearbyId = null;
        renderCards();
    }
}

function openAddCard() {
    editingId = null;

    editTitle.textContent = "Add Card";
    deleteCardButton.classList.add("hidden");

    cardName.value = "";
    cardCode.value = "";
    cardType.value = "EAN13";
    cardColour.value = "#2d7d46";

    editingLocations = [];
    renderLocationList();
    locationStatus.classList.add("hidden");

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

    editingLocations = Array.isArray(card.locations)
        ? card.locations.map(location => ({ ...location }))
        : [];
    renderLocationList();
    locationStatus.classList.add("hidden");

    showScreen(editScreen);
}

function openTransfer() {
    importText.value = "";
    transferStatus.classList.add("hidden");
    showScreen(transferScreen);
}

function displayCard(card) {
    viewingId = card.id;

    viewerName.textContent = card.name;

    viewerScreen.style.setProperty(
        "--viewer-accent",
        card.colour || "#2d7d46"
    );

    renderCode(card);
}

function openViewer(id) {
    const card = cards.find(c => c.id === id);

    if (!card) {
        return;
    }

    showScreen(viewerScreen);
    displayCard(card);
    requestWakeLock();
}

function openAdjacentCard(step) {
    if (!viewingId || cards.length === 0) {
        return;
    }

    const index = cards.findIndex(c => c.id === viewingId);

    if (index === -1) {
        return;
    }

    const card = cards[(index + step + cards.length) % cards.length];

    displayCard(card);
}

/* ------------------------------------------------------------------
   Card list
------------------------------------------------------------------ */

function renderCards() {
    cardList.innerHTML = "";

    emptyState.classList.toggle("hidden", cards.length !== 0);

    const ordered = nearbyId
        ? [
              cards.find(c => c.id === nearbyId),
              ...cards.filter(c => c.id !== nearbyId)
          ].filter(Boolean)
        : cards;

    for (const card of ordered) {
        const row = document.createElement("div");
        row.className = "card-row";

        if (card.id === nearbyId) {
            row.classList.add("nearby");
        }

        const colour = document.createElement("div");
        colour.className = "card-colour";
        colour.style.background = card.colour || "#2d7d46";

        const info = document.createElement("div");
        info.className = "card-info";

        /*
         * Tap & hold opens the card's action menu. The flag stops the
         * release that ends the hold from also opening the viewer.
         */
        let pressTimer = null;
        let pressFired = false;

        const cancelPress = () => {
            if (pressTimer) {
                window.clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        row.addEventListener("pointerdown", event => {
            if (event.target.closest("button")) {
                return;
            }

            pressFired = false;

            pressTimer = window.setTimeout(() => {
                pressTimer = null;
                pressFired = true;
                openActionMenu(card.id);
            }, 500);
        });

        row.addEventListener("pointermove", cancelPress);
        row.addEventListener("pointerup", cancelPress);
        row.addEventListener("pointercancel", cancelPress);
        row.addEventListener("pointerleave", cancelPress);

        info.addEventListener("click", () => {
            if (pressFired) {
                pressFired = false;
                return;
            }

            openViewer(card.id);
        });

        const name = document.createElement("div");
        name.className = "card-name";
        name.textContent = card.name;

        const type = document.createElement("div");
        type.className = "card-type";
        type.textContent = CARD_TYPES[card.type]?.label || card.type;

        if (card.id === nearbyId) {
            type.textContent += " · 📍 near you";
        }

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

            if (editingLocations.length) {
                card.locations = editingLocations.map(location => ({ ...location }));
            } else {
                delete card.locations;
            }
        }
    } else {
        const card = {
            id: crypto.randomUUID(),
            name,
            code,
            type,
            colour
        };

        if (editingLocations.length) {
            card.locations = editingLocations.map(location => ({ ...location }));
        }

        cards.push(card);
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

function deleteCard(id) {
    const card = cards.find(c => c.id === id);

    if (!card) {
        return;
    }

    if (!confirm(`Delete "${card.name}"?`)) {
        return;
    }

    cards = cards.filter(c => c.id !== id);

    saveCards();
    showList();
}

/* ------------------------------------------------------------------
   Card context menu (tap & hold on the card list)
------------------------------------------------------------------ */

let actionMenuCardId = null;

function openActionMenu(id) {
    const card = cards.find(c => c.id === id);

    if (!card) {
        return;
    }

    actionMenuCardId = id;
    actionMenuTitle.textContent = card.name;
    actionMenu.classList.remove("hidden");
}

function closeActionMenu() {
    actionMenu.classList.add("hidden");
    actionMenuCardId = null;
}

actionMenuEdit.addEventListener("click", () => {
    const id = actionMenuCardId;

    closeActionMenu();

    if (id) {
        openEditCard(id);
    }
});

actionMenuLocate.addEventListener("click", async () => {
    const id = actionMenuCardId;

    closeActionMenu();

    if (!id) {
        return;
    }

    const card = cards.find(c => c.id === id);

    if (!card) {
        return;
    }

    try {
        const coords = await getPosition();

        const location = {
            lat: Math.round(coords.latitude * 1e6) / 1e6,
            lon: Math.round(coords.longitude * 1e6) / 1e6,
            radius: DEFAULT_RADIUS_M
        };

        card.locations = [...(card.locations || []), location];

        saveCards();
        renderCards();

        alert(
            `Saved this location to "${card.name}".\n\n` +
            "Add a label or change the radius from Edit if you like."
        );
    } catch (error) {
        alert(error.message);
    }
});

actionMenuDelete.addEventListener("click", () => {
    const id = actionMenuCardId;

    closeActionMenu();

    if (id) {
        deleteCard(id);
    }
});

actionMenuBackdrop.addEventListener("click", closeActionMenu);

/* ------------------------------------------------------------------
   Viewer card flipping
------------------------------------------------------------------ */

const viewerCodeContainer = document.getElementById("viewerCodeContainer");

const FLIP_MS = 160;

let swipeStart = null;
let flipBusy = false;

function setCodeOffset(offset, animate) {
    viewerCodeContainer.style.transition = animate
        ? `transform ${FLIP_MS}ms ease, opacity ${FLIP_MS}ms ease`
        : "none";
    viewerCodeContainer.style.transform = offset
        ? `translateX(${offset})`
        : "";
}

function resetCodeOffset() {
    viewerCodeContainer.style.transition = "none";
    viewerCodeContainer.style.transform = "";
    viewerCodeContainer.style.opacity = "";
}

function flipTo(step, dx) {
    flipBusy = true;

    /*
     * Fly the current card off-screen, swap at the midpoint,
     * then fly the new card in from the opposite edge.
     */
    setCodeOffset(dx < 0 ? "-110%" : "110%", true);
    viewerCodeContainer.style.opacity = "0";

    window.setTimeout(() => {
        openAdjacentCard(step);

        setCodeOffset(dx < 0 ? "110%" : "-110%", false);
        viewerCodeContainer.style.opacity = "0";

        window.requestAnimationFrame(() => {
            setCodeOffset("", true);
            viewerCodeContainer.style.opacity = "1";
        });

        flipBusy = false;
    }, FLIP_MS);
}

viewerScreen.addEventListener("pointerdown", event => {
    if (!event.isPrimary || flipBusy || event.target.closest("button")) {
        return;
    }

    try {
        viewerScreen.setPointerCapture(event.pointerId);
    } catch {
        // Capture is a nicety; the swipe still works without it.
    }

    resetCodeOffset();

    swipeStart = {
        x: event.clientX,
        y: event.clientY
    };
});

viewerScreen.addEventListener("pointermove", event => {
    if (!swipeStart || !event.isPrimary) {
        return;
    }

    const dx = event.clientX - swipeStart.x;

    viewerCodeContainer.style.transition = "none";
    viewerCodeContainer.style.transform = `translateX(${dx}px)`;
    viewerCodeContainer.style.opacity =
        String(1 - Math.min(Math.abs(dx) / 300, 0.5));
});

viewerScreen.addEventListener("pointerup", event => {
    if (!swipeStart || !event.isPrimary) {
        return;
    }

    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;

    swipeStart = null;

    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) {
        resetCodeOffset();
        viewerCodeContainer.style.transition =
            `transform ${FLIP_MS}ms ease, opacity ${FLIP_MS}ms ease`;
        viewerCodeContainer.style.opacity = "1";
        return;
    }

    flipTo(dx < 0 ? 1 : -1, dx);
});

viewerScreen.addEventListener("pointercancel", () => {
    swipeStart = null;

    if (!flipBusy) {
        resetCodeOffset();
    }
});

document.addEventListener("keydown", event => {
    if (viewerScreen.classList.contains("hidden")) {
        return;
    }

    if (event.key === "ArrowLeft") {
        openAdjacentCard(-1);
    }

    if (event.key === "ArrowRight") {
        openAdjacentCard(1);
    }
});

/* ------------------------------------------------------------------
   Location detection
------------------------------------------------------------------ */

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Location isn't available in this browser."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => resolve(position.coords),
            error => reject(new Error(geolocationErrorMessage(error))),
            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    });
}

function geolocationErrorMessage(error) {
    switch (error.code) {
        case 1:
            return "Location permission was denied.";
        case 2:
            return "Couldn't determine your location.";
        case 3:
            return "Location request timed out.";
        default:
            return "Couldn't determine your location.";
    }
}

function distanceMetres(lat1, lon1, lat2, lon2) {
    const toRadians = degrees => degrees * Math.PI / 180;

    const earthRadius = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;

    return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function findNearbyCard(coords) {
    let best = null;

    for (const card of cards) {
        if (!Array.isArray(card.locations)) {
            continue;
        }

        for (const location of card.locations) {
            const distance = distanceMetres(
                coords.latitude,
                coords.longitude,
                location.lat,
                location.lon
            );

            const radius = location.radius || DEFAULT_RADIUS_M;

            if (distance <= radius && (!best || distance < best.distance)) {
                best = { card, location, distance };
            }
        }
    }

    return best;
}

async function refreshNearby() {
    nearbyId = null;

    const anyLocations = cards.some(
        card => Array.isArray(card.locations) && card.locations.length
    );

    if (!autoLocateEnabled || !anyLocations) {
        return;
    }

    try {
        const coords = await getPosition();
        const match = findNearbyCard(coords);

        nearbyId = match ? match.card.id : null;
    } catch {
        // Leave the list unsorted; auto-detect stays silent.
    }
}

function renderLocationList() {
    locationList.innerHTML = "";

    for (let index = 0; index < editingLocations.length; index++) {
        const location = editingLocations[index];

        const row = document.createElement("div");
        row.className = "location-row";

        const top = document.createElement("div");
        top.className = "location-top";

        const coords = document.createElement("div");
        coords.className = "location-coords";
        coords.textContent =
            `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "location-remove";
        remove.textContent = "×";
        remove.title = "Remove location";

        remove.addEventListener("click", () => {
            editingLocations.splice(index, 1);
            renderLocationList();
        });

        top.append(coords, remove);

        const fields = document.createElement("div");
        fields.className = "location-fields";

        const label = document.createElement("input");
        label.type = "text";
        label.className = "location-label";
        label.placeholder = "Label (optional)";
        label.value = location.label || "";

        label.addEventListener("input", () => {
            location.label = label.value.trim();
        });

        const radius = document.createElement("input");
        radius.type = "number";
        radius.className = "location-radius";
        radius.min = "10";
        radius.max = "10000";
        radius.step = "10";
        radius.title = "Radius in metres";
        radius.value = String(location.radius || DEFAULT_RADIUS_M);

        radius.addEventListener("input", () => {
            const value = Number(radius.value);

            if (Number.isFinite(value) && value >= 10 && value <= 10000) {
                location.radius = Math.round(value);
            }
        });

        const radiusUnit = document.createElement("span");
        radiusUnit.className = "location-radius-unit";
        radiusUnit.textContent = "m";

        fields.append(label, radius, radiusUnit);

        row.append(top, fields);
        locationList.appendChild(row);
    }
}

addLocationButton.addEventListener("click", async () => {
    locationStatus.classList.add("hidden");
    addLocationButton.disabled = true;

    try {
        const coords = await getPosition();

        editingLocations.push({
            lat: Math.round(coords.latitude * 1e6) / 1e6,
            lon: Math.round(coords.longitude * 1e6) / 1e6,
            radius: DEFAULT_RADIUS_M
        });

        renderLocationList();

        locationStatus.textContent =
            "Location added. Set a label and radius if you like.";
        locationStatus.classList.remove("hidden");
    } catch (error) {
        locationStatus.textContent = error.message;
        locationStatus.classList.remove("hidden");
    } finally {
        addLocationButton.disabled = false;
    }
});

autoLocateButton.addEventListener("click", async () => {
    if (!autoLocateEnabled) {
        autoLocateButton.disabled = true;

        try {
            await getPosition();
        } catch (error) {
            alert(error.message);
            autoLocateButton.disabled = false;
            return;
        }

        autoLocateButton.disabled = false;
        autoLocateEnabled = true;
        localStorage.setItem(AUTO_KEY, "on");
        autoLocateButton.classList.add("active");

        showList();
    } else {
        autoLocateEnabled = false;
        localStorage.setItem(AUTO_KEY, "off");
        autoLocateButton.classList.remove("active");

        nearbyId = null;
        renderCards();
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
        scale: is2D ? 8 : 6,
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
        sizeCode(is2D);
    } catch (error) {
        console.error("Barcode rendering failed:", error);
    }
}

/*
 * Tall screens suit vertical 1D barcodes far better than the usual
 * wide-and-short layout. Rotate the canvas when the viewer is in
 * portrait and fit it against the container's height instead.
 */
function sizeCode(is2D) {
    const bounds = viewerCodeContainer.getBoundingClientRect();

    const vertical = !is2D && bounds.height > bounds.width;

    viewerCode.classList.toggle("rotated", vertical);

    if (vertical) {
        /*
         * Read the live padding rather than hardcoding it, so the
         * quiet zone can be adjusted in CSS without retuning this.
         */
        const style = window.getComputedStyle(viewerCodeContainer);

        const paddingX =
            parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const paddingY =
            parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);

        const availableWidth = viewerCodeContainer.clientWidth - paddingX;
        const availableHeight = viewerCodeContainer.clientHeight - paddingY;

        const scale = Math.min(
            availableWidth / viewerCode.height,
            availableHeight / viewerCode.width
        );

        viewerCode.style.width = `${Math.round(viewerCode.width * scale)}px`;
        viewerCode.style.height = `${Math.round(viewerCode.height * scale)}px`;
    } else {
        viewerCode.style.width = "";
        viewerCode.style.height = "";
    }
}

/* ------------------------------------------------------------------
   Portable definitions
------------------------------------------------------------------ */

function cardDefinition(card) {
    const definition = {
        type: "loyalty-card",
        version: 1,
        card: {
            name: card.name,
            code: card.code,
            type: card.type,
            colour: card.colour || "#2d7d46"
        }
    };

    if (Array.isArray(card.locations) && card.locations.length) {
        definition.card.locations = card.locations.map(location => ({
            ...location
        }));
    }

    return definition;
}

function collectionDefinition() {
    return {
        type: "loyalty-cards",
        version: 1,
        cards: cards.map(card => {
            const definition = {
                name: card.name,
                code: card.code,
                type: card.type,
                colour: card.colour || "#2d7d46"
            };

            if (Array.isArray(card.locations) && card.locations.length) {
                definition.locations = card.locations.map(location => ({
                    ...location
                }));
            }

            return definition;
        })
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

function validateLocations(name, locations) {
    if (locations === undefined || locations === null) {
        return undefined;
    }

    if (!Array.isArray(locations)) {
        throw new Error(`"${name}" has an invalid locations list.`);
    }

    const cleaned = [];

    for (const location of locations) {
        if (!location || typeof location !== "object") {
            throw new Error(`"${name}" has an invalid location entry.`);
        }

        const lat = Number(location.lat);
        const lon = Number(location.lon);

        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            throw new Error(`"${name}" has a location with an invalid latitude.`);
        }

        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
            throw new Error(`"${name}" has a location with an invalid longitude.`);
        }

        const radius = location.radius === undefined
            ? DEFAULT_RADIUS_M
            : Number(location.radius);

        if (!Number.isFinite(radius) || radius < 10 || radius > 10000) {
            throw new Error(`"${name}" has a location with an invalid radius.`);
        }

        const label = typeof location.label === "string"
            ? location.label.trim()
            : "";

        cleaned.push({
            lat,
            lon,
            radius: Math.round(radius),
            ...(label ? { label } : {})
        });
    }

    return cleaned.length ? cleaned : undefined;
}

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

    const locations = validateLocations(name, card.locations);

    const cleaned = {
        name,
        code,
        type,
        colour:
            typeof card.colour === "string" && card.colour
                ? card.colour
                : "#2d7d46"
    };

    if (locations) {
        cleaned.locations = locations;
    }

    return cleaned;
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
            VIDEO_CONSTRAINTS,
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
    const name = Object.entries(B).find(([, v]) => v === format)?.[0];

    const map = {
        EAN_13: "EAN13",
        EAN_8: "EAN8",
        UPC_A: "UPC",
        CODE_128: "CODE128",
        QR_CODE: "QR",
        DATA_MATRIX: "DATAMATRIX",
        AZTEC: "AZTEC"
    };

    return map[name] ?? null;
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
autoLocateButton.classList.toggle("active", autoLocateEnabled);
renderCards();

refreshNearby().then(() => {
    if (nearbyId) {
        openViewer(nearbyId);
    }
});
