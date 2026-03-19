import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import cookieSession from "cookie-session";
import prisma from "../config/database";
import { randomUUID } from "crypto";
import * as jose from "jose";

import authRoutes from "./routes/auth.routes";
import loginPages from "../pages/login";
import { registerOrdersRoutes } from "../pages/orders";
import { registerProductsRoutes } from "../pages/products";
import { registerAnalyticsRoutes } from "../pages/analytics";
import { registerProductAnalyticsRoutes } from "../pages/productAnalytics";
import { registerCommunicationsRoutes } from "../pages/communications";
import { registerActivityRoutes } from "../pages/activity";
import { registerInventoryRoutes } from "../pages/inventory";
import { registerCustomersRoutes } from "../pages/customers";
import { registerCollectionsRoutes } from "../pages/collections";
import { registerReviewsRoutes } from "../pages/reviews";
import { registerTicketsRoutes } from "../pages/tickets";

export interface UserPayload {
	id: string;
	name: string;
	email: string;
	iat: number;
	exp: number;
}

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

let appInstance: express.Express | null = null;

// Get or create JWT secret
function getJwtSecret(): Uint8Array {
	const secret = process.env.ADMIN_SESSION_SECRET;
	if (!secret) {
		throw new Error("ADMIN_SESSION_SECRET environment variable is required");
	}
	return new TextEncoder().encode(secret);
}

