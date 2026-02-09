"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Users, User, Shield, ChevronDown, LayoutDashboard, TrendingUp, Settings, HelpCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePerspective, Team } from "@/lib/perspective-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Sidebar() {
  const { activeTeam, activeLeague, switchPerspective, isMyTeam } = usePerspective();
  const pathname = usePathname();

  const teams = activeLeague?.teams || [];

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/", active: pathname === "/" },
    { label: "Chat Assistant", icon: MessageSquare, href: "/chat", active: pathname === "/chat" },
    { label: "Optimizer", icon: TrendingUp, href: "/optimize", active: pathname === "/optimize" },
    { label: "League Info", icon: Users, href: "/league", active: pathname === "/league" },
  ];

  return (
    <div className="flex h-full w-[280px] flex-col border-r bg-muted/20">
      {/* Team Switcher Header */}
      <div className="p-3 border-b">
         <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-2 h-14 hover:bg-muted/50 border border-transparent hover:border-border">
               <div className="flex items-center gap-3 overflow-hidden">
                  <Avatar className="h-8 w-8 border">
                    <AvatarImage src={activeTeam?.logo} />
                    <AvatarFallback>{activeTeam?.abbrev?.substring(0, 2) || "T"}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start truncate text-left">
                     <span className="font-semibold text-sm truncate w-[140px]">{activeTeam?.manager || "Select Team"}</span>
                     <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        {isMyTeam ? <User className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                        {isMyTeam ? "My Team" : "Opponent View"}
                     </span>
                  </div>
               </div>
               <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[280px] bg-popover border-border shadow-2xl z-50" align="start" side="bottom" sideOffset={10}>
            <DropdownMenuLabel className="text-xs font-bold text-muted-foreground px-3 py-2 uppercase tracking-widest">Switch Perspective</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-[400px]">
                <div className="p-1">
                    {teams.map((team: Team) => (
                        <DropdownMenuItem 
                            key={team.id} 
                            className="cursor-pointer gap-3 py-3 px-3 focus:bg-primary/5 rounded-lg transition-colors"
                            onClick={() => switchPerspective(team.id)}
                        >
                            <Avatar className="h-8 w-8 border shadow-sm">
                                <AvatarImage src={team.logo} />
                                <AvatarFallback className="text-[10px]">{team.abbrev?.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-sm truncate">{team.manager}</span>
                                <span className="text-[10px] text-muted-foreground truncate">{team.name}</span>
                            </div>
                            {team.is_user_owned && (
                                <span className="ml-auto text-[8px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">YOU</span>
                            )}
                        </DropdownMenuItem>
                    ))}
                </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 px-3 py-4 space-y-6">
        {/* Navigation Section */}
        <div className="space-y-1">
          <h2 className="px-2 mb-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
            Main
          </h2>
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>
              <Button
                variant={item.active ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 h-10 px-3",
                  item.active ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", item.active ? "text-primary" : "opacity-70")} />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>

        {/* Intelligence History */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Recent Intel
            </h2>
            <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1">
            <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 truncate text-muted-foreground hover:text-foreground">
                <MessageSquare className="mr-3 h-4 w-4 opacity-50" />
                Waiver Strategy: WK12
            </Button>
            <Button variant="ghost" className="w-full justify-start text-sm font-normal h-9 truncate text-muted-foreground hover:text-foreground">
                <MessageSquare className="mr-3 h-4 w-4 opacity-50" />
                Trade Audit: Lillard
            </Button>
          </div>
        </div>
      </div>
      
      <div className="mt-auto p-4 border-t bg-muted/5 space-y-4">
          <div className="flex flex-col gap-1">
              <Button variant="ghost" className="w-full justify-start gap-3 h-9 px-2 text-muted-foreground text-xs">
                  <Settings className="h-4 w-4 opacity-70" />
                  Settings
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3 h-9 px-2 text-muted-foreground text-xs">
                  <HelpCircle className="h-4 w-4 opacity-70" />
                  Support
              </Button>
          </div>
          <div className="flex items-center gap-3 px-2">
             <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
             <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/70">Perspective Active</span>
          </div>
      </div>
    </div>
  );
}

