// src/services/paypal.service.js
import axios from "axios";

const base =
  process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("❌ PAYPAL CLIENT ID / SECRET NOT SET");
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------
async function generateAccessToken() {
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
  returnUrl,
  cancelUrl,
}) {
  if (!price || !returnUrl || !cancelUrl) {
    throw new Error("Missing price / returnUrl / cancelUrl");
  }

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
            currency_code: "GBP",
            value: Number(price).toFixed(2),
          },
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
