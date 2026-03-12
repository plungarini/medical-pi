"use client";

import { useEffect, useState } from "react";
import { profileApi } from "@/lib/api";
import type { ProfileHistoryEntry } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

export function ProfileHistoryDrawer() {
  const [history, setHistory] = useState<ProfileHistoryEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      profileApi.getHistory().then(setHistory).catch(console.error);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="mr-2 h-4 w-4" />
          History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Profile History</SheetTitle>
          <SheetDescription>
            Timeline of automatic profile updates from your conversations
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          <div className="space-y-4 pr-4">
            {history.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No history yet. Profile updates will appear here.
              </p>
            ) : (
              history.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    <Badge variant={entry.diff.hasNewInfo ? "default" : "secondary"}>
                      {entry.diff.patches.length} changes
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {entry.diff.patches.map((patch, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium capitalize">{patch.field}</span>:{" "}
                        <span className="text-muted-foreground">{patch.operation}</span>
                        {patch.confidence < 0.7 && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Low confidence
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
