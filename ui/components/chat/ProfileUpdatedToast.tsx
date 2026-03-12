"use client";

import { useEffect } from "react";
import { toast } from "sonner";

interface ProfileUpdatedToastProps {
  fields: string[];
  flagged: boolean;
}

export function showProfileUpdatedToast({ fields, flagged }: ProfileUpdatedToastProps) {
  const fieldList = fields.join(", ");
  
  if (flagged) {
    toast.warning("Profile Updated", {
      description: `New information detected in: ${fieldList}. Please review for accuracy.`,
      duration: 5000,
    });
  } else {
    toast.success("Profile Updated", {
      description: `Automatically added: ${fieldList}`,
      duration: 3000,
    });
  }
}
