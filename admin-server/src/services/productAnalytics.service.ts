import { Prisma } from "@prisma/client";

export interface AnalyticsWindow {
  start: Date;
  endExclusive: Date;
}

export interface SalesSummary {
  totalRevenue: number;
  totalUnitsSold: number;
  totalOrderCount: number;
  uniqueProductsSold: number;
}

export interface DailySalesPoint {
  date: string;
  revenue: number;
  unitsSold: number;
  orderCount: number;
}

export interface ProductPerformanceRow {
  productId: string;
  productName: string;
  unitsSold: number;
  grossRevenue: number;
  orderCount: number;
  averageQuantityPerOrder: number;
  averageSellingPrice: number;
  firstSaleDate: string | null;
  lastSaleDate: string | null;
}

export interface RecentProductOrderRow {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  paymentStatus: string | null;
  status: string | null;
  customerName: string;
  unitsSold: number;
  grossRevenue: number;
  averageSellingPrice: number;
}

export interface ProductDetailMetrics {
  productId: string;
  productName: string;
  totalUnitsSold: number;
  totalRevenue: number;
  orderCount: number;
  averageSellingPrice: number;
  averageQuantityPerOrder: number;
  last7Days: {
    unitsSold: number;
    revenue: number;
    orderCount: number;
  };
  last30Days: {
    unitsSold: number;
    revenue: number;
    orderCount: number;
  };
  bestSalesDay: DailySalesPoint | null;
  worstSalesDay: DailySalesPoint | null;
  salesTrend: DailySalesPoint[];
  recentOrders: RecentProductOrderRow[];
}

interface SummaryRow {
  total_revenue: unknown;
  total_units_sold: unknown;
  total_order_count: unknown;
  unique_products_sold: unknown;
}

interface DailyTrendRow {
  day: Date;
  revenue: unknown;
  units_sold: unknown;
  order_count: unknown;
}

interface ProductPerformanceSqlRow {
  product_id: string | null;
  product_name: string;
  units_sold: unknown;
  gross_revenue: unknown;
  order_count: unknown;
  average_quantity_per_order: unknown;
  average_selling_price: unknown;
  first_sale_date: Date | null;
  last_sale_date: Date | null;
}

interface WindowSummaryRow {
  units_sold: unknown;
  revenue: unknown;
  order_count: unknown;
}

interface ProductDetailSummaryRow {
  product_name: string;
  units_sold: unknown;
  revenue: unknown;
  order_count: unknown;
  average_selling_price: unknown;
  average_quantity_per_order: unknown;
}

interface RecentOrdersRow {
  order_id: string;
  order_number: string;
  created_at: Date;
  payment_status: string | null;
  status: string | null;
  customer_name: string | null;
  units_sold: unknown;
  gross_revenue: unknown;
  average_selling_price: unknown;
}

const SALE_PAYMENT_STATUSES = ["paid", "succeeded", "completed"];
const SALE_ORDER_STATUSES = ["completed", "fulfilled", "shipped", "delivered"];

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildDayAxis(start: Date, endExclusive: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (cursor < endExclusive) {
    days.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function salesWhereClause(start: Date, endExclusive: Date, productId?: string): Prisma.Sql {
  const productFilter = productId
    ? Prisma.sql` AND oi.product_id = ${productId}`
    : Prisma.empty;

  return Prisma.sql`
    o.created_at >= ${start}
    AND o.created_at < ${endExclusive}
    AND (
      lower(coalesce(o.payment_status, '')) IN (${Prisma.join(SALE_PAYMENT_STATUSES)})
      OR lower(coalesce(o.status, '')) IN (${Prisma.join(SALE_ORDER_STATUSES)})
    )
    ${productFilter}
  `;
}

export async function getSalesSummary(prisma: any, window: AnalyticsWindow): Promise<SalesSummary> {
  const whereSql = salesWhereClause(window.start, window.endExclusive);

  const summaryRows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      COALESCE(SUM(oi.total_price), 0) AS total_revenue,
      COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
      COUNT(DISTINCT o.id) AS total_order_count,
      COUNT(DISTINCT oi.product_id) AS unique_products_sold
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE ${whereSql}
  `)) as SummaryRow[];
  const [summary] = summaryRows;

  return {
    totalRevenue: toNumber(summary?.total_revenue),
    totalUnitsSold: toNumber(summary?.total_units_sold),
    totalOrderCount: toNumber(summary?.total_order_count),
    uniqueProductsSold: toNumber(summary?.unique_products_sold)
  };
}

export async function getDailySalesTrend(prisma: any, window: AnalyticsWindow, productId?: string): Promise<DailySalesPoint[]> {
  const whereSql = salesWhereClause(window.start, window.endExclusive, productId);

  const rows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      date_trunc('day', o.created_at)::date AS day,
      COALESCE(SUM(oi.total_price), 0) AS revenue,
      COALESCE(SUM(oi.quantity), 0) AS units_sold,
      COUNT(DISTINCT o.id) AS order_count
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE ${whereSql}
    GROUP BY 1
    ORDER BY 1 ASC
  `)) as DailyTrendRow[];

  const byDay = new Map<string, { revenue: number; unitsSold: number; orderCount: number }>(
    rows.map((row) => [
      isoDate(new Date(row.day)),
      {
        revenue: toNumber(row.revenue),
        unitsSold: toNumber(row.units_sold),
        orderCount: toNumber(row.order_count)
      }
    ])
  );

  return buildDayAxis(window.start, window.endExclusive).map((date) => {
    const point = byDay.get(date);
    return {
      date,
      revenue: point?.revenue ?? 0,
      unitsSold: point?.unitsSold ?? 0,
      orderCount: point?.orderCount ?? 0
    };
  });
}

