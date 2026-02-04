// src/services/paypal.service.js
import axios from "axios";

const base = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

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

export async function createPayPalOrder({ price, returnUrl, cancelUrl }) {
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
            currency_code: "USD",
            value: Number(price).toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    },
    timeout: 15000,
  });

  return response.data;
}

export async function capturePayPalOrder(orderId) {
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
