import paypal from '@paypal/checkout-server-sdk';


const clientId = "AX-Z_tvjlhcJkicv-kU0EG3sl8LPQfE1x1HjRFUg24uRvdUYMT3HCEeJwvOtTwZ8sG1D6Lk4U2iaxnpJ";
const clientSecret = "YEG4d0rLjxnLB954l2Op5Ou9DnCG2wpi7O1ectxPNdwG18fakAiLTUJTElxfW0dfPSKIYbUALO0wPA_mK";

let environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
let client = new paypal.core.PayPalHttpClient(environment);

export const createPayPalOrder = async (price) => {
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.body = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: 'USD',
        value: price.toString()
      }
    }],
    application_context: {
      return_url: 'https://your-domain.com/paypal-success', // Placeholder
      cancel_url: 'https://your-domain.com/paypal-cancel'
    }
  };

  const response = await client.execute(request);
  return response.result; // This contains the 'approve' link
};

export const capturePayPalOrder = async (orderId) => {
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});
  const response = await client.execute(request);
  return response.result;
};