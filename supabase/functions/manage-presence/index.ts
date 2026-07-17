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

    // Helper: check if caller has a specific permission (super_admin/admin always pass)
    async function callerHasPermission(permissionKey: string): Promise<boolean> {
      if (!callerProfile) return false;
      if (['super_admin', 'admin'].includes(callerProfile.system_role)) return true;
      const { data } = await supabaseAdmin.rpc('get_user_permissions', { p_user_id: user.id });
      if (!Array.isArray(data)) return false;
      return data.some((r: { permission: string }) => r.permission === permissionKey);
    }

    const { action, channel_id, is_op, target_user_id, partner_user_id } = await req.json();

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

      // Find OP room channel
      let opQuery = supabaseAdmin.from('channels').select('id').eq('name', 'op');
      if (callerTeamId) opQuery = opQuery.eq('team_id', callerTeamId);
      const { data: opChannel } = await opQuery.maybeSingle();

      // Find ready room channel
      let readyQuery = supabaseAdmin.from('channels').select('id').eq('name', 'ready');
      if (callerTeamId) readyQuery = readyQuery.eq('team_id', callerTeamId);
      const { data: readyChannel } = await readyQuery.maybeSingle();

      // Close current open time log
      await supabaseAdmin
        .from('time_logs')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('ended_at', null);

      // Move user to appropriate channel based on OP status
      let newChannelId = presence.channel_id;
      if (is_op && opChannel) {
        // Becoming OP → move to OP room
        newChannelId = opChannel.id;
      } else if (!is_op && readyChannel) {
        // Leaving OP → move back to ready room
        newChannelId = readyChannel.id;
      }

      await supabaseAdmin
        .from('user_presence')
        .update({
          is_op,
          channel_id: newChannelId,
          joined_channel_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      // Log channel change if moved
      if (newChannelId !== presence.channel_id) {
        const logData: Record<string, unknown> = {
          user_id: user.id,
          from_channel_id: presence.channel_id,
          to_channel_id: newChannelId,
          changed_at: new Date().toISOString(),
        };
        if (callerTeamId) logData.team_id = callerTeamId;
        await supabaseAdmin.from('presence_logs').insert(logData);
      }

      // Start new time log with correct is_op_time flag
      const { data: ch } = await supabaseAdmin
        .from('channels')
        .select('track_time')
        .eq('id', newChannelId)
        .maybeSingle();

      if (ch?.track_time) {
        const timeLogData: Record<string, unknown> = {
          user_id: user.id,
          channel_id: newChannelId,
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
      if (!(await callerHasPermission('move_player'))) {
        return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์ move_player' }), {
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
      if (!(await callerHasPermission('set_op_others'))) {
        return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์ set_op_others' }), {
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

      // Get target's current presence
      const { data: targetPresence } = await supabaseAdmin
        .from('user_presence')
        .select('channel_id, is_op')
        .eq('user_id', target_user_id)
        .maybeSingle();

      // Find OP room and ready room
      let opQ = supabaseAdmin.from('channels').select('id').eq('name', 'op');
      if (callerTeamId) opQ = opQ.eq('team_id', callerTeamId);
      const { data: opChannel } = await opQ.maybeSingle();

      let readyQ = supabaseAdmin.from('channels').select('id').eq('name', 'ready');
      if (callerTeamId) readyQ = readyQ.eq('team_id', callerTeamId);
      const { data: readyChannel } = await readyQ.maybeSingle();

      // Close existing time log for target
      await supabaseAdmin
        .from('time_logs')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', target_user_id)
        .is('ended_at', null);

      // Determine new channel
      let newChannelId = targetPresence?.channel_id;
      if (is_op && opChannel) {
        newChannelId = opChannel.id;
      } else if (!is_op && readyChannel) {
        newChannelId = readyChannel.id;
      }

      // Update is_op and channel
      await supabaseAdmin
        .from('user_presence')
        .update({
          is_op,
          channel_id: newChannelId,
          joined_channel_at: new Date().toISOString(),
        })
        .eq('user_id', target_user_id);

      // Log channel change if moved
      if (targetPresence && newChannelId !== targetPresence.channel_id) {
        const logData: Record<string, unknown> = {
          user_id: target_user_id,
          from_channel_id: targetPresence.channel_id,
          to_channel_id: newChannelId,
          changed_at: new Date().toISOString(),
        };
        if (callerTeamId) logData.team_id = callerTeamId;
        await supabaseAdmin.from('presence_logs').insert(logData);
      }

      // Restart time log with correct OP flag
      if (newChannelId) {
        const { data: ch } = await supabaseAdmin
          .from('channels')
          .select('track_time')
          .eq('id', newChannelId)
          .maybeSingle();

        if (ch?.track_time) {
          const timeLogData: Record<string, unknown> = {
            user_id: target_user_id,
            channel_id: newChannelId,
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

    // ── Pairing actions ──────────────────────────────────────────────
    if (action === 'pair_users') {
      if (!partner_user_id) {
        return new Response(JSON.stringify({ error: 'ต้องระบุ partner_user_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Set pair on both users via RPC
      const { error: pairErr } = await supabaseAdmin.rpc('pair_users', {
        p_user_a: user.id,
        p_user_b: partner_user_id,
      });
      if (pairErr) {
        return new Response(JSON.stringify({ error: pairErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'cancel_pair') {
      const { error: cancelErr } = await supabaseAdmin.rpc('cancel_pair', {
        p_user_id: user.id,
      });
      if (cancelErr) {
        return new Response(JSON.stringify({ error: cancelErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin pairs two OTHER users together (not self)
    if (action === 'pair_users_admin') {
      if (!(await callerHasPermission('admin_pair_others'))) {
        return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์ admin_pair_others' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const targetId = target_user_id;
      const partnerId = partner_user_id;
      if (!targetId || !partnerId) {
        return new Response(JSON.stringify({ error: 'ต้องระบุ target_user_id และ partner_user_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: pairErr } = await supabaseAdmin.rpc('pair_users', {
        p_user_a: targetId,
        p_user_b: partnerId,
      });
      if (pairErr) {
        return new Response(JSON.stringify({ error: pairErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
