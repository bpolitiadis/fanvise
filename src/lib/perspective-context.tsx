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
  espn_id: string
  season_id?: string
  scoring_settings: ScoringSettings
  roster_slots: RosterSlots
  last_sync?: string
}

export interface Team {
  team_id: string
  espn_team_id: string
  espn_league_id: string
  manager_name?: string
  is_user_owned: boolean
}

interface PerspectiveState {
  activeTeamId: string | null
  activeLeagueId: string | null
  activeTeam: Team | null
  activeLeague: League | null
  isLoading: boolean
  error: string | null
  switchPerspective: (teamId: string) => Promise<void>
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

  const fetchContextData = useCallback(async (teamId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Fetch Team
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('team_id', teamId)
        .single()

      if (teamError) throw teamError
      if (!teamData) throw new Error('Team not found')

      const team = teamData as Team
      setActiveTeam(team)
      setActiveLeagueId(team.espn_league_id) // Update derived state

      // 2. Fetch League (using espn_league_id from team)
      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues')
        .select('*')
        .eq('espn_id', team.espn_league_id)
        .single()

      if (leagueError) throw leagueError
      
      setActiveLeague(leagueData as League)
     
    } catch (err) {
      console.error('Failed to load perspective:', err)
      const message = err instanceof Error ? err.message : 'Failed to load perspective'
      setError(message)
      // Optional: Clear invalid storage if it fails?
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  // Initialize from LocalStorage
  useEffect(() => {
    const storedTeamId = localStorage.getItem(STORAGE_KEY)
    if (storedTeamId) {
      setActiveTeamId(storedTeamId)
      fetchContextData(storedTeamId)
    } else {
      setIsLoading(false)
    }
  }, [fetchContextData])

  const switchPerspective = async (teamId: string) => {
    setActiveTeamId(teamId)
    localStorage.setItem(STORAGE_KEY, teamId)
    await fetchContextData(teamId)
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
