/**
 * Safaricom Daraja API v2 Integration for KodiTrack
 * Supports STK Push (Lipa na M-Pesa Online), Query, and Webhook Callbacks.
 */

export interface DarajaConfig {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  businessShortCode: string;
  passkey: string;
  callbackUrl: string;
}

// Safaricom public sandbox defaults (safe for sandbox testing)
export const DEFAULT_SANDBOX_CONFIG: DarajaConfig = {
  environment: "sandbox",
  consumerKey: "YOUR_DARAJA_CONSUMER_KEY",
  consumerSecret: "YOUR_DARAJA_CONSUMER_SECRET",
  businessShortCode: "174379",
  passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
  callbackUrl: "https://koditrack.koditrack.workers.dev/api/mpesa/callback",
};

/**
 * Normalizes a Kenyan phone number into 254XXXXXXXXX format.
 * Examples:
 *   "0712345678"  -> "254712345678"
 *   "0112345678"  -> "254112345678"
 *   "+254712345678" -> "254712345678"
 *   "712345678"   -> "254712345678"
 */
export function normalizeKenyanPhone(phone: string): string {
  const clean = phone.replace(/[\s\-\+\(\)]/g, "");
  if (clean.startsWith("254") && clean.length === 12) {
    return clean;
  }
  if (clean.startsWith("0") && clean.length === 10) {
    return "254" + clean.slice(1);
  }
  if ((clean.startsWith("7") || clean.startsWith("1")) && clean.length === 9) {
    return "254" + clean;
  }
  return clean;
}

/**
 * Generates Daraja timestamp in format YYYYMMDDHHmmss
 */
export function getDarajaTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Generates base64 password: Base64(Shortcode + Passkey + Timestamp)
 */
export function getDarajaPassword(shortCode: string, passkey: string, timestamp: string): string {
  const raw = `${shortCode}${passkey}${timestamp}`;
  return btoa(raw);
}

// Token cache in worker isolate
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Retrieves an OAuth Bearer token from Safaricom Daraja API
 */
export async function getDarajaAccessToken(config: DarajaConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const baseUrl =
    config.environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

  const auth = btoa(`${config.consumerKey}:${config.consumerSecret}`);
  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to authenticate with Daraja: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: string };
  const expiresInMs = (parseInt(data.expires_in, 10) - 60) * 1000;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(0, expiresInMs),
  };

  return data.access_token;
}

export interface StkPushParams {
  phone: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

export interface StkPushResult {
  success: boolean;
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
  responseCode: string;
  simulated?: boolean;
}

export interface StkPushQueryResult {
  resultCode: number;
  resultDesc: string;
}

export async function queryStkPush(
  checkoutRequestId: string,
  config: DarajaConfig,
): Promise<StkPushQueryResult> {
  const baseUrl =
    config.environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  const timestamp = getDarajaTimestamp();
  const token = await getDarajaAccessToken(config);
  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: config.businessShortCode,
      Password: getDarajaPassword(config.businessShortCode, config.passkey, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Daraja STK query failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    ResultCode?: string | number;
    ResultDesc?: string;
    errorMessage?: string;
  };
  if (data.ResponseCode !== "0" || data.ResultCode === undefined) {
    throw new Error(data.errorMessage || data.ResponseDescription || "Daraja STK query was not accepted");
  }

  const resultCode = Number(data.ResultCode);
  if (!Number.isInteger(resultCode)) {
    throw new Error("Daraja STK query returned an invalid result code");
  }

  return {
    resultCode,
    resultDesc: data.ResultDesc || data.ResponseDescription || "",
  };
}

/**
 * Initiates an M-Pesa STK Push
 */
export async function initiateStkPush(
  params: StkPushParams,
  config: DarajaConfig,
  allowSimulation = false,
): Promise<StkPushResult> {
  const normalizedPhone = normalizeKenyanPhone(params.phone);
  const timestamp = getDarajaTimestamp();
  const password = getDarajaPassword(config.businessShortCode, config.passkey, timestamp);

  // If consumerKey is not configured or in sandbox simulation
  const isMock =
    !config.consumerKey ||
    config.consumerKey === "YOUR_DARAJA_CONSUMER_KEY" ||
    config.consumerKey.startsWith("demo");

  if (isMock) {
    if (!allowSimulation) {
      throw new Error("M-Pesa payments are not configured. Contact support to complete checkout.");
    }
    const mockCheckoutId = "ws_CO_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
    const mockMerchantId = "MERCHANT_" + Date.now();
    return {
      success: true,
      checkoutRequestId: mockCheckoutId,
      merchantRequestId: mockMerchantId,
      customerMessage: `STK Push prompt sent to ${normalizedPhone}. Please enter your M-Pesa PIN on your phone.`,
      responseCode: "0",
      simulated: true,
    };
  }

  try {
    const token = await getDarajaAccessToken(config);
    const baseUrl =
      config.environment === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    const payload = {
      BusinessShortCode: config.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(params.amount),
      PartyA: normalizedPhone,
      PartyB: config.businessShortCode,
      PhoneNumber: normalizedPhone,
      CallBackURL: config.callbackUrl,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.transactionDesc.slice(0, 13),
    };

    const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      ResponseCode?: string;
      ResponseDescription?: string;
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      CustomerMessage?: string;
      errorMessage?: string;
    };

    if (data.ResponseCode === "0" && data.CheckoutRequestID) {
      return {
        success: true,
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID || "",
        customerMessage: data.CustomerMessage || "Success",
        responseCode: "0",
      };
    }

    throw new Error(data.errorMessage || data.ResponseDescription || "Daraja STK push rejected");
  } catch (err) {
    if (!allowSimulation) throw err;
    const mockCheckoutId = "ws_CO_FB_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
    return {
      success: true,
      checkoutRequestId: mockCheckoutId,
      merchantRequestId: "MERCHANT_FALLBACK",
      customerMessage: `[Sandbox/Dev Mode] STK push sent to ${normalizedPhone}. Enter PIN on your phone to complete.`,
      responseCode: "0",
      simulated: true,
    };
  }
}

/**
 * Extracts details from a Daraja IPN callback payload
 */
export function parseDarajaCallback(body: any): {
  success: boolean;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceipt?: string;
  amount?: number;
  phone?: string;
} {
  const stk = body?.Body?.stkCallback;
  if (!stk) {
    return {
      success: false,
      checkoutRequestId: "",
      resultCode: -1,
      resultDesc: "Invalid callback payload",
    };
  }

  const checkoutRequestId = stk.CheckoutRequestID;
  const resultCode = stk.ResultCode;
  const resultDesc = stk.ResultDesc || "";

  if (resultCode !== 0) {
    return {
      success: false,
      checkoutRequestId,
      resultCode,
      resultDesc,
    };
  }

  let mpesaReceipt: string | undefined;
  let amount = 0;
  let phone = "";

  const items = stk.CallbackMetadata?.Item || [];
  for (const item of items) {
    if (item.Name === "MpesaReceiptNumber") mpesaReceipt = String(item.Value);
    if (item.Name === "Amount") amount = Number(item.Value);
    if (item.Name === "PhoneNumber") phone = String(item.Value);
  }

  return {
    success: true,
    checkoutRequestId,
    resultCode,
    resultDesc,
    mpesaReceipt,
    amount: amount || undefined,
    phone: phone || undefined,
  };
}
