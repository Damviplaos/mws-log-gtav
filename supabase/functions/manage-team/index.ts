import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, team_id, target_user_id, channel_id } = await req.json();

    // Get caller's profile for permission check
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('system_role, team_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create_team') {
      // Anyone authenticated can create a team
      const { name } = await req.json();
      const inviteCode = String(Math.floor(1000 + Math.random() * 9000));

      const { data: team, error } = await supabase
        .from('teams')
        .insert({
          name: name.trim(),
          invite_code: inviteCode,
          owner_id: user.id,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      // Set team_id on creator's profile
      await supabase
        .from('profiles')
        .update({ team_id: team.id })
        .eq('id', user.id);

      return new Response(JSON.stringify(team), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'switch_team') {
      if (!team_id) {
        return new Response(JSON.stringify({ error: 'Missing team_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify user belongs to this team
      const { data: profile } = await supabase
        .from('profiles')
        .select('team_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.team_id !== team_id && callerProfile.system_role !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'Not a member of this team' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('profiles')
        .update({ team_id })
        .eq('id', user.id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'admin_move_user') {
      // Admin: move another user to a channel
      if (callerProfile.system_role !== 'super_admin' && callerProfile.system_role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!target_user_id || !channel_id) {
        return new Response(JSON.stringify({ error: 'Missing target_user_id or channel_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get current presence
      const { data: currentPresence } = await supabase
        .from('user_presence')
        .select('channel_id')
        .eq('user_id', target_user_id)
        .maybeSingle();

      const fromChannelId = currentPresence?.channel_id ?? null;

      // Update or insert presence
      const upsertData: Record<string, unknown> = {
        user_id: target_user_id,
        channel_id,
        joined_channel_at: new Date().toISOString(),
        session_started_at: new Date().toISOString(),
      };
      if (callerProfile.team_id) upsertData.team_id = callerProfile.team_id;

      const { error: upsertError } = await supabase
        .from('user_presence')
        .upsert(upsertData, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;

      // Log the move
      const logData: Record<string, unknown> = {
        user_id: target_user_id,
        from_channel_id: fromChannelId,
        to_channel_id: channel_id,
        changed_at: new Date().toISOString(),
      };
      if (callerProfile.team_id) logData.team_id = callerProfile.team_id;
      await supabase.from('presence_logs').insert(logData);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
