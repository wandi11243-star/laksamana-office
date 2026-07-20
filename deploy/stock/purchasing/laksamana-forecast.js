/*
 * laksamana-forecast.js. Shared restock/forecast logic for the Laksamana apps.
 *
 * ONE place for the restock math so the Kitchen and Purchasing HTML files don't
 * each re-implement it. This is the JavaScript twin of the Python dashboard's
 * build_restock_table / restock_status (Magang/Dashboard/common.py): given a
 * material's forecast (reorder point, avg daily use, tier, pack size) and its
 * current stock, it computes status, days-of-cover, a suggested order quantity,
 * and how long a proposed restock will last.
 *
 * Data in:
 *   - forecast payload  : { generated, count, items: { "<Product Name>": {...} } }
 *                         produced by Code/export_forecast.py, fetched from an
 *                         Apps Script Web App (like the item DB) or embedded.
 *   - current stock     : { "<Product Name>": { stock_now, stock_unit } }
 *                         parsed from the uploaded "Stock Today" file.
 *
 * Everything is namespaced under window.LaksForecast so it can't collide with
 * the apps' existing globals.
 */
(function (global) {
  "use strict";

  // Days of usage a suggested order should top the shelf up to.
  var TARGET_COVER_DAYS = 14;

  // Status palette. Mirrors the Python dashboard (RISK/WARN/OK) so the two
  // systems read identically. { key, label (id), color, bg }.
  var STATUS = {
    order:  { key: "order",  label: "Pesan sekarang",   color: "#b91c1c", bg: "#FBE4E2" },
    soon:   { key: "soon",   label: "Segera siapkan",   color: "#b45309", bg: "#FCEFD9" },
    safe:   { key: "safe",   label: "Aman",             color: "#15803d", bg: "#E6F4EA" },
    check:  { key: "check",  label: "Cek pencatatan",   color: "#4b5563", bg: "#E8E8F0" },
    nostk:  { key: "nostk",  label: "Stok belum ada",   color: "#6b7280", bg: "#F1F5F9" },
    nofc:   { key: "nofc",   label: "Belum ada forecast", color: "#6b7280", bg: "#F1F5F9" },
  };

  var TIER_LABEL = { A: "Andal", B: "Cukup", C: "Perlu dicek" };

  function norm(s) {
    return String(s == null ? "" : s).trim().toUpperCase().replace(/\s+/g, " ");
  }

  // A "loose" key that drops trailing size/unit hints in parentheses, so the
  // Laksamana item-DB name ("Bawang Putih Kupas") matches the forecast name
  // ("Bawang Putih Kupas (Kg)") for the SAME material. Only the trailing
  // parenthetical is removed (e.g. "(Kg)", "(500Ml)", "(20Kg)", "(10/Pack)").
  function looseKey(s) {
    return norm(String(s).replace(/\s*\([^()]*\)\s*$/, ""));
  }

  /*
   * NAME_ALIASES. The Laksamana item DB and the forecast (Master Product Data)
   * are two independently-maintained name lists, and some materials genuinely
   * use different vocabulary in each (e.g. kitchen staff type "Basil Fresh",
   * the forecast/BoM data calls it "Daun Basil (30Gr)"). Exact/loose matching
   * (above) only handles casing/spacing/unit-suffix differences, it can't
   * guess that two completely different strings mean the same ingredient.
   *
   * This table is the fix for THAT case: item-DB name (left, normalised
   * UPPERCASE) -> the forecast's name (right, exactly as it appears in the
   * forecast payload). Add an entry whenever you confirm a real rename (e.g.
   * from the Kitchen app showing "Belum ada data prakiraan" for something you
   * know IS forecast, just under another name).
   *
   * This is the JS twin of NAME_ALIASES in Code/bom_explode.py, that one
   * reconciles names INSIDE the BoM/forecast build; this one reconciles the
   * forecast against the Laksamana item DB at lookup time. Edit this file
   * directly; no Python re-run needed, takes effect on next page load.
   */
  var NAME_ALIASES = {
    "BASIL FRESH": "Daun Basil (30Gr)",
    // "ITEM DB NAME": "Forecast Name As Written In forecast_export.json",

  };

  // ---- lookup helpers -------------------------------------------------------

  // Build normalised-name indexes so lookups tolerate casing/spacing AND the
  // "(unit)" suffix difference between the item DB and the forecast.
  function indexByName(obj) {
    var idx = { exact: {}, loose: {} };
    if (obj) Object.keys(obj).forEach(function (k) {
      idx.exact[norm(k)] = obj[k];
      // first writer wins for a loose key (avoid a size variant clobbering base)
      var lk = looseKey(k);
      if (!(lk in idx.loose)) idx.loose[lk] = obj[k];
    });
    return idx;
  }

  // Look up a value in an index: exact name, then loose (unit-suffix-stripped)
  // name, then the manual NAME_ALIASES table (for genuine renames the other
  // two can't catch, like "Basil Fresh" -> "Daun Basil (30Gr)").
  function lookup(idx, name) {
    if (!idx) return null;
    var e = idx.exact[norm(name)];
    if (e !== undefined) return e;
    var l = idx.loose[looseKey(name)];
    if (l !== undefined) return l;
    var alias = NAME_ALIASES[norm(name)];
    if (alias) {
      var a = idx.exact[norm(alias)];
      if (a !== undefined) return a;
      var al = idx.loose[looseKey(alias)];
      if (al !== undefined) return al;
    }
    return null;
  }

  /*
   * ForecastBook. Wraps the forecast payload + current stock and answers
   * per-item questions. Construct once, reuse for every row.
   */
  function ForecastBook(forecastPayload, stockMap) {
    this.items = (forecastPayload && forecastPayload.items) || {};
    this._fIdx = indexByName(this.items);
    this.setStock(stockMap);
  }

  ForecastBook.prototype.setStock = function (stockMap) {
    this.stock = stockMap || {};
    this._sIdx = indexByName(this.stock);
  };

  ForecastBook.prototype.forecastFor = function (name) {
    return lookup(this._fIdx, name);
  };

  ForecastBook.prototype.stockFor = function (name) {
    var s = lookup(this._sIdx, name);
    return s && s.stock_now != null ? Number(s.stock_now) : null;
  };

  /*
   * Convert a stock quantity (counted in the item's stock/default unit) into the
   * forecast's BASE unit, using the pack size from the forecast payload. The
   * uploaded Stock Today file reports Stock Qty in the Default Unit; per_purchase
   * = base units per that unit (e.g. Beras: 1 Karung = 20000 g). If the stock
   * unit already matches the base unit, no scaling is applied.
   */
  ForecastBook.prototype.stockInBase = function (name) {
    var qty = this.stockFor(name);
    if (qty == null) return null;
    var fc = this.forecastFor(name);
    if (!fc) return qty;
    var s = lookup(this._sIdx, name);
    var su = s && s.stock_unit ? norm(s.stock_unit) : "";
    // stock counted in the purchase/default unit -> multiply by pack size
    if (su && fc.purchase_unit && su === norm(fc.purchase_unit)) {
      return qty * (fc.per_purchase || 1);
    }
    // stock already in base unit (or unknown) -> take as-is
    return qty;
  };

  // ---- the core computation -------------------------------------------------

  /*
   * assess(name) -> a plain object the UI renders. Never throws; returns a
   * status even when there's no forecast or no stock, so the caller can always
   * show *something* sensible.
   */
  ForecastBook.prototype.assess = function (name) {
    var fc = this.forecastFor(name);
    if (!fc) {
      return { hasForecast: false, status: STATUS.nofc };
    }
    var baseUnit = fc.unit || "";
    var avg = Number(fc.avg_daily) || 0;
    var reorder = Number(fc.reorder_point) || 0;
    var stockBase = this.stockInBase(name);

    var out = {
      hasForecast: true,
      name: name,
      unit: baseUnit,
      tier: fc.tier || "C",
      tierLabel: TIER_LABEL[fc.tier] || "",
      wape: fc.wape,
      avgDaily: avg,
      reorderPoint: reorder,
      leadDays: fc.lead_days,
      purchaseUnit: fc.purchase_unit || "",
      perPurchase: fc.per_purchase || 1,
      stockNow: stockBase,          // in base unit
      status: STATUS.nostk,
      daysCover: null,
      suggestOrderBase: null,       // suggested order, base units
      suggestOrderPacks: null,      // rounded up to whole purchase packs
    };

    if (stockBase == null) {
      // no stock uploaded yet: still show reorder point + suggestion target
      out.status = STATUS.nostk;
      return out;
    }

    // status (mirrors restock_status)
    if (stockBase < 0)              out.status = STATUS.check;
    else if (stockBase <= reorder)  out.status = STATUS.order;
    else if (stockBase <= reorder * 1.5) out.status = STATUS.soon;
    else                            out.status = STATUS.safe;

    // days of cover at average daily use
    out.daysCover = avg > 0 ? stockBase / avg : null;

    // suggested order: top up to TARGET_COVER_DAYS of use, only if at/under RP
    if (stockBase <= reorder && avg > 0) {
      var needBase = Math.max(0, avg * TARGET_COVER_DAYS - stockBase);
      out.suggestOrderBase = needBase;
      var pack = fc.per_purchase || 1;
      out.suggestOrderPacks = pack > 0 ? Math.ceil(needBase / pack) : null;
    } else {
      out.suggestOrderBase = 0;
      out.suggestOrderPacks = 0;
    }
    return out;
  };

  /*
   * UNIVERSAL_FACTORS. Fixed, unambiguous conversions to a BASE unit that hold
   * for ANY material (unlike "Pack"/"Dus"/"Sack", which vary by item and are
   * only convertible via that item's own per_purchase pack size). Keyed by
   * [dropdown unit][item's base unit] -> multiplier. Covers the Kitchen order
   * row's fixed unit dropdown (Kg/Gram/Pcs/Pack/Dus/Sack/Ikat).
   */
  var UNIVERSAL_FACTORS = {
    KG:   { "GRAM (GR)": 1000, "GRAM": 1000, "KG": 1 },
    GRAM: { "GRAM (GR)": 1,    "GRAM": 1,    "KG": 0.001 },
    PCS:  { "PCS": 1 },
    IKAT: { "IKAT": 1 },
  };

  // Convert `qty` of `unit` into the item's BASE unit. Tries, in order: (1) the
  // universal Kg/Gram/Pcs/Ikat table (safe for ANY item), (2) the item-specific
  // purchase-pack size when `unit` matches its purchase_unit (Pack/Dus/Sack/
  // Btl/etc, ambiguous in general, but exact for THIS item), (3) as-is if the
  // unit already equals the base unit, (4) otherwise left unconverted (flagged
  // by the caller via the returned `converted` flag so it isn't silently wrong).
  function toBaseUnit(qty, unit, fc) {
    var nu = norm(unit), baseUnit = norm(fc.unit || "");
    var uf = UNIVERSAL_FACTORS[nu];
    if (uf && uf[baseUnit] != null) return { qty: qty * uf[baseUnit], converted: true };
    if (unit && fc.purchase_unit && nu === norm(fc.purchase_unit)) {
      return { qty: qty * (fc.per_purchase || 1), converted: true };
    }
    if (nu === baseUnit) return { qty: qty, converted: true };
    return { qty: qty, converted: false };
  }

  /*
   * howLongWillLast(name, addQty, addUnit) -> days that (current stock + a
   * proposed restock) will last at average daily use. Converts addQty/addUnit
   * to the item's base unit first (see toBaseUnit). Returns null if we can't
   * compute (no forecast / zero usage).
   */
  ForecastBook.prototype.howLongWillLast = function (name, addQty, addUnit) {
    var fc = this.forecastFor(name);
    if (!fc) return null;
    var avg = Number(fc.avg_daily) || 0;
    if (avg <= 0) return null;
    var stockBase = this.stockInBase(name);
    if (stockBase == null) stockBase = 0;

    var add = toBaseUnit(Number(addQty) || 0, addUnit, fc).qty;
    return (stockBase + add) / avg;
  };

  // ---- stock-file parsing (shared) -----------------------------------------

  /*
   * Parse an uploaded "Stock Today" workbook (or the beverage/food opname format)
   * into { "<Product Name>": { stock_now, stock_unit } }. Requires SheetJS (XLSX)
   * to be loaded by the host page; if absent, returns null so the caller can warn.
   * The header row is found by scanning for "Product Name" (banner-prefixed
   * export). Uses "Stock Qty" and "Default Unit"/"Unit".
   */
  function parseStockWorkbook(arrayBuffer) {
    if (typeof XLSX === "undefined") return null;
    var wb = XLSX.read(arrayBuffer, { type: "array" });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    var hr = -1;
    for (var i = 0; i < Math.min(rows.length, 25); i++) {
      if (rows[i].map(function (v) { return String(v).trim(); }).indexOf("Product Name") >= 0) {
        hr = i; break;
      }
    }
    if (hr < 0) return { error: "Kolom 'Product Name' tidak ditemukan." };
    var header = rows[hr].map(function (v) { return String(v).trim(); });
    var ci = function (n) { return header.indexOf(n); };
    var pName = ci("Product Name");
    var pStock = ci("Stock Qty") >= 0 ? ci("Stock Qty") : ci("Effective Stock");
    var pUnit = ci("Default Unit") >= 0 ? ci("Default Unit") : ci("Unit");
    if (pName < 0 || pStock < 0) return { error: "Kolom stok tidak lengkap." };

    var out = {}, asOf = null;
    // banner Stock Date, if present
    for (var b = 0; b < hr; b++) {
      if (String(rows[b][0]).trim() === "Stock Date") asOf = String(rows[b][1]).trim();
    }
    for (var r = hr + 1; r < rows.length; r++) {
      var nm = String(rows[r][pName] || "").trim();
      if (!nm || nm.toLowerCase() === "nan") continue;
      var q = parseFloat(rows[r][pStock]);
      if (isNaN(q)) continue;
      var u = pUnit >= 0 ? String(rows[r][pUnit] || "").trim() : "";
      // sum across locations if a product repeats
      if (out[nm]) out[nm].stock_now += q;
      else out[nm] = { stock_now: q, stock_unit: u };
    }
    return { stock: out, as_of: asOf, count: Object.keys(out).length };
  }

  // ---- formatting helpers (used by both apps for consistent display) --------

  function fmtNum(n, dp) {
    if (n == null || isNaN(n)) return "-";
    dp = dp == null ? 0 : dp;
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: dp });
  }

  function fmtDays(d) {
    if (d == null || isNaN(d)) return "-";
    if (!isFinite(d)) return "∞";
    return d >= 10 ? Math.round(d) + " hari" : (Math.round(d * 10) / 10) + " hari";
  }

  /* ==========================================================================
   * KEANDALAN PRAKIRAAN (health)
   *
   * Ringkasan "seberapa bisa dipercaya prakiraan tiap bahan", dari field tier
   * & wape yang sudah ada di payload. Murni transformasi data: TIDAK menyentuh
   * DOM, jadi bisa diuji langsung tanpa browser (itu sebabnya tinggal di sini,
   * bukan di dalam index.html).
   * ========================================================================== */

  // Payload -> array datar, satu baris per bahan. Dipanggil sekali saat forecast
  // dimuat; hasilnya dipakai ulang tiap kali admin mengurutkan/mencari.
  function healthRows(forecastPayload) {
    var items = (forecastPayload && forecastPayload.items) || {};
    return Object.keys(items).map(function (nama) {
      var f = items[nama] || {};
      return {
        nama: nama,
        tier: f.tier || "C",
        // wape null = model tidak diuji untuk bahan ini. Dibedakan dari 0
        // (yang berarti "diuji, dan tidak pernah meleset").
        wape: (f.wape == null || isNaN(f.wape)) ? null : Number(f.wape),
        avgDaily: Number(f.avg_daily) || 0,
        unit: f.unit || "",
      };
    });
  }

  // Jumlah bahan per tier. Selalu dihitung dari SELURUH baris (bukan hasil
  // filter) supaya angka ringkasan tidak ikut berubah saat admin mengetik cari.
  function healthTally(rows) {
    var t = { A: 0, B: 0, C: 0 };
    (rows || []).forEach(function (r) {
      if (t[r.tier] == null) t[r.tier] = 0;
      t[r.tier]++;
    });
    return t;
  }

  /* Pembanding urutan. Bahan TANPA nilai wape selalu didorong ke bawah pada
     kedua urutan berbasis wape: null bukan "paling akurat", dan menaruhnya di
     puncak daftar "paling akurat" akan menyesatkan orang yang memesan. */
  var HEALTH_SORTS = {
    wape_desc:  function (a, b) { return (b.wape == null ? -1 : b.wape) - (a.wape == null ? -1 : a.wape); },
    wape_asc:   function (a, b) { return (a.wape == null ? Infinity : a.wape) - (b.wape == null ? Infinity : b.wape); },
    usage_desc: function (a, b) { return b.avgDaily - a.avgDaily; },
    name:       function (a, b) { return a.nama.localeCompare(b.nama, "id"); },
  };

  /* Saring + urutkan. Mengembalikan { rows, total } — `total` adalah jumlah
     SETELAH filter tapi SEBELUM dipotong `limit`, supaya pemanggil bisa bilang
     "menampilkan 60 dari 143" dengan jujur. */
  function healthView(rows, opts) {
    opts = opts || {};
    var out = rows || [];
    var cari = norm(opts.search || "");
    if (cari) {
      out = out.filter(function (r) { return norm(r.nama).indexOf(cari) !== -1; });
    }
    var kmp = HEALTH_SORTS[opts.sort] || HEALTH_SORTS.wape_desc;
    out = out.slice().sort(kmp);
    var total = out.length;
    if (opts.limit > 0) out = out.slice(0, opts.limit);
    return { rows: out, total: total };
  }

  global.LaksForecast = {
    ForecastBook: ForecastBook,
    parseStockWorkbook: parseStockWorkbook,
    STATUS: STATUS,
    TIER_LABEL: TIER_LABEL,
    TARGET_COVER_DAYS: TARGET_COVER_DAYS,
    norm: norm,
    fmtNum: fmtNum,
    fmtDays: fmtDays,
    healthRows: healthRows,
    healthTally: healthTally,
    healthView: healthView,
    HEALTH_SORTS: HEALTH_SORTS,
  };

  // Ekspor untuk Node (uji tanpa browser). Tidak berpengaruh di browser.
  if (typeof module !== "undefined" && module.exports) module.exports = global.LaksForecast;
})(typeof window !== "undefined" ? window : globalThis);
