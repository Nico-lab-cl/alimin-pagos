"use server";

import crypto from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cargarTerrenosDelUsuario } from "@/lib/terrenosCliente";
import { registrarComprobanteCliente } from "@/lib/comprobantesCliente";

/**
 * Gets all data for the logged-in user's lots across all their projects.
 */
export async function getUserLots() {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado", lots: [] };

  return cargarTerrenosDelUsuario((session.user as any).id);
}

/**
 * Uploads a payment receipt from the user.
 */
export async function uploadPaymentReceipt({
  reservationId,
  amount,
  scope,
  receiptBase64,
  installmentsCount = 1,
}: {
  reservationId: string;
  amount: number;
  scope: "PIE" | "INSTALLMENT";
  receiptBase64: string;
  installmentsCount?: number;
}) {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado" };

  return registrarComprobanteCliente({
    userId: (session.user as any).id,
    isAdmin: (session.user as any).role === "ADMIN",
    reservationId,
    amount,
    scope,
    receiptBase64,
    installmentsCount,
  });
}

/**
 * Updates the FCM token for the current user.
 */
export async function updateFcmToken(token: string, platform?: string) {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado" };

  const userId = (session.user as any).id;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        fcm_token: token,
        last_platform: platform || "android",
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating FCM token:", error);
    return { error: "Error al actualizar token de notificaciones" };
  }
}

/**
 * Generates a password reset token and saves it to the user.
 */
export async function requestPasswordReset(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // For security, don't reveal if user exists or not
      return { success: true };
    }

    // Token de 64 caracteres hex con crypto: Math.random() se puede predecir y
    // el que tenga este link puede cambiarle la clave al cliente.
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_password_token: token,
        reset_password_expires: expires,
      },
    });

    // Arma el link de recuperacion apuntando al portal de pagos.
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.AUTH_URL || "https://pagos.aliminspa.cl").replace(/\/$/, "");
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Envia el link por n8n (mismo webhook de recuperacion que ya usaba
    // aliminlomasdelmar.com; solo manda el correo con el link que le pasamos).
    const webhookUrl = process.env.N8N_PASSWORD_RESET_WEBHOOK_URL
      || "https://n8n.aliminlomasdelmar.com/webhook/140fae21-540a-4ef5-b0bf-7354b9baa44d";
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: user.name,
          resetLink,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error("Error enviando el correo de recuperacion via n8n:", e);
      // No revelamos el fallo al cliente; el token quedo guardado igual.
    }

    return { success: true }; // Ya no se devuelve el token (seguridad).
  } catch (error) {
    console.error("Error in requestPasswordReset:", error);
    return { error: "Error al procesar la solicitud" };
  }
}

/**
 * Resets the password using a valid token.
 */
import bcrypt from "bcryptjs";

export async function resetPassword(token: string, newPassword: string) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        reset_password_token: token,
        reset_password_expires: { gt: new Date() },
      },
    });

    if (!user) {
      return { error: "El enlace de recuperación es inválido o ha expirado" };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        reset_password_token: null,
        reset_password_expires: null,
        must_change_password: false,
        password_changed_at: new Date()
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return { error: "Error al restablecer la contraseña" };
  }
}

/**
 * Gets all notifications for the current user.
 */
export async function getUserNotifications() {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado", notifications: [] };

  const userId = (session.user as any).id;

  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    return { success: true, notifications };
  } catch (error) {
    console.error("Error getting notifications:", error);
    return { error: "Error al cargar notificaciones", notifications: [] };
  }
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(notificationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado" };

  const userId = (session.user as any).id;

  try {
    await prisma.notification.update({
      where: { id: notificationId, user_id: userId },
      data: { read: true },
    });

    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { error: "Error al marcar como leída" };
  }
}
