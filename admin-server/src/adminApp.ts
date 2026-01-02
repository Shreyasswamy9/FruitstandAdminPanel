import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import prisma from "../config/database";
import axios from "axios";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import * as jose from "jose";

import { registerOrdersRoutes } from "../pages/orders";
import { registerProductsRoutes } from "../pages/products";
import { registerAnalyticsRoutes } from "../pages/analytics";
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
			const token = req.cookies.fs_admin;
			if (!token) {
				return res.redirect("/?error=invalid_session");
			}

			const secret = getJwtSecret();
			const verified = await jose.jwtVerify(token, secret);
			req.user = verified.payload as UserPayload;

			logActivity(req.user.id, req.user.email, "PAGE_ACCESS", {
				page: req.path,
				ipAddress: req.ip,
				userAgent: req.get("User-Agent")
			});
			next();
		} catch (error) {
			return res.redirect("/?error=invalid_session");
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

	app.get("/", (req: any, res: any) => {
		const error = typeof req.query.error === "string" ? req.query.error : "";
		const details = typeof req.query.details === "string" ? req.query.details : "";
		if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
			return res
				.status(500)
				.send("<h1>Configuration error</h1><p>Azure OAuth not configured.</p>");
		}
		const authUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?client_id=${process.env.AZURE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
			process.env.AZURE_REDIRECT_URI!
		)}&scope=openid%20profile%20email%20User.Read&response_mode=query`;
		res.send(`
			<!DOCTYPE html><html><head><title>Login</title>
			<style>body{font-family:Arial;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#667eea;color:#333}
			.box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,.15);width:360px;text-align:center}
			a.btn{display:block;background:#0078d4;color:#fff;padding:14px;border-radius:6px;text-decoration:none;margin-top:15px}
			a.btn.dev{background:#6c757d}
			.err{background:#f8d7da;color:#721c24;padding:10px;border-radius:6px;font-size:13px;margin-bottom:10px}
			</style></head><body>
			<div class="box">
				<h1>🍎 Admin Panel</h1>
				${error ? `<div class="err">${error}${details ? ` - ${details}` : ""}</div>` : ""}
				<a class="btn" href="${authUrl}">Sign in with Microsoft</a>
				${
					process.env.ENABLE_DEV_LOGIN === "true"
						? `<a class="btn dev" href="/dev-login">Developer Login</a>`
						: ""
				}
			</div>
			</body></html>
		`);
	});

	app.get("/auth/callback", async (req: any, res: any) => {
		const { code, error, error_description } = req.query;
		if (error) {
			return res.redirect(`/?error=oauth_error&details=${encodeURIComponent(error_description || error)}`);
		}
		if (!code) {
			return res.redirect("/?error=no_code");
		}
		try {
			const tokenResp = await axios.post(
				`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
				new URLSearchParams({
					client_id: process.env.AZURE_CLIENT_ID!,
					client_secret: process.env.AZURE_CLIENT_SECRET!,
					code: code as string,
					grant_type: "authorization_code",
					redirect_uri: process.env.AZURE_REDIRECT_URI!
				}),
				{ headers: { "Content-Type": "application/x-www-form-urlencoded" } }
			);
			const access = tokenResp.data.access_token;
			const userResp = await axios.get("https://graph.microsoft.com/v1.0/me", {
				headers: { Authorization: `Bearer ${access}` }
			});
			const ms = userResp.data;
			const email = ms.mail || ms.userPrincipalName;
			let user = { id: ms.id, name: ms.displayName, email };
			try {
				if ((prisma as any).users) {
					user = await (prisma as any).users.upsert({
						where: { email },
						update: {
							raw_user_meta_data: { name: ms.displayName } as Prisma.InputJsonValue,
							updated_at: new Date()
						},
						create: {
							id: randomUUID(),
							email,
							raw_user_meta_data: { name: ms.displayName } as Prisma.InputJsonValue,
							created_at: new Date(),
							updated_at: new Date()
						}
					});
				}
			} catch {
				/* ignore persistence errors */
			}

			// Create JWT token and set cookie
			try {
				const token = await createJwt({
					id: user.id.toString(),
					name: user.name,
					email: user.email
				});

				const isProduction = process.env.NODE_ENV === "production";
				res.cookie("fs_admin", token, {
					httpOnly: true,
					secure: isProduction,
					sameSite: "lax",
					path: "/",
					maxAge: SESSION_TIMEOUT
				});

				logActivity(user.id.toString(), email, "LOGIN", {
					method: "microsoft_oauth",
					ipAddress: req.ip
				});

				return res.redirect("/dashboard");
			} catch (tokenError) {
				console.error("Token creation failed (oauth):", (tokenError as Error)?.message || tokenError);
				return res.redirect("/?error=token_creation_failed");
			}
		} catch {
			return res.redirect("/?error=oauth_failed");
		}
	});

	app.get("/dev-login", (req: any, res: any) => {
		if (process.env.ENABLE_DEV_LOGIN !== "true") {
			return res.status(403).send("Disabled");
		}
		const err = typeof req.query.error === "string" ? req.query.error : "";
		res.send(`
			<!DOCTYPE html><html><head><title>Dev Login</title>
			<style>body{font-family:Arial;background:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh}
			.box{background:#fff;padding:30px;border-radius:10px;box-shadow:0 8px 20px rgba(0,0,0,.1);width:340px}
			.err{background:#f8d7da;color:#721c24;padding:8px;border-radius:6px;font-size:12px;margin-bottom:8px}
			input,button{width:100%;padding:10px;margin-top:10px;border-radius:6px;border:1px solid #ccc}
			button{background:#6c757d;color:#fff;border:none;cursor:pointer}
			a{display:block;margin-top:10px;font-size:12px;text-decoration:none;color:#0078d4}
			</style></head><body>
			<div class="box">
				<h2>🛠️ Dev Login</h2>
				${err ? `<div class="err">${err}</div>` : ""}
				<form method="POST" action="/dev-login">
					<input name="password" type="password" required placeholder="Dev password"/>
					<button type="submit">Login</button>
				</form>
				<a href="/">← Back</a>
			</div>
			</body></html>
		`);
	});

	app.post("/dev-login", async (req: any, res: any) => {
		if (process.env.ENABLE_DEV_LOGIN !== "true") {
			return res.status(403).send("Disabled");
		}
		const pass = req.body?.password;
		if (!process.env.DEV_ADMIN_PASSWORD || pass !== process.env.DEV_ADMIN_PASSWORD) {
			return res.redirect("/dev-login?error=Invalid+password");
		}

		try {
			const token = await createJwt({
				id: "dev",
				name: "Dev Admin",
				email: process.env.ADMIN_EMAIL || "dev@local"
			});

			const isProduction = process.env.NODE_ENV === "production";
			res.cookie("fs_admin", token, {
				httpOnly: true,
				secure: isProduction,
				sameSite: "lax",
				path: "/",
				maxAge: SESSION_TIMEOUT
			});

			logActivity("dev", process.env.ADMIN_EMAIL || "dev@local", "LOGIN", {
				method: "dev_login",
				ipAddress: req.ip
			});

			return res.redirect("/dashboard");
		} catch (error) {
			console.error("Token creation failed (dev-login):", (error as Error)?.message || error);
			return res.redirect("/dev-login?error=Token+creation+failed");
		}
	});

	const renderDashboard = (req: any, res: any): void => {
		const isAdmin =
			req.user.email === "shreyas@fruitstandny.com" ||
			req.user.email.toLowerCase().includes("shreyas") ||
			req.user.email === process.env.ADMIN_EMAIL;
		res.send(`
			<!DOCTYPE html><html><head><title>Dashboard</title>
			<style>
				body{font-family:Arial;margin:0;background:#f5f5f5}
				.header{background:#667eea;color:#fff;padding:18px;display:flex;justify-content:space-between;align-items:center}
				.grid{max-width:1100px;margin:25px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;padding:0 20px}
				.card{background:#fff;padding:16px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.08);text-decoration:none;color:#333;display:block}
				.card:hover{box-shadow:0 6px 18px rgba(0,0,0,.12);transform:translateY(-2px)}
				.icon{font-size:26px} .title{font-weight:600;margin:6px 0 4px;font-size:15px} .desc{font-size:12px;color:#666}
				.logout{background:#dc3545;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer}
			</style></head><body>
			<div class="header">
				<div>🍎 Admin Panel</div>
				<div>${req.user.name} <button class="logout" onclick="logout()">Logout</button></div>
			</div>
			<div class="grid">
				<a class="card" href="/orders"><div class="icon">📦</div><div class="title">Orders</div><div class="desc">Stripe orders</div></a>
				<a class="card" href="/products"><div class="icon">👕</div><div class="title">Products</div><div class="desc">Catalog</div></a>
				<a class="card" href="/analytics"><div class="icon">📈</div><div class="title">Analytics</div><div class="desc">Insights</div></a>
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
		res.clearCookie("fs_admin", { path: "/" });
		res.redirect("/");
	});

	registerOrdersRoutes(app, { requireAuth, prisma, logActivity });
	registerProductsRoutes(app, { prisma, logActivity, requireAuth, requireAdmin });
	registerAnalyticsRoutes(app, { requireAuth });
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
