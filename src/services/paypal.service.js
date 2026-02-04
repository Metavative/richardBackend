import axios from 'axios';

const clientId = "AX-Z_tvjlhcJkicv-kU0EG3sl8LPQfE1x1HjRFUg24uRvdUYMT3HCEeJwvOtTwZ8sG1D6Lk4U2iaxnpJ";
const clientSecret = "YEG4d0rLjxnLB954l2Op5Ou9DnCG2wpi7O1ectxPNdwG18fakAiLTUJTElxfW0dfPSKIYbUALO0wPA_mK";

const base = "https://api-m.sandbox.paypal.com"; // Use this for Sandbox

// 1. Generate Access Token (OAuth2)
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
  });
  return response.data.access_token;
}

// 2. Create Order
export const createPayPalOrder = async (price) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  
  const response = await axios({
    url,
    method: "post",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    data: {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD",
          value: parseFloat(price).toFixed(2),
        },
      }],
      application_context: {
        return_url: "https://richardbackend-production-a5dc.up.railway.app/paypal-success",
        cancel_url: "https://richardbackend-production-a5dc.up.railway.app/paypal-cancel",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    },
  });

  return response.data;
};

// 3. Capture Order
export const capturePayPalOrder = async (orderId) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderId}/capture`;

  const response = await axios({
    url,
    method: "post",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  return response.data;
};