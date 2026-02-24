"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  MessageSquare,
  Users,
  User,
  Shield,
  ChevronDown,
  LayoutDashboard,
  TrendingUp,
  Settings,
  HelpCircle,
  Check,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  FlaskConical,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePerspective, Team } from "@/lib/perspective-context";
import { useChatHistory } from "@/components/chat/chat-history-context";
import { signOutAndRedirect } from "@/utils/auth/logout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAfter, isToday, isYesterday, subDays } from "date-fns";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const toCompactConversationTitle = (title: string) => {
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 34) return cleaned;
  return `${cleaned.slice(0, 34)}...`;
};

export function Sidebar({
  className,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { activeTeam, activeLeague, switchPerspective, isMyTeam } = usePerspective();
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    setConversationLanguage,
    deleteConversation,
    createConversation,
  } = useChatHistory();
  const pathname = usePathname();

  const handleLogout = async () => {
    await signOutAndRedirect();
  };

  const teams = activeLeague?.teams || [];
  const historyForTeam = conversations.filter(
    (conversation) => conversation.activeTeamId === (activeTeam?.id ?? null)
  );
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId
  );

  const groupedConversations = {
    today: historyForTeam.filter((conversation) => isToday(new Date(conversation.lastMessageAt))),
    yesterday: historyForTeam.filter((conversation) =>
      isYesterday(new Date(conversation.lastMessageAt))
    ),
    last7Days: historyForTeam.filter((conversation) => {
      const date = new Date(conversation.lastMessageAt);
      return (
        !isToday(date) &&
        !isYesterday(date) &&
        isAfter(date, subDays(new Date(), 7))
      );
    }),
  };

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/", active: pathname === "/" },
    { label: "Chat Assistant", icon: MessageSquare, href: "/chat", active: pathname === "/chat" },
    { label: "Optimizer", icon: TrendingUp, href: "/optimize", active: pathname === "/optimize" },
    { label: "League Info", icon: Users, href: "/league", active: pathname === "/league" },
  ];

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border bg-background/95 backdrop-blur-xl transition-[width]",
        collapsed ? "w-[88px]" : "w-[280px]",
        className
      )}
    >
      {/* Brand Header */}
      <div className={cn("pb-2", collapsed ? "p-4" : "p-6")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <Link href="/" className="group flex items-center gap-3" onClick={onNavigate}>
          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-primary/20 bg-primary/5 flex items-center justify-center group-hover:border-primary/40 transition-colors">
            <Image 
              src="/fanvise_logo.png" 
              alt="FanVise Logo" 
              width={24} 
              height={24}
              className="object-contain"
            />
          </div>
          {!collapsed && (
            <span className="font-black text-xl tracking-tighter uppercase italic">
              Fan<span className="text-primary">Vise</span>
            </span>
          )}
          </Link>
          {!!onToggleCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className={cn(
                "h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                collapsed && "hidden md:inline-flex"
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Team Switcher Header */}
      <div className="p-3 border-b">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-between border border-transparent hover:border-border hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
                collapsed ? "h-12 px-1" : "h-14 px-2"
              )}
            >
               <div className="flex items-center gap-3 overflow-hidden">
                  <Avatar className="h-8 w-8 border">
                    <AvatarImage src={activeTeam?.logo} />
                    <AvatarFallback>{activeTeam?.abbrev?.substring(0, 2) || "T"}</AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex flex-col items-start truncate text-left">
                      <span className="w-[140px] truncate text-sm font-semibold">
                        {activeTeam?.manager || "Select Team"}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {isMyTeam ? <User className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                        {isMyTeam ? "My Team" : "Opponent View"}
                      </span>
                    </div>
                  )}
               </div>
               {!collapsed && <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="z-50 w-[280px] border-border bg-popover shadow-2xl" align="start" side="bottom" sideOffset={10}>
            <DropdownMenuLabel className="text-xs font-bold text-muted-foreground px-3 py-2 uppercase tracking-widest">Switch Perspective</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-[400px]">
                <div className="p-1">
                    {teams.map((team: Team) => (
                        <DropdownMenuItem 
                            key={team.id} 
                            className="cursor-pointer gap-3 rounded-lg px-3 py-3 transition-colors focus:bg-primary/10"
                            onClick={() => {
                              switchPerspective(team.id);
                              onNavigate?.();
                            }}
                        >
                            <Avatar className="h-8 w-8 border shadow-sm">
                                <AvatarImage src={team.logo} />
                                <AvatarFallback className="text-[11px]">{team.abbrev?.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-sm truncate">{team.manager}</span>
                                <span className="truncate text-[11px] text-muted-foreground">{team.name}</span>
                            </div>
                            {team.is_user_owned && (
                                <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-black text-primary-foreground">YOU</span>
                            )}
                        </DropdownMenuItem>
                    ))}
                </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Navigation Section */}
        <div className="space-y-1">
          {!collapsed && (
            <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Main
            </h2>
          )}
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} onClick={onNavigate}>
              <Button
                variant={item.active ? "secondary" : "ghost"}
                className={cn(
                  "h-10 gap-3 focus-visible:ring-2 focus-visible:ring-ring",
                  collapsed ? "w-full justify-center px-0" : "w-full justify-start px-3",
                  item.active ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground hover:text-foreground"
                )}
                title={item.label}
              >
                <item.icon className={cn("h-4 w-4", item.active ? "text-primary" : "opacity-70")} />
                {!collapsed && item.label}
              </Button>
            </Link>
          ))}
        </div>

        {/* Intelligence History */}
        <div className={cn("space-y-1", collapsed && "hidden")}>
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Recent Conversations
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Create conversation"
              onClick={() => {
                createConversation(activeTeam?.id ?? null, activeConversation?.language ?? "en");
                onNavigate?.();
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {(["today", "yesterday", "last7Days"] as const).map((groupKey) => {
            const list = groupedConversations[groupKey];
            if (list.length === 0) return null;
            const title =
              groupKey === "today"
                ? "Today"
                : groupKey === "yesterday"
                ? "Yesterday"
                : "Last 7 Days";

            return (
              <div key={groupKey} className="space-y-1">
                <p className="px-2 pt-2 text-[11px] uppercase tracking-wider text-muted-foreground">{title}</p>
                {list.map((conversation) => (
                  <div key={conversation.id} className="group flex items-center gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setActiveConversation(conversation.id);
                        onNavigate?.();
                      }}
                      className={cn(
                        "h-9 min-w-0 flex-1 justify-start text-sm font-normal focus-visible:ring-2 focus-visible:ring-ring",
                        activeConversationId === conversation.id
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <MessageSquare className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                      <span className="truncate">{toCompactConversationTitle(conversation.title)}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const shouldDelete = window.confirm("Delete this conversation history?");
                        if (!shouldDelete) return;
                        deleteConversation(conversation.id);
                      }}
                      className="h-8 w-8 shrink-0 rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Delete conversation: ${conversation.title}`}
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="mt-auto space-y-4 border-t border-border bg-muted/10 p-4">
          <div className={cn("space-y-2 rounded-xl border border-border bg-card/80 p-2", collapsed && "hidden")}>
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Response language</span>
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!activeConversationId}
                  onClick={() =>
                    activeConversationId && setConversationLanguage(activeConversationId, "en")
                  }
                  className={cn(
                    "h-8 border text-xs focus-visible:ring-2 focus-visible:ring-ring",
                    activeConversation?.language === "en"
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-background text-foreground/80"
                  )}
                >
                  {activeConversation?.language === "en" && <Check className="mr-1 h-3.5 w-3.5" />}
                  English
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!activeConversationId}
                  onClick={() =>
                    activeConversationId && setConversationLanguage(activeConversationId, "el")
                  }
                  className={cn(
                    "h-8 border text-xs focus-visible:ring-2 focus-visible:ring-ring",
                    activeConversation?.language === "el"
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-background text-foreground/80"
                  )}
                >
                  {activeConversation?.language === "el" && <Check className="mr-1 h-3.5 w-3.5" />}
                  Ελληνικά
                </Button>
              </div>
          </div>
          <div className={cn("flex flex-col gap-1", collapsed && "hidden")}>
              <Button
                variant="ghost"
                asChild
                className="h-9 w-full justify-start gap-3 px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Link href="/settings" onClick={onNavigate}>
                  <Settings className="h-4 w-4 opacity-70" />
                  Settings
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="h-9 w-full justify-start gap-3 px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                  <HelpCircle className="h-4 w-4 opacity-70" />
                  Support
              </Button>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="h-9 w-full justify-start gap-3 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
              >
                  <LogOut className="h-4 w-4 opacity-70" />
                  Logout
              </Button>
          </div>
          {process.env.NODE_ENV === "development" && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border border-dashed border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5",
                collapsed && "justify-center px-1"
              )}
            >
              <FlaskConical className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              {!collapsed && (
                <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-yellow-500/90">
                  Dev · test@example.com
                </span>
              )}
            </div>
          )}

          <div className={cn("flex items-center gap-3 px-2", collapsed && "justify-center px-0")}>
             <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]" />
             {!collapsed && (
               <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                 Perspective Active
               </span>
             )}
          </div>
      </div>
    </div>
  );
}

