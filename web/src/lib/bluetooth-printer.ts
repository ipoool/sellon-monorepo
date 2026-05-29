// Web Bluetooth ESC/POS thermal printer helper.
//
// Web Bluetooth is supported on Chrome/Edge (desktop + Android) but NOT on
// Safari/iOS. Callers must feature-detect with `isBluetoothSupported()` and
// fall back to the browser print dialog where unsupported.
//
// Types: the DOM lib doesn't ship Web Bluetooth typings, so we lean on `any`
// at the navigator boundary rather than pulling in @types/web-bluetooth.

import { formatRupiah } from "@/lib/format";
import type { OrderDetail, Store } from "@/lib/types";

// Service UUIDs commonly exposed by BLE thermal printers. requestDevice with
// acceptAllDevices still needs these listed under optionalServices to allow
// access to their characteristics after connecting.
const PRINTER_SERVICE_HINTS: Array<number | string> = [
  0x18f0,
  0xff00,
  0xffe0,
  0xfee7,
  0xff10,
  0xfff0,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

type CachedConn = {
  device: any;
  characteristic: any;
};

let conn: CachedConn | null = null;

export function isBluetoothSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof (navigator as any).bluetooth?.requestDevice === "function"
  );
}

export function connectedPrinterName(): string | null {
  return conn?.device?.name ?? null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// connectPrinter prompts the device chooser (must be called from a user
// gesture) and locates a writable characteristic. Caches it for the session.
export async function connectPrinter(): Promise<string> {
  if (!isBluetoothSupported()) {
    throw new Error("Browser ini tidak mendukung Bluetooth (gunakan Chrome/Android).");
  }
  const bt = (navigator as any).bluetooth;
  let device: any;
  try {
    device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_HINTS,
    });
  } catch (e) {
    // User closed the chooser without picking a device — not a real error.
    if (
      e instanceof DOMException &&
      (e.name === "NotFoundError" || /cancel/i.test(e.message))
    ) {
      const err = new Error("Pemilihan printer dibatalkan");
      err.name = "CancelledError";
      throw err;
    }
    throw new Error("Gagal membuka daftar printer Bluetooth");
  }

  let server: any;
  try {
    server = await device.gatt.connect();
  } catch {
    throw new Error("Gagal terhubung ke printer. Pastikan printer menyala & dalam jangkauan.");
  }
  const services = await server.getPrimaryServices();
  let writable: any = null;
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        writable = ch;
        break;
      }
    }
    if (writable) break;
  }
  if (!writable) {
    try {
      device.gatt.disconnect();
    } catch {
      // ignore
    }
    throw new Error("Printer tidak punya channel tulis yang didukung.");
  }

  device.addEventListener("gattserverdisconnected", () => {
    conn = null;
  });

  conn = { device, characteristic: writable };
  return device.name ?? "Printer Bluetooth";
}

export function disconnectPrinter(): void {
  try {
    conn?.device?.gatt?.disconnect();
  } catch {
    // ignore
  }
  conn = null;
}

async function writeBytes(bytes: Uint8Array): Promise<void> {
  if (!conn) throw new Error("Printer belum terhubung.");
  // Reconnect if the GATT link dropped between prints.
  if (conn.device?.gatt && !conn.device.gatt.connected) {
    await conn.device.gatt.connect();
  }
  const ch = conn.characteristic;
  const CHUNK = 100;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK);
    if (ch.properties.writeWithoutResponse) {
      await ch.writeValueWithoutResponse(slice);
    } else {
      await ch.writeValue(slice);
    }
    await delay(18);
  }
}

// === ESC/POS encoding ===

const ESC = 0x1b;
const GS = 0x1d;

class EscPos {
  private parts: number[] = [];
  readonly width: number; // characters per line (32 = 58mm, 48 = 80mm)

  constructor(width: number) {
    this.width = width;
    this.parts.push(ESC, 0x40); // init
  }

