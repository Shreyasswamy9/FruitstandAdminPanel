import prisma from "../config/database";
import {
  getAllProductsWithSalesPerformance,
  getDailySalesTrend,
  getProductDetailMetrics,
  getProductPerformance,
  getSalesSummary,
  getTopProducts,
  type ProductPerformanceSortField
} from "../src/services/productAnalytics.service";
import { resolveAnalyticsDateRange } from "../src/utils/analyticsDateRange";

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const normalized = String(value).replace(/\"/g, '""');
  return `"${normalized}"`;
}

function parseSortBy(value: unknown): ProductPerformanceSortField {
  const allowed: ProductPerformanceSortField[] = [
    "productName",
    "unitsSold",
    "grossRevenue",
    "orderCount",
    "averageQuantityPerOrder",
    "averageSellingPrice",
    "firstSaleDate",
    "lastSaleDate"
  ];

  if (typeof value === "string" && allowed.includes(value as ProductPerformanceSortField)) {
    return value as ProductPerformanceSortField;
  }

  return "grossRevenue";
}

function parseSortDirection(value: unknown): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parseSearch(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function registerProductAnalyticsRoutes(
  app: any,
  {
    requireAuth,
    prismaClient = prisma
  }: {
    requireAuth: any;
    prismaClient?: any;
  }
): void {
  app.get("/admin/analytics/products", requireAuth, async (req: any, res: any) => {
    try {
      const query = req.query as Record<string, unknown>;
      const dateRange = resolveAnalyticsDateRange(query);
      const search = parseSearch(query.search);
      const sortBy = parseSortBy(query.sortBy);
      const sortDirection = parseSortDirection(query.sortDirection);

      const [summary, dailyTrend, productPerformance, allProductsPerformance] = await Promise.all([
        getSalesSummary(prismaClient, { start: dateRange.start, endExclusive: dateRange.endExclusive }),
        getDailySalesTrend(prismaClient, { start: dateRange.start, endExclusive: dateRange.endExclusive }),
        getProductPerformance(
          prismaClient,
          { start: dateRange.start, endExclusive: dateRange.endExclusive },
          { search, sortBy, sortDirection }
        ),
        getAllProductsWithSalesPerformance(prismaClient, { start: dateRange.start, endExclusive: dateRange.endExclusive })
      ]);

      const topRevenueProducts = getTopProducts(productPerformance, "grossRevenue", 10);
      const topUnitProducts = getTopProducts(productPerformance, "unitsSold", 10);
      // Low-performing now includes all products (including zero-sales), sorted ascending by revenue
      const lowPerformingProducts = allProductsPerformance.slice(0, 10);

      res.send(
        generateProductAnalyticsPage({
          dateRange,
          search,
          sortBy,
          sortDirection,
          summary,
          dailyTrend,
          productPerformance,
          topRevenueProducts,
          topUnitProducts,
          lowPerformingProducts
        })
      );
    } catch (error) {
      console.error("Failed to render product analytics page", error);
      res.status(500).send("Failed to load product analytics");
    }
  });

  app.get("/analytics/products", requireAuth, (req: any, res: any) => {
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    res.redirect(`/admin/analytics/products${query ? `?${query}` : ""}`);
  });

  app.get("/api/admin/analytics/products/export.csv", requireAuth, async (req: any, res: any) => {
    try {
      const query = req.query as Record<string, unknown>;
      const dateRange = resolveAnalyticsDateRange(query);
      const search = parseSearch(query.search);
      const sortBy = parseSortBy(query.sortBy);
      const sortDirection = parseSortDirection(query.sortDirection);

      const rows = await getProductPerformance(
        prismaClient,
        { start: dateRange.start, endExclusive: dateRange.endExclusive },
        { search, sortBy, sortDirection }
      );

      const headers = [
        "product_id",
        "product_name",
        "units_sold",
        "gross_revenue",
        "orders_containing_product",
        "average_quantity_per_order",
        "average_selling_price",
        "first_sale_date",
        "last_sale_date"
      ];

      const lines = [headers.join(",")];
      for (const row of rows) {
        lines.push(
          [
            csvEscape(row.productId),
            csvEscape(row.productName),
            csvEscape(row.unitsSold),
            csvEscape(row.grossRevenue.toFixed(2)),
            csvEscape(row.orderCount),
            csvEscape(row.averageQuantityPerOrder.toFixed(2)),
            csvEscape(row.averageSellingPrice.toFixed(2)),
            csvEscape(row.firstSaleDate || ""),
            csvEscape(row.lastSaleDate || "")
          ].join(",")
        );
      }

      const filename = `product-sales-${dateRange.startDateInput}-to-${dateRange.endDateInput}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      return res.send(lines.join("\n"));
    } catch (error) {
      console.error("Failed to export product analytics CSV", error);
      return res.status(500).json({ error: "Failed to export CSV" });
    }
  });

  app.get("/api/admin/analytics/products/:productId", requireAuth, async (req: any, res: any) => {
    try {
      const query = req.query as Record<string, unknown>;
      const dateRange = resolveAnalyticsDateRange(query);
      const productId = req.params.productId;

      const detail = await getProductDetailMetrics(
        prismaClient,
        productId,
        { start: dateRange.start, endExclusive: dateRange.endExclusive }
      );

      return res.json(detail);
    } catch (error) {
      console.error("Failed to fetch product detail analytics", error);
      return res.status(500).json({ error: "Failed to fetch product detail analytics" });
    }
  });
}

function generateProductAnalyticsPage(data: {
  dateRange: ReturnType<typeof resolveAnalyticsDateRange>;
  search: string;
  sortBy: ProductPerformanceSortField;
  sortDirection: "asc" | "desc";
  summary: {
    totalRevenue: number;
    totalUnitsSold: number;
    totalOrderCount: number;
    uniqueProductsSold: number;
  };
  dailyTrend: Array<{ date: string; revenue: number; unitsSold: number; orderCount: number }>;
  productPerformance: Array<{
    productId: string;
    productName: string;
    unitsSold: number;
    grossRevenue: number;
    orderCount: number;
    averageQuantityPerOrder: number;
    averageSellingPrice: number;
    firstSaleDate: string | null;
    lastSaleDate: string | null;
  }>;
  topRevenueProducts: Array<{ productName: string; grossRevenue: number }>;
  topUnitProducts: Array<{ productName: string; unitsSold: number }>;
  lowPerformingProducts: Array<{ productName: string; grossRevenue: number }>;
}): string {
  const dashboardData = serializeForInlineScript(data);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Product Sales Analytics</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg: #f3efe8;
      --card: #fffdf8;
      --ink: #1f2933;
      --muted: #5a6b7a;
      --line: #d9cec1;
      --accent: #0b6e4f;
      --accent-2: #e67e22;
      --danger: #9f2a2a;
      --shadow: 0 8px 24px rgba(31, 41, 51, 0.08);
      --radius: 12px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "Trebuchet MS", "Avenir Next", sans-serif;
      background:
        radial-gradient(circle at 20% 10%, rgba(230, 126, 34, 0.08), transparent 28%),
        radial-gradient(circle at 80% 0%, rgba(11, 110, 79, 0.1), transparent 30%),
        var(--bg);
      color: var(--ink);
    }

    .header {
      background: linear-gradient(140deg, #155263, #0b6e4f 60%, #e67e22);
      color: white;
      padding: 18px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      box-shadow: var(--shadow);
    }

    .header-title { font-size: 24px; font-weight: 700; }
    .header-subtitle { font-size: 13px; opacity: 0.9; margin-top: 4px; }

    .header-actions { display: flex; gap: 10px; }

    .btn {
      border: none;
      text-decoration: none;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      color: white;
      background: rgba(255, 255, 255, 0.2);
      transition: transform 0.15s ease, opacity 0.15s ease;
    }

    .btn:hover { transform: translateY(-1px); }
    .btn:active { opacity: 0.85; }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      display: grid;
      gap: 16px;
      animation: fade-in 0.35s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 16px;
    }

    .panel-title { font-size: 17px; font-weight: 700; margin-bottom: 12px; }

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      align-items: end;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field label {
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .field input, .field select {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      background: white;
      color: var(--ink);
      font-size: 14px;
    }

    .filters .submit {
      border: none;
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--accent);
      color: white;
      font-weight: 700;
      cursor: pointer;
      height: 40px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .summary-card {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: white;
      padding: 12px;
    }

    .summary-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 8px;
    }

    .summary-value {
      font-size: 24px;
      font-weight: 800;
      color: var(--ink);
    }

    .summary-footnote { font-size: 12px; color: var(--muted); margin-top: 8px; }

    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 12px;
    }

    .chart-card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: white;
    }

    .table-toolbar {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .chip {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      background: #edf5f2;
      color: #155263;
    }

    .toolbar-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .toolbar-actions input {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px 10px;
      width: 260px;
      max-width: 100%;
    }

    .toolbar-actions a {
      text-decoration: none;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      color: white;
      background: #155263;
    }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: white;
      -webkit-overflow-scrolling: touch;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 12px;
      border-bottom: 1px solid #eee7dc;
      text-align: left;
      font-size: 13px;
      word-break: break-word;
    }

    th {
      position: sticky;
      top: 0;
      background: #f6f2ea;
      z-index: 1;
      cursor: pointer;
      user-select: none;
      font-weight: 700;
      color: #334;
    }

    tr:hover td {
      background: #f9f6f0;
    }

    .money { font-variant-numeric: tabular-nums; }
    .link-row { cursor: pointer; }

    .detail {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      background: #fff;
      display: none;
    }

    .detail.visible { display: block; }

    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }

    .detail-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: #fcfbf8;
    }

    .detail-card .k { font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 700; }
    .detail-card .v { font-size: 18px; font-weight: 700; margin-top: 5px; }

    .detail-table {
      margin-top: 10px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    .detail-table table { width: 100%; }

    .notes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 12px;
    }

    .notes ul { margin: 0; padding-left: 18px; }
    .notes li { margin: 6px 0; color: #384d5f; }

    @media (max-width: 1400px) {
      .filters { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .chart-grid { grid-template-columns: 1fr; }
      .detail-grid { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
      .notes { grid-template-columns: 1fr; }
      th, td { padding: 8px; font-size: 12px; }
    }

    @media (max-width: 1080px) {
      .filters { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .chart-grid { grid-template-columns: 1fr; }
      .detail-grid { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
      .notes { grid-template-columns: 1fr; }
      th, td { padding: 8px; font-size: 12px; }
    }

    @media (max-width: 768px) {
      .container { padding: 12px; gap: 12px; }
      .panel { padding: 12px; }
      .filters { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
      .summary-grid { grid-template-columns: 1fr; }
      .chart-grid { grid-template-columns: 1fr; }
      .detail-grid { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 6px; }
      .notes { grid-template-columns: 1fr; }
      .toolbar-actions { flex-direction: column; width: 100%; }
      .toolbar-actions input { width: 100%; }
      .toolbar-actions a { width: 100%; text-align: center; }
      th, td { padding: 6px; font-size: 11px; }
      .summary-value { font-size: 18px; }
      .header-title { font-size: 18px; }
    }

    @media (max-width: 480px) {
      .header { padding: 12px; }
      .header-title { font-size: 16px; }
      .header-subtitle { font-size: 11px; }
      .container { padding: 10px; gap: 10px; }
      .panel { padding: 10px; }
      .panel-title { font-size: 15px; }
      .filters { grid-template-columns: 1fr; gap: 6px; }
      .summary-grid { grid-template-columns: 1fr; }
      .summary-card { padding: 10px; }
      .summary-label { font-size: 11px; }
      .summary-value { font-size: 16px; }
      .chart-grid { grid-template-columns: 1fr; }
      .detail-grid { grid-template-columns: 1fr; }
      .detail-card { padding: 6px; }
      .detail-card .k { font-size: 10px; }
      .detail-card .v { font-size: 14px; }
      .notes { grid-template-columns: 1fr; }
      th, td { padding: 5px; font-size: 10px; white-space: normal; }
      .toolbar-actions { flex-direction: column; width: 100%; gap: 6px; }
      .toolbar-actions input { width: 100%; }
      .toolbar-actions a { width: 100%; text-align: center; }
      .chip { font-size: 11px; padding: 3px 8px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <div class="header-title">Product Sales Analytics</div>
      <div class="header-subtitle">${data.dateRange.label} • Paid/Completed Orders Only</div>
    </div>
    <div class="header-actions">
      <a class="btn" href="/dashboard">Back To Dashboard</a>
    </div>
  </header>

  <main class="container">
    <section class="panel">
      <div class="panel-title">Date Filters</div>
      <form class="filters" method="GET" action="/admin/analytics/products">
        <div class="field">
          <label>Preset</label>
          <select name="preset" id="presetSelect">
            <option value="today" ${data.dateRange.preset === "today" ? "selected" : ""}>Today</option>
            <option value="yesterday" ${data.dateRange.preset === "yesterday" ? "selected" : ""}>Yesterday</option>
            <option value="last7" ${data.dateRange.preset === "last7" ? "selected" : ""}>Last 7 Days</option>
            <option value="last30" ${data.dateRange.preset === "last30" ? "selected" : ""}>Last 30 Days</option>
            <option value="thisMonth" ${data.dateRange.preset === "thisMonth" ? "selected" : ""}>This Month</option>
            <option value="custom" ${data.dateRange.preset === "custom" ? "selected" : ""}>Custom</option>
          </select>
        </div>
        <div class="field">
          <label>Start Date</label>
          <input type="date" id="startDateInput" name="startDate" value="${data.dateRange.startDateInput}" />
        </div>
        <div class="field">
          <label>End Date</label>
          <input type="date" id="endDateInput" name="endDate" value="${data.dateRange.endDateInput}" />
        </div>
        <div class="field">
          <label>Sort By</label>
          <select name="sortBy">
            <option value="grossRevenue" ${data.sortBy === "grossRevenue" ? "selected" : ""}>Revenue</option>
            <option value="unitsSold" ${data.sortBy === "unitsSold" ? "selected" : ""}>Units Sold</option>
            <option value="productName" ${data.sortBy === "productName" ? "selected" : ""}>Product Name</option>
            <option value="orderCount" ${data.sortBy === "orderCount" ? "selected" : ""}>Orders</option>
            <option value="averageSellingPrice" ${data.sortBy === "averageSellingPrice" ? "selected" : ""}>Avg Price</option>
          </select>
        </div>
        <div class="field">
          <label>Sort Direction</label>
          <select name="sortDirection">
            <option value="desc" ${data.sortDirection === "desc" ? "selected" : ""}>Descending</option>
            <option value="asc" ${data.sortDirection === "asc" ? "selected" : ""}>Ascending</option>
          </select>
        </div>
        <div class="field" style="grid-column: span 2;">
          <label>Search Product Name (Server Filter)</label>
          <input type="text" name="search" value="${data.search.replace(/"/g, "&quot;")}" placeholder="eg. Tee, Hoodie, Joggers" />
        </div>
        <button class="submit" type="submit">Apply</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title">Summary</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Total Revenue</div>
          <div class="summary-value">${formatCurrency(data.summary.totalRevenue)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Units Sold</div>
          <div class="summary-value">${data.summary.totalUnitsSold.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Orders</div>
          <div class="summary-value">${data.summary.totalOrderCount.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Unique Products Sold</div>
          <div class="summary-value">${data.summary.uniqueProductsSold.toLocaleString()}</div>
        </div>
      </div>
      <div class="summary-footnote">Answers this week/month questions directly: what sold, which products moved fastest, and sales intensity by day.</div>
    </section>

    <section class="panel">
      <div class="panel-title">Sales Charts</div>
      <div class="chart-grid">
        <div class="chart-card"><canvas id="dailyRevenueChart" height="180"></canvas></div>
        <div class="chart-card"><canvas id="dailyUnitsChart" height="180"></canvas></div>
        <div class="chart-card"><canvas id="topRevenueChart" height="180"></canvas></div>
        <div class="chart-card"><canvas id="topUnitsChart" height="180"></canvas></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">Product Performance</div>
      <div class="table-toolbar">
        <span class="chip" id="rowCountChip">${data.productPerformance.length} products</span>
        <div class="toolbar-actions">
          <input id="clientSearchInput" type="text" placeholder="Filter loaded rows by product name" />
          <a id="exportCsvLink" href="/api/admin/analytics/products/export.csv">Export CSV</a>
        </div>
      </div>
      <div class="table-wrap">
        <table id="performanceTable">
          <thead>
            <tr>
              <th data-key="productName">Product</th>
              <th data-key="unitsSold">Units Sold</th>
              <th data-key="grossRevenue">Gross Revenue</th>
              <th data-key="orderCount">Orders</th>
              <th data-key="averageQuantityPerOrder">Avg Qty / Order</th>
              <th data-key="averageSellingPrice">Avg Selling Price</th>
              <th data-key="firstSaleDate">First Sale</th>
              <th data-key="lastSaleDate">Most Recent Sale</th>
            </tr>
          </thead>
          <tbody id="performanceBody"></tbody>
        </table>
      </div>
      <div id="detailSection" class="detail"></div>
    </section>

    <section class="panel notes">
      <div>
        <div class="panel-title">Top Sellers</div>
        <ul id="topSellerList"></ul>
      </div>
      <div>
        <div class="panel-title">Underperforming Products</div>
        <ul id="lowSellerList"></ul>
      </div>
    </section>
  </main>

  <script>
    const analyticsData = ${dashboardData};
    const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

    let tableRows = [...analyticsData.productPerformance];
    let currentSort = { key: analyticsData.sortBy, direction: analyticsData.sortDirection };
    let detailChart = null;

    function fmtMoney(value) {
      return moneyFormatter.format(Number(value || 0));
    }

    function fmtNumber(value) {
      return Number(value || 0).toLocaleString();
    }

    function buildExportUrl() {
      const params = new URLSearchParams(window.location.search);
      const searchValue = document.getElementById("clientSearchInput").value.trim();
      if (searchValue) {
        params.set("search", searchValue);
      }
      return "/api/admin/analytics/products/export.csv" + (params.toString() ? "?" + params.toString() : "");
    }

    function applyClientFilter() {
      const needle = document.getElementById("clientSearchInput").value.trim().toLowerCase();
      const filtered = analyticsData.productPerformance.filter((row) => row.productName.toLowerCase().includes(needle));
      tableRows = filtered;
      renderTable();
      document.getElementById("exportCsvLink").href = buildExportUrl();
      document.getElementById("rowCountChip").textContent = filtered.length + " products";
    }

    function sortRows(rows, key, direction) {
      const factor = direction === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const va = a[key];
        const vb = b[key];

        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;

        if (typeof va === "string" || typeof vb === "string") {
          return String(va).localeCompare(String(vb)) * factor;
        }

        return (Number(va) - Number(vb)) * factor;
      });
    }

    function renderTable() {
      const body = document.getElementById("performanceBody");
      const rows = sortRows(tableRows, currentSort.key, currentSort.direction);

      body.innerHTML = rows.map((row) => {
        return '<tr class="link-row" data-product-id="' + row.productId + '">' +
          '<td>' + row.productName + '</td>' +
          '<td>' + fmtNumber(row.unitsSold) + '</td>' +
          '<td class="money">' + fmtMoney(row.grossRevenue) + '</td>' +
          '<td>' + fmtNumber(row.orderCount) + '</td>' +
          '<td>' + Number(row.averageQuantityPerOrder || 0).toFixed(2) + '</td>' +
          '<td class="money">' + fmtMoney(row.averageSellingPrice) + '</td>' +
          '<td>' + (row.firstSaleDate || '-') + '</td>' +
          '<td>' + (row.lastSaleDate || '-') + '</td>' +
          '</tr>';
      }).join("");

      body.querySelectorAll("tr").forEach((tr) => {
        tr.addEventListener("click", () => {
          const productId = tr.getAttribute("data-product-id");
          if (productId) showProductDetail(productId);
        });
      });
    }

    async function showProductDetail(productId) {
      const detailSection = document.getElementById("detailSection");
      detailSection.classList.add("visible");
      detailSection.innerHTML = "Loading product detail...";

      const params = new URLSearchParams(window.location.search);
      try {
        const response = await fetch("/api/admin/analytics/products/" + productId + "?" + params.toString());
        if (!response.ok) throw new Error("Failed detail fetch");

        const detail = await response.json();
        const recentOrdersHtml = detail.recentOrders.length
          ? detail.recentOrders.map((order) => {
            return '<tr>' +
              '<td>' + order.orderNumber + '</td>' +
              '<td>' + new Date(order.createdAt).toISOString().slice(0, 10) + '</td>' +
              '<td>' + order.customerName + '</td>' +
              '<td>' + (order.status || '-') + '</td>' +
              '<td>' + (order.paymentStatus || '-') + '</td>' +
              '<td>' + fmtNumber(order.unitsSold) + '</td>' +
              '<td>' + fmtMoney(order.grossRevenue) + '</td>' +
              '</tr>';
          }).join('')
          : '<tr><td colspan="7">No recent orders in this range.</td></tr>';

        const bestDay = detail.bestSalesDay ? detail.bestSalesDay.date : '-';
        const worstDay = detail.worstSalesDay ? detail.worstSalesDay.date : '-';

        detailSection.innerHTML =
          '<div class="detail-header">' +
            '<div>' +
              '<h3 style="margin:0;">' + detail.productName + '</h3>' +
              '<div style="font-size:12px;color:#5a6b7a;">Product ID: ' + detail.productId + '</div>' +
            '</div>' +
            '<button class="btn" style="background:#155263;" id="closeDetailBtn">Close</button>' +
          '</div>' +
          '<div class="detail-grid">' +
            '<div class="detail-card"><div class="k">Units Sold</div><div class="v">' + fmtNumber(detail.totalUnitsSold) + '</div></div>' +
            '<div class="detail-card"><div class="k">Total Revenue</div><div class="v">' + fmtMoney(detail.totalRevenue) + '</div></div>' +
            '<div class="detail-card"><div class="k">Orders With Product</div><div class="v">' + fmtNumber(detail.orderCount) + '</div></div>' +
            '<div class="detail-card"><div class="k">Avg Selling Price</div><div class="v">' + fmtMoney(detail.averageSellingPrice) + '</div></div>' +
            '<div class="detail-card"><div class="k">Avg Qty / Order</div><div class="v">' + Number(detail.averageQuantityPerOrder || 0).toFixed(2) + '</div></div>' +
            '<div class="detail-card"><div class="k">Last 7d Revenue</div><div class="v">' + fmtMoney(detail.last7Days.revenue) + '</div></div>' +
            '<div class="detail-card"><div class="k">Last 7d Units</div><div class="v">' + fmtNumber(detail.last7Days.unitsSold) + '</div></div>' +
            '<div class="detail-card"><div class="k">Last 30d Revenue</div><div class="v">' + fmtMoney(detail.last30Days.revenue) + '</div></div>' +
            '<div class="detail-card"><div class="k">Last 30d Units</div><div class="v">' + fmtNumber(detail.last30Days.unitsSold) + '</div></div>' +
            '<div class="detail-card"><div class="k">Best / Worst Day</div><div class="v" style="font-size:13px;">' + bestDay + ' / ' + worstDay + '</div></div>' +
          '</div>' +
          '<div class="chart-card" style="margin-top:8px;"><canvas id="detailTrendChart" height="150"></canvas></div>' +
          '<div class="detail-table">' +
            '<table>' +
              '<thead>' +
                '<tr>' +
                  '<th>Order #</th>' +
                  '<th>Date</th>' +
                  '<th>Customer</th>' +
                  '<th>Status</th>' +
                  '<th>Payment</th>' +
                  '<th>Units</th>' +
                  '<th>Revenue</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' + recentOrdersHtml + '</tbody>' +
            '</table>' +
          '</div>';

        document.getElementById("closeDetailBtn").addEventListener("click", () => {
          detailSection.classList.remove("visible");
          detailSection.innerHTML = "";
        });

        const ctx = document.getElementById("detailTrendChart");
        const labels = detail.salesTrend.map((d) => d.date);
        const revenue = detail.salesTrend.map((d) => d.revenue);
        const units = detail.salesTrend.map((d) => d.unitsSold);

        if (detailChart) {
          detailChart.destroy();
          detailChart = null;
        }

        detailChart = new Chart(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Revenue",
                data: revenue,
                borderColor: "#155263",
                backgroundColor: "rgba(21,82,99,0.18)",
                tension: 0.2,
                yAxisID: "yRevenue"
              },
              {
                label: "Units Sold",
                data: units,
                borderColor: "#e67e22",
                backgroundColor: "rgba(230,126,34,0.18)",
                tension: 0.2,
                yAxisID: "yUnits"
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              yRevenue: { type: "linear", position: "left" },
              yUnits: { type: "linear", position: "right", grid: { drawOnChartArea: false } }
            }
          }
        });
      } catch (error) {
        detailSection.innerHTML = "Failed to load product detail analytics.";
      }
    }

    function renderTopLists() {
      const topList = document.getElementById("topSellerList");
      const lowList = document.getElementById("lowSellerList");

      topList.innerHTML = analyticsData.topRevenueProducts
        .map((row) => '<li>' + row.productName + ': ' + fmtMoney(row.grossRevenue) + '</li>')
        .join("") || "<li>No top products in this range.</li>";

      lowList.innerHTML = analyticsData.lowPerformingProducts
        .map((row) => '<li>' + row.productName + ': ' + fmtMoney(row.grossRevenue) + '</li>')
        .join("") || "<li>No underperforming products in this range.</li>";
    }

    function buildCharts() {
      const labels = analyticsData.dailyTrend.map((d) => d.date);
      const revenue = analyticsData.dailyTrend.map((d) => d.revenue);
      const units = analyticsData.dailyTrend.map((d) => d.unitsSold);

      new Chart(document.getElementById("dailyRevenueChart"), {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Daily Revenue",
            data: revenue,
            borderColor: "#0b6e4f",
            backgroundColor: "rgba(11,110,79,0.2)",
            fill: true,
            tension: 0.25
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      new Chart(document.getElementById("dailyUnitsChart"), {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Daily Units Sold",
            data: units,
            borderColor: "#e67e22",
            backgroundColor: "rgba(230,126,34,0.2)",
            fill: true,
            tension: 0.25
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      new Chart(document.getElementById("topRevenueChart"), {
        type: "bar",
        data: {
          labels: analyticsData.topRevenueProducts.map((p) => p.productName),
          datasets: [{
            label: "Top 10 Revenue",
            data: analyticsData.topRevenueProducts.map((p) => p.grossRevenue),
            backgroundColor: "rgba(11,110,79,0.7)"
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      new Chart(document.getElementById("topUnitsChart"), {
        type: "bar",
        data: {
          labels: analyticsData.topUnitProducts.map((p) => p.productName),
          datasets: [{
            label: "Top 10 Units Sold",
            data: analyticsData.topUnitProducts.map((p) => p.unitsSold),
            backgroundColor: "rgba(230,126,34,0.8)"
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    document.querySelectorAll("#performanceTable th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-key");
        if (!key) return;

        if (currentSort.key === key) {
          currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
        } else {
          currentSort.key = key;
          currentSort.direction = "desc";
        }

        renderTable();
      });
    });

    document.getElementById("presetSelect").addEventListener("change", (event) => {
      const value = event.target.value;
      const customFields = [document.getElementById("startDateInput"), document.getElementById("endDateInput")];
      const disabled = value !== "custom";
      customFields.forEach((el) => {
        el.disabled = disabled;
        el.style.opacity = disabled ? "0.6" : "1";
      });
    });

    document.getElementById("clientSearchInput").addEventListener("input", () => {
      applyClientFilter();
    });



    document.getElementById("presetSelect").dispatchEvent(new Event("change"));
    document.getElementById("exportCsvLink").href = buildExportUrl();
    renderTopLists();
    buildCharts();
    renderTable();
  </script>
</body>
</html>
`;
}
