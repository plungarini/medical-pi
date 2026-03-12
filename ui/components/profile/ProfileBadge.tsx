"use client";

import { useEffect, useState } from "react";
import { profileApi } from "@/lib/api";
import type { MedicalProfile } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

export function ProfileBadge() {
  const [profile, setProfile] = useState<MedicalProfile | null>(null);

  useEffect(() => {
    profileApi
      .get()
      .then(setProfile)
      .catch(() => {
        // Silently fail - badge is non-critical
      });
  }, []);

  const conditionCount =
    (profile?.currentConditions?.length ?? 0) +
    (profile?.persistentConditions?.length ?? 0);

  if (!profile || conditionCount === 0) {
    return null;
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <Activity className="h-3 w-3" />
      {conditionCount} active
    </Badge>
  );
}