export type ProductPerformanceSortField =
  | "productName"
  | "unitsSold"
  | "grossRevenue"
  | "orderCount"
  | "averageQuantityPerOrder"
  | "averageSellingPrice"
  | "firstSaleDate"
  | "lastSaleDate";

const SORT_COLUMN_MAP: Record<ProductPerformanceSortField, string> = {
  productName: "product_name",
  unitsSold: "units_sold",
  grossRevenue: "gross_revenue",
  orderCount: "order_count",
  averageQuantityPerOrder: "average_quantity_per_order",
  averageSellingPrice: "average_selling_price",
  firstSaleDate: "first_sale_date",
  lastSaleDate: "last_sale_date"
};

export async function getProductPerformance(
  prisma: any,
  window: AnalyticsWindow,
  options: {
    search?: string;
    sortBy?: ProductPerformanceSortField;
    sortDirection?: "asc" | "desc";
  } = {}
): Promise<ProductPerformanceRow[]> {
  const whereSql = salesWhereClause(window.start, window.endExclusive);
  const search = options.search?.trim() ?? "";
  const searchSql = search ? Prisma.sql` AND oi.product_name ILIKE ${`%${search}%`}` : Prisma.empty;
  const sortBy = options.sortBy && SORT_COLUMN_MAP[options.sortBy] ? options.sortBy : "grossRevenue";
  const sortDirection = options.sortDirection === "asc" ? "ASC" : "DESC";
  const sortColumn = SORT_COLUMN_MAP[sortBy];

  const rows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      oi.product_id,
      oi.product_name,
      COALESCE(SUM(oi.quantity), 0) AS units_sold,
      COALESCE(SUM(oi.total_price), 0) AS gross_revenue,
      COUNT(DISTINCT o.id) AS order_count,
      COALESCE(SUM(oi.quantity)::numeric / NULLIF(COUNT(DISTINCT o.id), 0), 0) AS average_quantity_per_order,
      COALESCE(SUM(oi.total_price)::numeric / NULLIF(SUM(oi.quantity), 0), 0) AS average_selling_price,
      MIN(o.created_at)::date AS first_sale_date,
      MAX(o.created_at)::date AS last_sale_date
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE ${whereSql}
    ${searchSql}
    GROUP BY oi.product_id, oi.product_name
    ORDER BY ${Prisma.raw(sortColumn)} ${Prisma.raw(sortDirection)}
  `)) as ProductPerformanceSqlRow[];

  return rows.map((row) => ({
    productId: row.product_id ?? "unknown",
    productName: row.product_name,
    unitsSold: toNumber(row.units_sold),
    grossRevenue: toNumber(row.gross_revenue),
    orderCount: toNumber(row.order_count),
    averageQuantityPerOrder: toNumber(row.average_quantity_per_order),
    averageSellingPrice: toNumber(row.average_selling_price),
    firstSaleDate: row.first_sale_date ? isoDate(new Date(row.first_sale_date)) : null,
    lastSaleDate: row.last_sale_date ? isoDate(new Date(row.last_sale_date)) : null
  }));
}

export function getTopProducts(
  performanceRows: ProductPerformanceRow[],
  metric: "grossRevenue" | "unitsSold",
  limit = 10
): ProductPerformanceRow[] {
  return [...performanceRows]
    .sort((a, b) => (metric === "grossRevenue" ? b.grossRevenue - a.grossRevenue : b.unitsSold - a.unitsSold))
    .slice(0, limit);
}

export function getLowPerformingProducts(
  performanceRows: ProductPerformanceRow[],
  metric: "grossRevenue" | "unitsSold" = "grossRevenue",
  limit = 10
): ProductPerformanceRow[] {
  return [...performanceRows]
    .sort((a, b) => (metric === "grossRevenue" ? a.grossRevenue - b.grossRevenue : a.unitsSold - b.unitsSold))
    .slice(0, limit);
}

interface AllProductsRow {
  product_id: string | null;
  product_name: string;
  units_sold: unknown;
  gross_revenue: unknown;
  order_count: unknown;
  average_quantity_per_order: unknown;
  average_selling_price: unknown;
  first_sale_date: Date | null;
  last_sale_date: Date | null;
}

export async function getAllProductsWithSalesPerformance(
  prisma: any,
  window: AnalyticsWindow
): Promise<ProductPerformanceRow[]> {
  const whereSql = salesWhereClause(window.start, window.endExclusive);

  const rows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      COALESCE(SUM(oi.quantity), 0) AS units_sold,
      COALESCE(SUM(oi.total_price), 0) AS gross_revenue,
      COUNT(DISTINCT o.id) AS order_count,
      COALESCE(SUM(oi.quantity)::numeric / NULLIF(COUNT(DISTINCT o.id), 0), 0) AS average_quantity_per_order,
      COALESCE(SUM(oi.total_price)::numeric / NULLIF(SUM(oi.quantity), 0), 0) AS average_selling_price,
      MIN(CASE WHEN o.id IS NOT NULL THEN o.created_at::date ELSE NULL END) AS first_sale_date,
      MAX(CASE WHEN o.id IS NOT NULL THEN o.created_at::date ELSE NULL END) AS last_sale_date
    FROM public.products p
    LEFT JOIN public.order_items oi ON p.id = oi.product_id
    LEFT JOIN public.orders o ON o.id = oi.order_id AND ${whereSql}
    WHERE p.is_active IS NOT FALSE
    GROUP BY p.id, p.name
    ORDER BY gross_revenue ASC, product_name ASC
  `)) as AllProductsRow[];

  return rows.map((row) => ({
    productId: row.product_id ?? "unknown",
    productName: row.product_name,
    unitsSold: toNumber(row.units_sold),
    grossRevenue: toNumber(row.gross_revenue),
    orderCount: toNumber(row.order_count),
    averageQuantityPerOrder: toNumber(row.average_quantity_per_order),
    averageSellingPrice: toNumber(row.average_selling_price),
    firstSaleDate: row.first_sale_date ? isoDate(new Date(row.first_sale_date)) : null,
    lastSaleDate: row.last_sale_date ? isoDate(new Date(row.last_sale_date)) : null
  }));
}

