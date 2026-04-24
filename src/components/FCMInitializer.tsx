"use client";

import { useSession } from "next-auth/react";
import { useFCM } from "@/hooks/useFCM";

export function FCMInitializer() {
  const { data: session } = useSession();
  
  // Use the hook - it handles its own conditional logic for web vs native
  useFCM();

  return null;
}
