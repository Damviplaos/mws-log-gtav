import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from './AuthContext';
import type { Team } from '@/types/types';
import { getMyTeams, createTeam as createTeamService, joinTeam as joinTeamService, switchTeam as switchTeamService, deleteTeam as deleteTeamService } from '@/services/teamService';
import { toast } from 'sonner';

interface TeamContextType {
  currentTeam: Team | null;
  teams: Team[];
  loading: boolean;
  createTeam: (name: string) => Promise<Team>;
  joinTeam: (inviteCode: string) => Promise<Team>;
  switchTeam: (teamId: string) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTeams = useCallback(async () => {
    try {
      const teamList = await getMyTeams();
      setTeams(teamList);

      // Auto-select team from profile
      if (profile?.team_id) {
        const found = teamList.find(t => t.id === profile.team_id);
        if (found) {
          setCurrentTeam(found);
        } else if (teamList.length > 0) {
          setCurrentTeam(teamList[0]);
        } else {
          setCurrentTeam(null);
        }
      } else if (teamList.length > 0) {
        setCurrentTeam(teamList[0]);
      } else {
        setCurrentTeam(null);
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
    }
  }, [profile?.team_id]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    loadTeams().finally(() => setLoading(false));
  }, [authLoading, loadTeams]);

  const createTeam = useCallback(async (name: string) => {
    const team = await createTeamService(name);
    toast.success(`สร้างทีม "${name}" สำเร็จ`);
    await loadTeams();
    setCurrentTeam(team);
    return team;
  }, [loadTeams]);

  const joinTeam = useCallback(async (inviteCode: string) => {
    const team = await joinTeamService(inviteCode);
    toast.success(`เข้าร่วมทีม "${team.name}" สำเร็จ`);
    await loadTeams();
    setCurrentTeam(team);
    return team;
  }, [loadTeams]);

  const switchTeam = useCallback(async (teamId: string) => {
    await switchTeamService(teamId);
    const team = teams.find(t => t.id === teamId);
    if (team) {
      setCurrentTeam(team);
      toast.success(`สลับไปทีม "${team.name}" แล้ว`);
    }
  }, [teams]);

  const deleteTeam = useCallback(async (teamId: string) => {
    await deleteTeamService(teamId);
    toast.success('ลบทีมสำเร็จ');
    if (currentTeam?.id === teamId) {
      setCurrentTeam(null);
    }
    await loadTeams();
  }, [currentTeam, loadTeams]);

  const refreshTeams = useCallback(async () => {
    await loadTeams();
  }, [loadTeams]);

  return (
    <TeamContext.Provider value={{ currentTeam, teams, loading, createTeam, joinTeam, switchTeam, deleteTeam, refreshTeams }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within a TeamProvider');
  return context;
}