  private text(s: string): this {
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      this.parts.push(code > 0xff ? 0x3f /* '?' */ : code);
    }
    return this;
  }

  align(a: "left" | "center" | "right"): this {
    this.parts.push(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
    return this;
  }

  bold(on: boolean): this {
    this.parts.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  doubleSize(on: boolean): this {
    this.parts.push(GS, 0x21, on ? 0x11 : 0x00);
    return this;
  }

  line(s = ""): this {
    this.text(s).parts.push(0x0a);
    return this;
  }

  // Left text + right text padded to fill the line width.
  leftRight(left: string, right: string): this {
    const space = Math.max(1, this.width - left.length - right.length);
    return this.line(left + " ".repeat(space) + right);
  }

  divider(): this {
    return this.line("-".repeat(this.width));
  }

  feed(n: number): this {
    this.parts.push(ESC, 0x64, n);
    return this;
  }

  cut(): this {
    this.parts.push(GS, 0x56, 0x00);
    return this;
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

function paymentLabel(method: string): string {
  const map: Record<string, string> = {
    cash: "Tunai",
    qris: "QRIS",
    manual_transfer: "Transfer",
    bank_transfer: "Transfer",
    midtrans: "Midtrans",
    edc_debit: "EDC Debit",
    edc_kredit: "EDC Kredit",
    pos_split: "Split",
    cod: "COD",
    free: "Gratis (Poin)",
  };
  return map[method] || method || "-";
}

export type ReceiptPrintConfig = {
  paperWidth: "58" | "80" | string;
  copies: number;
  header: string;
  footer: string;
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function buildReceiptEscPos(
  order: OrderDetail,
  store: Store | null,
  cashierName: string,
  cfg: ReceiptPrintConfig,
): Uint8Array {
  const width = cfg.paperWidth === "80" ? 48 : 32;
  const e = new EscPos(width);

  e.align("center").bold(true).doubleSize(true);
  if (store?.name) e.line(store.name.toUpperCase());
  e.doubleSize(false).bold(false);
  if (store?.tagline) e.line(store.tagline);
  if (store?.city) e.line(store.city);
  if (store?.whatsapp_number) e.line("WA: " + store.whatsapp_number);
  if (cfg.header.trim()) e.line(cfg.header.trim());

  e.align("left").divider();
  e.line("No : #" + order.order_number);
  e.line("Tgl: " + fmtDateTime(order.created_at ?? new Date().toISOString()));
  e.line("Kasir: " + cashierName);
  e.divider();

  for (const it of order.items) {
    e.line(it.product_name + (it.variant_name ? ` (${it.variant_name})` : ""));
    for (const m of it.modifiers ?? []) {
      e.line("  + " + m.option_name);
    }
    e.leftRight(
      `${it.quantity} x ${formatRupiah(it.unit_price_cents)}`,
      formatRupiah(it.subtotal_cents),
    );
  }
  e.divider();

  e.leftRight("Subtotal", formatRupiah(order.subtotal_cents));
  const loyaltyDisc = order.loyalty_discount_cents ?? 0;
  const manualDisc = Math.max(0, order.discount_cents - loyaltyDisc);
  if (manualDisc > 0) e.leftRight("Diskon", "-" + formatRupiah(manualDisc));
  if (loyaltyDisc > 0)
    e.leftRight(
      `Poin (${(order.loyalty_points_redeemed ?? 0).toLocaleString("id-ID")})`,
      "-" + formatRupiah(loyaltyDisc),
    );
  if (order.shipping_cents > 0)
    e.leftRight("Ongkir", formatRupiah(order.shipping_cents));
  e.bold(true).leftRight("TOTAL", formatRupiah(order.total_cents)).bold(false);
  e.divider();
  e.leftRight(paymentLabel(order.payment_method), formatRupiah(order.total_cents));
  e.divider();

  e.align("center").line("Terima kasih sudah berbelanja!");
  if (store?.footer_text) e.line(store.footer_text);
  if (cfg.footer.trim()) e.line(cfg.footer.trim());

  e.feed(3).cut();
  return e.bytes();
}

// printReceiptBluetooth connects (if needed) and prints `copies` copies.
export async function printReceiptBluetooth(
  order: OrderDetail,
  store: Store | null,
  cashierName: string,
  cfg: ReceiptPrintConfig,
): Promise<void> {
  if (!conn) await connectPrinter();
  const bytes = buildReceiptEscPos(order, store, cashierName, cfg);
  const copies = Math.max(1, Math.min(5, cfg.copies || 1));
  for (let i = 0; i < copies; i++) {
    await writeBytes(bytes);
    await delay(120);
  }
}

// printTestBluetooth prints a short test slip to verify the connection.
export async function printTestBluetooth(paperWidth: string): Promise<void> {
  if (!conn) await connectPrinter();
  const width = paperWidth === "80" ? 48 : 32;
  const e = new EscPos(width);
  e.align("center").bold(true).doubleSize(true).line("TEST PRINT");
  e.doubleSize(false).bold(false).line("SellOn Kasir");
  e.align("left").divider();
  e.line("Printer terhubung dengan baik.");
  e.line("Lebar kertas: " + (paperWidth === "80" ? "80mm" : "58mm"));
  e.line("Waktu: " + fmtDateTime(new Date().toISOString()));
  e.divider().align("center").line("Siap dipakai!").feed(3).cut();
  await writeBytes(e.bytes());
}
