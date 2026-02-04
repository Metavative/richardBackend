// src/services/paypal.service.js
import axios from "axios";

// Use env vars (never hardcode secrets)
const PAYPAL_BASE_URL =
  process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";

// Hard timeout so the server never hangs.
const paypalHttp = axios.create({
  baseURL: PAYPAL_BASE_URL,
  timeout: Number(process.env.PAYPAL_HTTP_TIMEOUT_MS || 15000),
  headers: {
    "Content-Type": "application/json",
  },
});

function requirePaypalEnv() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    const err = new Error("PAYPAL_ENV_MISSING");
    err.status = 500;
    err.details = {
      missing: [
        !PAYPAL_CLIENT_ID ? "PAYPAL_CLIENT_ID" : null,
        !PAYPAL_CLIENT_SECRET ? "PAYPAL_CLIENT_SECRET" : null,
      ].filter(Boolean),
    };
    throw err;
  }
}

function pickAxiosError(err) {
  return {
    message: err?.message,
    code: err?.code,
    status: err?.response?.status,
    data: err?.response?.data,
  };
}

// Simple in-memory token cache (reduces PayPal calls)
let _cachedToken = null; // { token: string, expiresAtMs: number }

export async function generateAccessToken() {
  requirePaypalEnv();

  // Return cached token if still valid (with 20s safety buffer)
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAtMs - 20000 > now) {
    return _cachedToken.token;
  }

  try {
    const auth = Buffer.from(
      `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    // IMPORTANT: PayPal token endpoint expects form encoding
    const res = await paypalHttp.post(
      "/v1/oauth2/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const token = res?.data?.access_token;
    const expiresIn = Number(res?.data?.expires_in || 0);

    if (!token) {
      const err = new Error("PAYPAL_TOKEN_MISSING");
      err.status = 502;
      err.details = { response: res?.data };
      throw err;
    }

    _cachedToken = {
      token,
      expiresAtMs: Date.now() + Math.max(0, expiresIn) * 1000,
    };

    return token;
  } catch (err) {
    const e = new Error("PAYPAL_TOKEN_REQUEST_FAILED");
    e.status = 502;
    e.details = pickAxiosError(err);
    throw e;
  }
}

export async function createPayPalOrder({
  priceUsd,
  returnUrl,
  cancelUrl,
  brandName,
}) {
  const accessToken = await generateAccessToken();

  const value = Number(priceUsd);
  if (!Number.isFinite(value) || value <= 0) {
    const err = new Error("INVALID_PRICE");
    err.status = 400;
    err.details = { priceUsd };
    throw err;
  }

  try {
    const payload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: value.toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        ...(brandName ? { brand_name: brandName } : {}),
      },
    };

    const res = await paypalHttp.post("/v2/checkout/orders", payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return res.data;
  } catch (err) {
    const e = new Error("PAYPAL_CREATE_ORDER_FAILED");
    e.status = 502;
    e.details = pickAxiosError(err);
    throw e;
  }
}

export async function capturePayPalOrder(orderId) {
  const accessToken = await generateAccessToken();

  if (!orderId || String(orderId).trim().length < 5) {
    const err = new Error("ORDER_ID_REQUIRED");
    err.status = 400;
    err.details = { orderId };
    throw err;
  }

  try {
    const res = await paypalHttp.post(
      `/v2/checkout/orders/${orderId}/capture`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return res.data;
  } catch (err) {
    const e = new Error("PAYPAL_CAPTURE_FAILED");
    e.status = 502;
    e.details = pickAxiosError(err);
    throw e;
  }
}
