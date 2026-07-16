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

    // Fetch caller's profile (including team_id) once for all actions
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('system_role, team_id')
      .eq('id', user.id)
      .maybeSingle();

    const callerTeamId = callerProfile?.team_id ?? null;

    const { action, channel_id, is_op, target_user_id } = await req.json();

    if (action === 'join') {
      // Get default "ready" channel — filtered by team
      let targetChannelId = channel_id;
      if (!targetChannelId) {
        let readyQuery = supabaseAdmin
          .from('channels')
          .select('id')
          .eq('name', 'ready');
        if (callerTeamId) readyQuery = readyQuery.eq('team_id', callerTeamId);
        const { data: readyCh } = await readyQuery.maybeSingle();
        targetChannelId = readyCh?.id;
      }

      // End previous time log if exists
      const { data: existingPresence } = await supabaseAdmin
        .from('user_presence')
        .select('channel_id, is_op')
        .eq('user_id', user.id)
        .maybeSingle();

      const previousChannelId = existingPresence?.channel_id ?? null;

      if (existingPresence) {
        // Close open time log
        await supabaseAdmin
          .from('time_logs')
          .update({
            ended_at: new Date().toISOString(),
            duration_seconds: null,
          })
          .eq('user_id', user.id)
          .is('ended_at', null);

        await supabaseAdmin
          .from('user_presence')
          .delete()
          .eq('user_id', user.id);
      }

      // Insert new presence — always join with is_op=false, include team_id
      const insertData: Record<string, unknown> = {
        user_id: user.id,
        channel_id: targetChannelId,
        joined_channel_at: new Date().toISOString(),
        session_started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
        is_op: false,
      };
      if (callerTeamId) insertData.team_id = callerTeamId;

      const { data: newPresence, error: presenceError } = await supabaseAdmin
        .from('user_presence')
        .insert(insertData)
        .select()
        .maybeSingle();

      if (presenceError) {
        return new Response(JSON.stringify({ error: presenceError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Log channel change with team_id
      if (previousChannelId !== targetChannelId) {
        const logData: Record<string, unknown> = {
          user_id: user.id,
          from_channel_id: previousChannelId,
          to_channel_id: targetChannelId,
          changed_at: new Date().toISOString(),
        };
        if (callerTeamId) logData.team_id = callerTeamId;
        await supabaseAdmin.from('presence_logs').insert(logData);
      }

      // Start time log if channel tracks time
      const { data: ch } = await supabaseAdmin
        .from('channels')
        .select('track_time')
        .eq('id', targetChannelId)
        .maybeSingle();

      if (ch?.track_time) {
        const timeLogData: Record<string, unknown> = {
          user_id: user.id,
          channel_id: targetChannelId,
          started_at: new Date().toISOString(),
          is_op_time: false,
        };
        if (callerTeamId) timeLogData.team_id = callerTeamId;
        await supabaseAdmin.from('time_logs').insert(timeLogData);
      }

      return new Response(JSON.stringify({ success: true, presence: newPresence }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'leave') {
      // Close time log
      await supabaseAdmin
        .from('time_logs')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('ended_at', null);

      // If was pointer, advance pointer
      let pointerQuery = supabaseAdmin
        .from('queue_pointer')
        .select('pointed_user_id')
        .eq('id', '00000000-0000-0000-0000-000000000001');
      if (callerTeamId) pointerQuery = pointerQuery.eq('team_id', callerTeamId);
      const { data: pointer } = await pointerQuery.maybeSingle();

      await supabaseAdmin
        .from('user_presence')
        .delete()
        .eq('user_id', user.id);

      // Advance pointer if needed
      if (pointer?.pointed_user_id === user.id) {
        let readyQuery = supabaseAdmin
          .from('channels').select('id').eq('name', 'ready');
        if (callerTeamId) readyQuery = readyQuery.eq('team_id', callerTeamId);
        const { data: readyCh } = await readyQuery.maybeSingle();
        if (readyCh) {
          const { data: queue } = await supabaseAdmin
            .from('user_presence')
            .select('user_id, joined_channel_at')
            .eq('channel_id', readyCh.id)
            .neq('user_id', user.id)
            .order('joined_channel_at', { ascending: true });

          if (queue && queue.length > 0) {
            await supabaseAdmin
              .from('queue_pointer')
              .update({ pointed_user_id: queue[0].user_id, updated_at: new Date().toISOString() })
              .eq('id', '00000000-0000-0000-0000-000000000001');
          } else {
            await supabaseAdmin
              .from('queue_pointer')
              .update({ pointed_user_id: null, updated_at: new Date().toISOString() })
              .eq('id', '00000000-0000-0000-0000-000000000001');
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'heartbeat') {
      await supabaseAdmin
        .from('user_presence')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'set_op') {
      const { data: presence } = await supabaseAdmin
        .from('user_presence')
        .select('channel_id, is_op')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!presence) {
        return new Response(JSON.stringify({ error: 'ไม่พบสถานะออนไลน์' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Close current open time log
      await supabaseAdmin
        .from('time_logs')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('ended_at', null);

      // Update presence is_op
      await supabaseAdmin
        .from('user_presence')
        .update({ is_op })
        .eq('user_id', user.id);

      // Start new time log with correct is_op_time flag
      const { data: ch } = await supabaseAdmin
        .from('channels')
        .select('track_time')
        .eq('id', presence.channel_id)
        .maybeSingle();

      if (ch?.track_time) {
        const timeLogData: Record<string, unknown> = {
          user_id: user.id,
          channel_id: presence.channel_id,
          started_at: new Date().toISOString(),
          is_op_time: is_op,
        };
        if (callerTeamId) timeLogData.team_id = callerTeamId;
        await supabaseAdmin.from('time_logs').insert(timeLogData);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'move_user') {
      if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.system_role)) {
        return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์แอดมิน' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!target_user_id || !channel_id) {
        return new Response(JSON.stringify({ error: 'ต้องระบุ target_user_id และ channel_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get the target user's current presence
      const { data: targetPresence } = await supabaseAdmin
        .from('user_presence')
        .select('channel_id')
        .eq('user_id', target_user_id)
        .maybeSingle();

      if (!targetPresence) {
        return new Response(JSON.stringify({ error: 'ไม่พบผู้ใช้ออนไลน์' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const prevChannelId = targetPresence.channel_id;

      // Close existing time log
      await supabaseAdmin
        .from('time_logs')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', target_user_id)
        .is('ended_at', null);

      // Update channel
      await supabaseAdmin
        .from('user_presence')
        .update({ channel_id: channel_id, joined_channel_at: new Date().toISOString() })
        .eq('user_id', target_user_id);

      // Log channel change with team_id
      const logData: Record<string, unknown> = {
        user_id: target_user_id,
        from_channel_id: prevChannelId,
        to_channel_id: channel_id,
        changed_at: new Date().toISOString(),
      };
      if (callerTeamId) logData.team_id = callerTeamId;
      await supabaseAdmin.from('presence_logs').insert(logData);

      // Start time log if new channel tracks time
      const { data: ch } = await supabaseAdmin
        .from('channels')
        .select('track_time')
        .eq('id', channel_id)
        .maybeSingle();

      if (ch?.track_time) {
        const timeLogData: Record<string, unknown> = {
          user_id: target_user_id,
          channel_id: channel_id,
          started_at: new Date().toISOString(),
          is_op_time: false,
        };
        if (callerTeamId) timeLogData.team_id = callerTeamId;
        await supabaseAdmin.from('time_logs').insert(timeLogData);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'set_op_others') {
      if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.system_role)) {
        return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์แอดมิน' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!target_user_id || is_op === undefined) {
        return new Response(JSON.stringify({ error: 'ต้องระบุ target_user_id และ is_op' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Close existing time log for target
      await supabaseAdmin
        .from('time_logs')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', target_user_id)
        .is('ended_at', null);

      // Update is_op
      await supabaseAdmin
        .from('user_presence')
        .update({ is_op })
        .eq('user_id', target_user_id);

      // Restart time log with correct OP flag
      const { data: tp } = await supabaseAdmin
        .from('user_presence')
        .select('channel_id')
        .eq('user_id', target_user_id)
        .maybeSingle();

      if (tp) {
        const { data: ch } = await supabaseAdmin
          .from('channels')
          .select('track_time')
          .eq('id', tp.channel_id)
          .maybeSingle();

        if (ch?.track_time) {
          const timeLogData: Record<string, unknown> = {
            user_id: target_user_id,
            channel_id: tp.channel_id,
            started_at: new Date().toISOString(),
            is_op_time: is_op,
          };
          if (callerTeamId) timeLogData.team_id = callerTeamId;
          await supabaseAdmin.from('time_logs').insert(timeLogData);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
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
