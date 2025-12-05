## Node Auth (Express + JWT + Nodemailer)


### Features
- Register with email verification link
- Login with email/password
- Access & Refresh tokens (JWT). Refresh stored as httpOnly cookie
- Forgot + Reset password with expiring token
- Logout and invalidate refresh token
- Input validation, rate limiting, security headers, CORS, cookie parser


### Quickstart
1. Copy `.env.example` to `.env` and fill values.
2. `npm install`
3. `npm run dev`


### Endpoints
- `POST /auth/register` { name, email, password }
- `GET /auth/verify-email?token=...&uid=...`
- `POST /auth/login` { email, password }
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/forgot-password` { email }
- `POST /auth/reset-password` { token, uid, password }


### Notes
- Use HTTPS in production; set `secure: true` cookies.
- The verification + reset tokens are stored as bcrypt hashes in DB; raw token is only emailed.
- Update `CLIENT_URL`, `VERIFY_EMAIL_URL`, `RESET_PASSWORD_URL` to match your frontend.
- Consider adding email templates, account lockout, device sessions, and 2FA for production.
```


---


# Small Fix Note


In `authController.js` at the top, ensure the import is `../utils/generateTokens.js` (the snippet shows a typo).