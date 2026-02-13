'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

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

interface PerspectiveState {
  activeTeamId: string | null
  activeLeagueId: string | null
  activeTeam: Team | null
  activeLeague: League | null
  isLoading: boolean
  error: string | null
  switchPerspective: (teamId: string | number) => Promise<void>
  isMyTeam: boolean
}

// --- Context ---

const PerspectiveContext = createContext<PerspectiveState | undefined>(undefined)

const STORAGE_KEY = 'fanvise_active_team_id'

export const PerspectiveProvider = ({ children }: { children: ReactNode }) => {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)
  const [activeTeam, setActiveTeam] = useState<Team | null>(null)
  const [activeLeague, setActiveLeague] = useState<League | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true) // Start loading to check storage
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchContextData = useCallback(async (teamId?: string, forceLeagueId?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Determine which league to fetch
      let leagueId = forceLeagueId

      if (!leagueId && teamId) {
        // Try to find league for this team in user_leagues
        const { data: userLeagueData } = await supabase
          .from('user_leagues')
          .select('league_id')
          .eq('team_id', teamId)
          .maybeSingle()
        
        leagueId = userLeagueData?.league_id
      }

      // Fallback to env var if still no leagueId
      if (!leagueId) {
        leagueId = process.env.NEXT_PUBLIC_ESPN_LEAGUE_ID
        console.log('Using default league ID from env:', leagueId)
      }

      if (!leagueId) {
        throw new Error('No league context available. Check NEXT_PUBLIC_ESPN_LEAGUE_ID.')
      }

      console.log('Fetching league data for ID:', leagueId)

      // 2. Fetch League
      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues')
        .select('*')
        .eq('league_id', leagueId)
        .single()

      if (leagueError) {
        console.error('Supabase error fetching league:', leagueError)
        throw new Error(`Database error: ${leagueError.message}`)
      }
      if (!leagueData) throw new Error('League not found')

      const league = leagueData as League
      setActiveLeague(league)
      setActiveLeagueId(league.league_id)

      // 3. Set Active Team if teamId is provided
      const teams = (league.teams as Team[]) || []
      
      if (teamId) {
        const team = teams.find(t => String(t.id) === String(teamId))
        if (team) {
          setActiveTeam(team)
          setActiveTeamId(team.id)
        } else {
          console.warn(`[Perspective] Team ${teamId} not found in league ${leagueId}. Clearing stale perspective.`)
          localStorage.removeItem(STORAGE_KEY)
          
          // Try to fallback to user's own team if available in the team list
          const userTeam = teams.find(t => t.is_user_owned)
          if (userTeam) {
            console.log(`[Perspective] Defaulting to user-owned team: ${userTeam.name}`)
            setActiveTeam(userTeam)
            setActiveTeamId(userTeam.id)
            localStorage.setItem(STORAGE_KEY, userTeam.id)
          } else {
            setActiveTeam(null)
            setActiveTeamId(null)
          }
        }
      } else {
        // No teamId provided, try to default to user-owned team
        const userTeam = teams.find(t => t.is_user_owned)
        if (userTeam) {
          console.log(`[Perspective] Defaulting to user-owned team: ${userTeam.name}`)
          setActiveTeam(userTeam)
          setActiveTeamId(userTeam.id)
        } else {
          setActiveTeam(null)
          setActiveTeamId(null)
        }
      }

    } catch (err) {
      console.error('Failed to load perspective:', err)
      const message = err instanceof Error ? err.message : 'Failed to load perspective'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  // Initialize from LocalStorage or default from user_leagues
  useEffect(() => {
    const init = async () => {
      const storedTeamId = localStorage.getItem(STORAGE_KEY)
      
      if (storedTeamId) {
        // We have a saved team, use it
        await fetchContextData(storedTeamId)
      } else {
        // Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          // Try to get their active team
          const { data: userLeagueData } = await supabase
            .from('user_leagues')
            .select('team_id, league_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle()

          if (userLeagueData?.team_id) {
            await fetchContextData(userLeagueData.team_id, userLeagueData.league_id)
          } else {
            // Logged in but no active team, just load default league
            await fetchContextData()
          }
        } else {
          // Not logged in, load default league
          await fetchContextData()
        }
      }
    }
    init()
  }, [fetchContextData, supabase])

  const switchPerspective = async (teamId: string | number) => {
    const id = String(teamId)
    setActiveTeamId(id)
    localStorage.setItem(STORAGE_KEY, id)
    await fetchContextData(id)
  }

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
