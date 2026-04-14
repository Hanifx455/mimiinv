import { Handler } from '@netlify/functions';
import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)),
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 1. Verify Binance signature (CRITICAL for security)
  // ...

  const payload = JSON.parse(event.body || '{}');

  // 2. Check if payment is successful
  if (payload.bizStatus === 'PAY_SUCCESS') {
    const userId = payload.merchantTradeNo; // You should pass userId in merchantTradeNo

    // 3. Update Firestore
    const db = admin.firestore();
    await db.collection('users').doc(userId).update({
      balance: admin.firestore.FieldValue.increment(payload.orderAmount),
    });
  }

  return { statusCode: 200, body: 'OK' };
};
