"use client";

/**
 * Project "Chat" tab — supports multiple channels per project. The default
 * auto-created channel is selected first; users can add additional channels
 * via the "+" button.
 */

import { useMemo, useState, useEffect } from "react";
import { Plus, Hash } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChannels, type ChannelSummary } from "@/lib/api/hooks";
import { toArray, cn } from "@/lib/utils";
import { LoadingState } from "@/components/ui/state";
import { CreateProjectChannelDialog } from "@/app/(dashboard)/chat/_create-dialogs";

export function ProjectChatTab({ projectId }: { projectId: string }) {
  const channelsQuery = useChannels();

  const projectChannels = useMemo(() => {
    const list = toArray<ChannelSummary>(channelsQuery.data);
    return list
      .filter((c) => c.projectId === projectId && c.type === "PROJECT")
      .sort((a, b) => {
        const ta = new Date(a.updatedAt as unknown as string).getTime();
        const tb = new Date(b.updatedAt as unknown as string).getTime();
        // Oldest (the auto-created default) first → keeps a stable tab order.
        return ta - tb;
      });
  }, [channelsQuery.data, projectId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!selectedId && projectChannels.length > 0) {
      setSelectedId(projectChannels[0].id);
    }
    // If selected channel disappears (e.g. filtered out), fall back to first.
    if (selectedId && !projectChannels.some((c) => c.id === selectedId)) {
      setSelectedId(projectChannels[0]?.id ?? null);
    }
  }, [projectChannels, selectedId]);

  if (channelsQuery.isLoading) return <LoadingState label="Loading channel…" />;

  if (projectChannels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/30">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">No channel yet</div>
        <div className="text-xs text-slate-500">
          The project channel will appear here once you're added as a member.
        </div>
      </div>
    );
  }

  const showTabBar = projectChannels.length > 1;

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[480px] flex-col gap-2">
      {showTabBar ? (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/50 pb-1">
          {projectChannels.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
              >
                <Hash className="size-3" />
                <span className="truncate max-w-[140px]">{c.name}</span>
                {c.unreadCount > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                    {c.unreadCount > 99 ? "99+" : c.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            title="New channel"
            className="ml-1 inline-flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            title="New channel"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <Plus className="size-3.5" /> New channel
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {selectedId && <ChatPanel channelId={selectedId} showHeader={false} />}
      </div>

      <CreateProjectChannelDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  );
}
