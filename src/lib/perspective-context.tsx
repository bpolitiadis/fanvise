'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getNormalizedTeamLogoUrl } from '@/lib/espn/team-logo'
import { updateUserSettings } from '@/actions/settings'

// --- Types ---

export interface ScoringSettings {
  [key: string]: number
}

export interface RosterSlots {
  [key: string]: number // e.g., "PG": 1, "SG": 1
}

export interface League {
  league_id: string
  name: string
  season_id?: string
  scoring_settings: ScoringSettings
  roster_settings: RosterSlots
  draft_detail?: Record<string, unknown>
  last_sync?: string
  teams?: Team[] 
}

export interface Team {
  id: string
  name: string
  abbrev: string
  logo?: string
  manager: string
  wins?: number
  losses?: number
  ties?: number
  is_user_owned?: boolean
}

const normalizeTeams = (teams: Team[] | undefined): Team[] => {
  if (!Array.isArray(teams)) return []
  return teams.map((team) => ({
    ...team,
    logo: getNormalizedTeamLogoUrl(team.logo),
  }))
}

const resolveDefaultTeam = (teams: Team[]): Team | null => {
  if (!Array.isArray(teams) || teams.length === 0) return null
  return teams.find((team) => team.is_user_owned) || teams[0] || null
}

interface PerspectiveState {
  activeTeamId: string | null
  activeLeagueId: string | null
  activeTeam: Team | null
  activeLeague: League | null
  isLoading: boolean
  error: string | null
  switchPerspective: (teamId: string | number, leagueId?: string) => Promise<void>
  refreshPerspective: () => Promise<void>
  isMyTeam: boolean
}

// --- Context ---

const PerspectiveContext = createContext<PerspectiveState | undefined>(undefined)

export const PerspectiveProvider = ({ children }: { children: ReactNode }) => {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)
  const [activeTeam, setActiveTeam] = useState<Team | null>(null)
  const [activeLeague, setActiveLeague] = useState<League | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchContextData = useCallback(async (teamId?: string, forceLeagueId?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Determine which league to fetch
      let leagueId = forceLeagueId

      if (!leagueId && teamId) {
        const { data: userLeagueData } = await supabase
          .from('user_leagues')
          .select('league_id')
          .eq('team_id', teamId)
          .maybeSingle()
        leagueId = userLeagueData?.league_id
      }

      // Fallback: user_settings.espn_league_id → env var
      if (!leagueId) {
        const { data: authData } = await supabase.auth.getUser()
        if (authData.user) {
          const { data: settings } = await supabase
            .from('user_settings')
            .select('espn_league_id')
            .eq('user_id', authData.user.id)
            .maybeSingle()
          leagueId = settings?.espn_league_id ?? undefined
        }
      }
      if (!leagueId) leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID

      if (!leagueId) {
        throw new Error('No league context available. Check NEXT_PUBLIC_ESPN_LEAGUE_ID.')
      }

      // 2. Fetch League
      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues')
        .select('*')
        .eq('league_id', leagueId)
        .single()

      if (leagueError) throw new Error(`Database error: ${leagueError.message}`)
      if (!leagueData) throw new Error('League not found')

      // 3. Determine the user's own team ID (settings → env var fallback)
      //    This drives is_user_owned so the sidebar shows "YOU" on the correct team.
      let ownTeamId: string | null = null
      const { data: authData } = await supabase.auth.getUser()
      if (authData.user) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('espn_team_id')
          .eq('user_id', authData.user.id)
          .maybeSingle()
        ownTeamId = settings?.espn_team_id?.trim() || null
      }
      // Final fallback to env var (dev convenience)
      if (!ownTeamId) ownTeamId = process.env.NEXT_PUBLIC_ESPN_TEAM_ID ?? null

      const rawLeague = leagueData as League
      // Annotate teams: mark the user's own team from settings/env, or keep existing is_user_owned
      const teams = normalizeTeams(rawLeague.teams as Team[] | undefined).map((t) => ({
        ...t,
        is_user_owned: ownTeamId
          ? String(t.id) === String(ownTeamId)
          : Boolean(t.is_user_owned),
      }))

      const league: League = { ...rawLeague, teams }
      setActiveLeague(league)
      setActiveLeagueId(league.league_id)

      // 4. Set active team
      if (teamId) {
        const team = teams.find(t => String(t.id) === String(teamId))
        if (team) {
          setActiveTeam(team)
          setActiveTeamId(team.id)
        } else {
          console.warn(`[Perspective] Team ${teamId} not found — falling back.`)
          const fallbackTeam = resolveDefaultTeam(teams)
          if (fallbackTeam) {
            setActiveTeam(fallbackTeam)
            setActiveTeamId(fallbackTeam.id)
          } else {
            setActiveTeam(null)
            setActiveTeamId(null)
          }
        }
      } else {
        const fallbackTeam = resolveDefaultTeam(teams)
        if (fallbackTeam) {
          setActiveTeam(fallbackTeam)
          setActiveTeamId(fallbackTeam.id)
        } else {
          setActiveTeam(null)
          setActiveTeamId(null)
        }
      }

    } catch (err) {
      console.error('Failed to load perspective:', err)
      const message = err instanceof Error ? err.message : 'Failed to load perspective'

      // Check for the specific Supabase JWT error
      if (message.includes('Expected 3 parts in JWT')) {
        console.warn('Detected malformed JWT. Signing out to clear invalid session...');
        await supabase.auth.signOut();
        window.location.reload(); // Reload to reset state
        return;
      }

      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  // Initialize directly from server/supabase state
  useEffect(() => {
    const init = async () => {
      await fetchContextData()
    }
    init()
  }, [fetchContextData])

  const switchPerspective = async (teamId: string | number, leagueId?: string) => {
    const id = String(teamId)
    const activeLId = leagueId ? String(leagueId) : activeLeagueId

    setActiveTeamId(id)
    if (activeLId) setActiveLeagueId(activeLId)

    if (activeLId) {
      // Fire action to persist immediately without waiting
      updateUserSettings({ espn_league_id: activeLId, espn_team_id: id }).catch(console.error)
    }

    await fetchContextData(id, activeLId ?? undefined)
  }

  const refreshPerspective = useCallback(async () => {
    // Re-read user_settings and league context after settings updates.
    await fetchContextData()
  }, [fetchContextData])

  const isMyTeam = activeTeam?.is_user_owned ?? false

  return (
    <PerspectiveContext.Provider
      value={{
        activeTeamId,
        activeLeagueId,
        activeTeam,
        activeLeague,
        isLoading,
        error,
        switchPerspective,
        refreshPerspective,
        isMyTeam,
      }}
    >
      {children}
    </PerspectiveContext.Provider>
  )
}

// --- Hook ---

export const usePerspective = () => {
  const context = useContext(PerspectiveContext)
  if (context === undefined) {
    throw new Error('usePerspective must be used within a PerspectiveProvider')
  }
  return context
}