export function createAdminApp(): express.Express {
	if (appInstance) {
		return appInstance;
	}

	const app = express();

	// Trust proxy for Vercel
	app.set("trust proxy", 1);

	async function logActivity(
		userId: string,
		userEmail: string,
		action: string,
		details: Record<string, unknown> = {}
	): Promise<void> {
		try {
			const activityModel = (prisma as any).activityLog;
			if (activityModel?.create) {
				await activityModel.create({
					data: {
						userId,
						userEmail,
						action,
						details: JSON.stringify(details),
						timestamp: new Date(),
						ipAddress: details.ipAddress || "unknown"
					}
				});
			}
		} catch {
			/* ignore logging errors */
		}
	}

	async function requireAuth(req: any, res: any, next: any): Promise<void> {
		try {
			// Check for session-based auth first (new system)
			if (req.session?.userId) {
				const user = await prisma.users.findUnique({
					where: { id: req.session.userId }
				});
				
				if (user) {
					req.user = {
						id: user.id,
						email: user.email || '',
						name: (user.raw_user_meta_data as any)?.name || user.email || 'User',
						iat: 0,
						exp: 0
					};
					
					logActivity(req.user.id, req.user.email, "PAGE_ACCESS", {
						page: req.path,
						ipAddress: req.ip,
						userAgent: req.get("User-Agent")
					});
					return next();
				}
			}

			// Fall back to JWT token (old system)
			const token = req.cookies.fs_admin;
			if (!token) {
				return res.redirect("/login?error=Please+log+in");
			}

			const secret = getJwtSecret();
			const verified = await jose.jwtVerify(token, secret);
			req.user = verified.payload as unknown as UserPayload;

			logActivity(req.user.id, req.user.email, "PAGE_ACCESS", {
				page: req.path,
				ipAddress: req.ip,
				userAgent: req.get("User-Agent")
			});
			next();
		} catch (error) {
			return res.redirect("/login?error=Session+expired");
		}
	}

	function requireAdmin(req: any, res: any, next: any): void {
		requireAuth(req, res, () => {
			const email = req.user.email;
			const isAdmin =
				email === "shreyas@fruitstandny.com" ||
				email.toLowerCase().includes("shreyas") ||
				email === process.env.ADMIN_EMAIL;
			if (!isAdmin) {
				return res.status(403).send("Forbidden");
			}
			logActivity(req.user.id, req.user.email, "ADMIN_ACCESS", {
				page: req.path,
				ipAddress: req.ip
			});
			next();
		});
	}

	async function createJwt(userPayload: Omit<UserPayload, "iat" | "exp">): Promise<string> {
		const secret = getJwtSecret();
		const now = Math.floor(Date.now() / 1000);
		const token = await new jose.SignJWT(userPayload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt(now)
			.setExpirationTime(now + 24 * 60 * 60) // 24 hours
			.sign(secret);
		return token;
	}

	app.use(cors());
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use(cookieParser());
	
	// Session middleware
	app.use(
		cookieSession({
			name: "fs_session",
			keys: [process.env.ADMIN_SESSION_SECRET || "dev-secret-key-change-in-production"],
			maxAge: SESSION_TIMEOUT,
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax"
		})
	);

	// Auth routes (login, logout, change password)
	app.use("/api/auth", authRoutes);
	app.use(loginPages);

	// Redirect root to login page
	app.get("/", (req: any, res: any) => {
		res.redirect("/login");
	});

	const renderDashboard = (req: any, res: any): void => {
		const isAdmin =
			req.user.email === "shreyas@fruitstandny.com" ||
			req.user.email.toLowerCase().includes("shreyas") ||
			req.user.email === process.env.ADMIN_EMAIL;
		res.send(`
			<!DOCTYPE html><html><head><title>Dashboard</title>
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<style>
				*{box-sizing:border-box}
				body{font-family:Arial;margin:0;background:#f5f5f5}
				.header{background:#667eea;color:#fff;padding:clamp(12px,4vw,18px);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
				.header > div:first-child{font-size:clamp(16px,4vw,20px);font-weight:600}
				.header > div:last-child{display:flex;align-items:center;gap:clamp(6px,2vw,12px);font-size:clamp(12px,3vw,14px);flex-wrap:wrap}
				.grid{max-width:1100px;margin:clamp(16px,4vw,25px) auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:clamp(12px,3vw,16px);padding:0 clamp(12px,4vw,20px)}
				@media(max-width:640px){.grid{grid-template-columns:1fr;gap:clamp(10px,3vw,12px)}}
				.card{background:#fff;padding:clamp(14px,3vw,16px);border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.08);text-decoration:none;color:#333;display:block;transition:all 0.3s;cursor:pointer}
				.card:hover{box-shadow:0 6px 18px rgba(0,0,0,.12);transform:translateY(-2px)}
				.icon{font-size:clamp(22px,5vw,26px);line-height:1}
				.title{font-weight:600;margin:clamp(6px,2vw,8px) 0 clamp(2px,1vw,4px);font-size:clamp(13px,3vw,15px)}
				.desc{font-size:clamp(11px,2.5vw,12px);color:#666}
				.logout{background:#dc3545;color:#fff;border:none;padding:clamp(6px,1.5vw,8px) clamp(10px,2vw,14px);border-radius:6px;cursor:pointer;font-size:clamp(11px,2.5vw,13px);white-space:nowrap}
				.logout:hover{background:#c82333}
			</style></head><body>
			<div class="header">
				<div>🍎 Admin Panel</div>
				<div>${req.user.name} <button class="logout" onclick="logout()">Logout</button></div>
			</div>
			<div class="grid">
				<a class="card" href="/orders"><div class="icon">📦</div><div class="title">Orders</div><div class="desc">Stripe orders</div></a>
				<a class="card" href="/products"><div class="icon">👕</div><div class="title">Products</div><div class="desc">Catalog</div></a>
				<a class="card" href="/admin/analytics/products"><div class="icon">📈</div><div class="title">Analytics</div><div class="desc">Product sales insights</div></a>
				<a class="card" href="/communications"><div class="icon">💬</div><div class="title">Comms</div><div class="desc">Messages</div></a>
				<a class="card" href="/customers"><div class="icon">👥</div><div class="title">Customers</div><div class="desc">Profiles</div></a>
				<a class="card" href="/collections"><div class="icon">🎨</div><div class="title">Collections</div><div class="desc">Seasonal</div></a>
				<a class="card" href="/inventory"><div class="icon">📊</div><div class="title">Inventory</div><div class="desc">Stock</div></a>
				<a class="card" href="/reviews"><div class="icon">⭐</div><div class="title">Reviews</div><div class="desc">Feedback</div></a>
				<a class="card" href="/tickets"><div class="icon">🎫</div><div class="title">Tickets</div><div class="desc">Support</div></a>
				${
					isAdmin
						? `<a class="card" href="/activity"><div class="icon">🛡️</div><div class="title">Activity</div><div class="desc">Audit log</div></a>`
						: ""
				}
			</div>
			<script>
				function logout(){
					location.href='/logout';
				}
			</script>
			</body></html>
		`);
	};

	app.get("/dashboard", requireAuth, renderDashboard);
	app.post("/dashboard", requireAuth, renderDashboard);

	app.get("/logout", async (req: any, res: any) => {
		if (req.user) {
			logActivity(req.user.id, req.user.email, "LOGOUT", {
				ipAddress: req.ip
			});
		}
		// Clear both old JWT cookie and new session cookie
		res.clearCookie("fs_admin", { path: "/" });
		res.clearCookie("fs_session", { path: "/" });
		req.session = null;
		res.redirect("/login");
	});

	registerOrdersRoutes(app, { requireAuth, prisma, logActivity });
	registerProductsRoutes(app, { prisma, logActivity, requireAuth, requireAdmin });
	registerAnalyticsRoutes(app, { requireAuth });
	registerProductAnalyticsRoutes(app, { requireAuth, prismaClient: prisma });
	registerCommunicationsRoutes(app, { requireAuth });
	registerActivityRoutes(app, { prisma, logActivity, requireAdmin });
	registerInventoryRoutes(app, { requireAuth });
	registerCustomersRoutes(app, { requireAuth });
	registerCollectionsRoutes(app, { requireAuth });
	registerReviewsRoutes(app, { prisma, logActivity, requireAuth });
	registerTicketsRoutes(app, { prisma, logActivity, requireAuth });

	appInstance = app;
	return appInstance;
}
