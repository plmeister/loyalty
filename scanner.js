export const VIDEO_CONSTRAINTS = {
    video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
    }
};

export function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export const ZXING_FORMAT_NAMES = new Map([
    ["EAN_13", "EAN-13"],
    ["EAN_8", "EAN-8"],
    ["UPC_A", "UPC-A"],
    ["UPC_E", "UPC-E"],
    ["CODE_128", "Code 128"],
    ["CODE_39", "Code 39"],
    ["ITF", "ITF"],
    ["QR_CODE", "QR Code"],
    ["DATA_MATRIX", "Data Matrix"],
    ["AZTEC", "Aztec"]
]);
