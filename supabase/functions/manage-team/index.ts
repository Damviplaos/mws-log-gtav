import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, team_id, target_user_id, channel_id } = body;

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('system_role, team_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: 'ไม่พบโปรไฟล์' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create_team') {
      const { name } = body;
      if (!name || !name.trim()) {
        return new Response(JSON.stringify({ error: 'ต้องระบุชื่อทีม' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const inviteCode = String(Math.floor(1000 + Math.random() * 9000));

      const { data: team, error } = await supabaseAdmin
        .from('teams')
        .insert({
          name: name.trim(),
          invite_code: inviteCode,
          owner_id: user.id,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      await supabaseAdmin
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

      const { error } = await supabaseAdmin
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
      let allowed = ['super_admin', 'admin'].includes(callerProfile.system_role);
      if (!allowed) {
        const { data: perms } = await supabaseAdmin.rpc('get_user_permissions', { p_user_id: user.id });
        allowed = Array.isArray(perms) && perms.some((r: { permission: string }) => r.permission === 'move_player');
      }
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์ move_player' }), {
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

      const { data: currentPresence } = await supabaseAdmin
        .from('user_presence')
        .select('channel_id')
        .eq('user_id', target_user_id)
        .maybeSingle();

      const fromChannelId = currentPresence?.channel_id ?? null;

      const upsertData: Record<string, unknown> = {
        user_id: target_user_id,
        channel_id,
        joined_channel_at: new Date().toISOString(),
        session_started_at: new Date().toISOString(),
      };
      if (callerProfile.team_id) upsertData.team_id = callerProfile.team_id;

      const { error: upsertError } = await supabaseAdmin
        .from('user_presence')
        .upsert(upsertData, { onConflict: 'user_id' });
      if (upsertError) throw upsertError;

      const logData: Record<string, unknown> = {
        user_id: target_user_id,
        from_channel_id: fromChannelId,
        to_channel_id: channel_id,
        changed_at: new Date().toISOString(),
      };
      if (callerProfile.team_id) logData.team_id = callerProfile.team_id;
      await supabaseAdmin.from('presence_logs').insert(logData);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'ไม่รู้จัก action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
