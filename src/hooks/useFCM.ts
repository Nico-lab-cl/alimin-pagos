"use client";

import { useEffect } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { updateFcmToken } from "@/actions/user";

export function useFCM() {
  useEffect(() => {
    // Only run on native platforms
    if (Capacitor.getPlatform() === "web") return;

    const registerPush = async () => {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== "granted") {
        console.warn("User denied permissions for notifications");
        return;
      }

      await PushNotifications.register();
    };

    PushNotifications.addListener("registration", (token) => {
      console.log("Push registration success, token: " + token.value);
      updateFcmToken(token.value, Capacitor.getPlatform());
    });

    PushNotifications.addListener("registrationError", (error) => {
      console.error("Error on registration: " + JSON.stringify(error));
    });

    PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        console.log("Push received: " + JSON.stringify(notification));
        // We can trigger a vibration here if needed, 
        // but push notifications usually vibrate by default if configured.
      }
    );

    registerPush();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);
}
