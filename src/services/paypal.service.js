// src/services/paypal.service.js
import axios from "axios";

const paypalEnv = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const defaultBaseUrl =
  paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const base = process.env.PAYPAL_BASE_URL || defaultBaseUrl;

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

function assertPayPalConfig() {
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  }
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------
async function generateAccessToken() {
  assertPayPalConfig();

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await axios({
    url: `${base}/v1/oauth2/token`,
    method: "post",
    data: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 15000,
  });

  return response.data.access_token;
}

// ---------------------------------------------------------------------------
// CREATE ORDER
// ---------------------------------------------------------------------------
export async function createPayPalOrder({
  price,
  currencyCode = "GBP",
  customId = "",
  returnUrl,
  cancelUrl,
}) {
  if (!price || !returnUrl || !cancelUrl) {
    throw new Error("Missing price / returnUrl / cancelUrl");
  }

  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new Error("Invalid price");
  }

  const normalizedCurrency = String(currencyCode || "GBP").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new Error("Invalid currency code");
  }

  const normalizedCustomId = String(customId || "").trim();
  const accessToken = await generateAccessToken();

  const response = await axios({
    url: `${base}/v2/checkout/orders`,
    method: "post",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    data: {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: normalizedCurrency,
            value: parsedPrice.toFixed(2),
          },
          ...(normalizedCustomId ? { custom_id: normalizedCustomId } : {}),
        },
      ],
      application_context: {
        return_url: returnUrl,   // � intercepted by WebView
        cancel_url: cancelUrl,   // � intercepted by WebView
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    },
    timeout: 15000,
  });

  return response.data;
}

// ---------------------------------------------------------------------------
// CAPTURE ORDER
// ---------------------------------------------------------------------------
export async function capturePayPalOrder(orderId) {
  if (!orderId) {
    throw new Error("orderId is required");
  }

  const accessToken = await generateAccessToken();

  const response = await axios({
    url: `${base}/v2/checkout/orders/${orderId}/capture`,
    method: "post",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  return response.data;
}