async function getWindowSummary(prisma: any, productId: string, window: AnalyticsWindow): Promise<{ unitsSold: number; revenue: number; orderCount: number }> {
  const whereSql = salesWhereClause(window.start, window.endExclusive, productId);
  const rows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      COALESCE(SUM(oi.quantity), 0) AS units_sold,
      COALESCE(SUM(oi.total_price), 0) AS revenue,
      COUNT(DISTINCT o.id) AS order_count
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE ${whereSql}
  `)) as WindowSummaryRow[];
  const [row] = rows;

  return {
    unitsSold: toNumber(row?.units_sold),
    revenue: toNumber(row?.revenue),
    orderCount: toNumber(row?.order_count)
  };
}

export async function getProductDetailMetrics(
  prisma: any,
  productId: string,
  window: AnalyticsWindow
): Promise<ProductDetailMetrics> {
  const whereSql = salesWhereClause(window.start, window.endExclusive, productId);

  const summaryRows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      MAX(oi.product_name) AS product_name,
      COALESCE(SUM(oi.quantity), 0) AS units_sold,
      COALESCE(SUM(oi.total_price), 0) AS revenue,
      COUNT(DISTINCT o.id) AS order_count,
      COALESCE(SUM(oi.total_price)::numeric / NULLIF(SUM(oi.quantity), 0), 0) AS average_selling_price,
      COALESCE(SUM(oi.quantity)::numeric / NULLIF(COUNT(DISTINCT o.id), 0), 0) AS average_quantity_per_order
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE ${whereSql}
  `)) as ProductDetailSummaryRow[];
  const [summary] = summaryRows;

  const salesTrend = await getDailySalesTrend(prisma, window, productId);

  const now = new Date();
  const start7 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
  const start30 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  const [last7Days, last30Days] = await Promise.all([
    getWindowSummary(prisma, productId, { start: start7, endExclusive }),
    getWindowSummary(prisma, productId, { start: start30, endExclusive })
  ]);

  const rankedTrend = salesTrend.filter((day) => day.unitsSold > 0 || day.revenue > 0);
  const bestSalesDay = rankedTrend.length
    ? [...rankedTrend].sort((a, b) => (b.revenue === a.revenue ? b.unitsSold - a.unitsSold : b.revenue - a.revenue))[0]
    : null;
  const worstSalesDay = rankedTrend.length
    ? [...rankedTrend].sort((a, b) => (a.revenue === b.revenue ? a.unitsSold - b.unitsSold : a.revenue - b.revenue))[0]
    : null;

  const recentOrders = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      o.id AS order_id,
      o.order_number,
      o.created_at,
      o.payment_status,
      o.status,
      o.shipping_name AS customer_name,
      SUM(oi.quantity) AS units_sold,
      SUM(oi.total_price) AS gross_revenue,
      COALESCE(SUM(oi.total_price)::numeric / NULLIF(SUM(oi.quantity), 0), 0) AS average_selling_price
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE ${whereSql}
    GROUP BY o.id, o.order_number, o.created_at, o.payment_status, o.status, o.shipping_name
    ORDER BY o.created_at DESC
    LIMIT 20
  `)) as RecentOrdersRow[];

  return {
    productId,
    productName: summary?.product_name || "Unknown Product",
    totalUnitsSold: toNumber(summary?.units_sold),
    totalRevenue: toNumber(summary?.revenue),
    orderCount: toNumber(summary?.order_count),
    averageSellingPrice: toNumber(summary?.average_selling_price),
    averageQuantityPerOrder: toNumber(summary?.average_quantity_per_order),
    last7Days,
    last30Days,
    bestSalesDay,
    worstSalesDay,
    salesTrend,
    recentOrders: recentOrders.map((row) => ({
      orderId: row.order_id,
      orderNumber: row.order_number,
      createdAt: row.created_at.toISOString(),
      paymentStatus: row.payment_status,
      status: row.status,
      customerName: row.customer_name || "Unknown",
      unitsSold: toNumber(row.units_sold),
      grossRevenue: toNumber(row.gross_revenue),
      averageSellingPrice: toNumber(row.average_selling_price)
    }))
  };
}

interface DailyProductBreakdownRow {
  product_id: string;
  product_name: string;
  units_sold: unknown;
  gross_revenue: unknown;
  order_count: unknown;
  average_selling_price: unknown;
}

export async function getDailyProductBreakdown(
  prisma: any,
  date: string
): Promise<ProductPerformanceRow[]> {
  // Parse date as YYYY-MM-DD and create UTC bounds for that day
  const [year, month, day] = date.split("-").map(Number);
  const dayStart = new Date(Date.UTC(year, month - 1, day));
  const dayEnd = new Date(Date.UTC(year, month - 1, day + 1));

  const rows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      COALESCE(SUM(oi.quantity), 0) AS units_sold,
      COALESCE(SUM(oi.total_price), 0) AS gross_revenue,
      COUNT(DISTINCT o.id) AS order_count,
      COALESCE(SUM(oi.total_price)::numeric / NULLIF(SUM(oi.quantity), 0), 0) AS average_selling_price
    FROM public.products p
    LEFT JOIN public.order_items oi ON p.id = oi.product_id
    LEFT JOIN public.orders o ON o.id = oi.order_id
      AND o.created_at >= ${dayStart}::timestamp
      AND o.created_at < ${dayEnd}::timestamp
      AND (o.payment_status IN ('paid', 'succeeded', 'completed') OR o.status IN ('completed', 'fulfilled', 'shipped', 'delivered'))
    WHERE p.is_active IS NOT FALSE
    GROUP BY p.id, p.name
    HAVING COALESCE(SUM(oi.quantity), 0) > 0 OR COUNT(DISTINCT o.id) > 0
    ORDER BY gross_revenue DESC, product_name ASC
  `)) as DailyProductBreakdownRow[];

  return rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    unitsSold: toNumber(row.units_sold),
    grossRevenue: toNumber(row.gross_revenue),
    orderCount: toNumber(row.order_count),
    averageQuantityPerOrder: toNumber(row.order_count) > 0 ? toNumber(row.units_sold) / toNumber(row.order_count) : 0,
    averageSellingPrice: toNumber(row.average_selling_price),
    firstSaleDate: null,
    lastSaleDate: null
  }));
}
