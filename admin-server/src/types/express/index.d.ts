import 'express';
import 'cookie-session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email?: string;
      name?: string;
      roles?: string[];
    };
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    email?: string;
    sessionId?: string;
  }
}

declare module 'cookie-session' {
  interface CookieSessionObject {
    userId?: string;
    email?: string;
    sessionId?: string;
  }
}
