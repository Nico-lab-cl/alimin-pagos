import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT not found in environment variables. Push notifications will be disabled.");
    }
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
  }
}

export async function sendPushNotification({
  token,
  title,
  body,
  data,
}: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  if (!admin.apps.length) return { error: "Firebase not initialized" };

  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: data || {},
      token: token,
      android: {
        priority: "high" as const,
        notification: {
          sound: "default",
          // Canal que crea la Alimin app ("Avisos de Alimin"). En la app de
          // postventa no existe y Android usa el canal por defecto.
          channelId: "default",
          color: "#4ba646",
          vibrateTimingsMillis: [0, 500, 200, 500], // Vibration pattern
        },
      },
    };

    const response = await admin.messaging().send(message);
    return { success: true as const, response };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("Error sending push notification:", code || error);
    return { error: "Failed to send notification", code };
  }
}
