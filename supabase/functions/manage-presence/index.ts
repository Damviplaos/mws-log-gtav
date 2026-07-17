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

    const { action, channel_id, is_op, target_user_id, partner_user_id } = await req.json();

    if (action === 'join') {
      let targetChannelId = channel_id;
      if (!targetChannelId) {
        const { data: readyCh } = await supabaseAdmin
          .from('channels')
          .select('id')
          .eq('name', 'ready')
          .maybeSingle();
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

      const { data: newPresence, error: presenceError } = await supabaseAdmin
        .from('user_presence')
        .insert({
          user_id: user.id,
          channel_id: targetChannelId,
          joined_channel_at: new Date().toISOString(),
          session_started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          is_op: false,
        })
        .select()
        .maybeSingle();

      if (presenceError) {
        return new Response(JSON.stringify({ error: presenceError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (previousChannelId !== targetChannelId) {
        await supabaseAdmin.from('presence_logs').insert({
          user_id: user.id,
          from_channel_id: previousChannelId,
          to_channel_id: targetChannelId,
          changed_at: new Date().toISOString(),
        });
      }

      // Start time log if channel tracks time
      const { data: ch } = await supabaseAdmin
        .from('channels')
        .select('track_time')
        .eq('id', targetChannelId)
        .maybeSingle();

      if (ch?.track_time) {
        await supabaseAdmin.from('time_logs').insert({
          user_id: user.id,
          channel_id: targetChannelId,
          started_at: new Date().toISOString(),
          is_op_time: false,
        });
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

      let pointerQuery = supabaseAdmin
        .from('queue_pointer')
        .select('pointed_user_id')
        .eq('id', '00000000-0000-0000-0000-000000000001');
      const { data: pointer } = await pointerQuery.maybeSingle();

      await supabaseAdmin
        .from('user_presence')
        .delete()
        .eq('user_id', user.id);

      // Advance pointer if needed
      if (pointer?.pointed_user_id === user.id) {
        const { data: readyCh } = await supabaseAdmin
          .from('channels').select('id').eq('name', 'ready').maybeSingle();
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
      const { data: opChannel } = await supabaseAdmin.from('channels').select('id').eq('name', 'op').maybeSingle();

      // Find ready room channel
      const { data: readyChannel } = await supabaseAdmin.from('channels').select('id').eq('name', 'ready').maybeSingle();

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
        await supabaseAdmin.from('presence_logs').insert({
          user_id: user.id,
          from_channel_id: presence.channel_id,
          to_channel_id: newChannelId,
          changed_at: new Date().toISOString(),
        });
      }

      // Start new time log with correct is_op_time flag
      const { data: ch } = await supabaseAdmin
        .from('channels')
        .select('track_time')
        .eq('id', newChannelId)
        .maybeSingle();

      if (ch?.track_time) {
        await supabaseAdmin.from('time_logs').insert({
          user_id: user.id,
          channel_id: newChannelId,
          started_at: new Date().toISOString(),
          is_op_time: is_op,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'move_user') {
      // Original role-based check: only super_admin/admin
      const callerProfile = await supabaseAdmin
        .from('profiles')
        .select('system_role')
        .eq('id', user.id)
        .maybeSingle();

      if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.data?.system_role)) {
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

      // Log channel change
      await supabaseAdmin.from('presence_logs').insert({
        user_id: target_user_id,
        from_channel_id: prevChannelId,
        to_channel_id: channel_id,
        changed_at: new Date().toISOString(),
      });

      // Start time log if new channel tracks time
      const { data: ch } = await supabaseAdmin
        .from('channels')
        .select('track_time')
        .eq('id', channel_id)
        .maybeSingle();

      if (ch?.track_time) {
        await supabaseAdmin.from('time_logs').insert({
          user_id: target_user_id,
          channel_id: channel_id,
          started_at: new Date().toISOString(),
          is_op_time: false,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'set_op_others') {
      // Original role-based check: only super_admin/admin
      const callerProfile2 = await supabaseAdmin
        .from('profiles')
        .select('system_role')
        .eq('id', user.id)
        .maybeSingle();

      if (!callerProfile2 || !['super_admin', 'admin'].includes(callerProfile2.data?.system_role)) {
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

      // Get target's current presence
      const { data: targetPresence } = await supabaseAdmin
        .from('user_presence')
        .select('channel_id, is_op')
        .eq('user_id', target_user_id)
        .maybeSingle();

      // Find OP room and ready room
      const { data: opChannel } = await supabaseAdmin.from('channels').select('id').eq('name', 'op').maybeSingle();
      const { data: readyChannel } = await supabaseAdmin.from('channels').select('id').eq('name', 'ready').maybeSingle();

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
        await supabaseAdmin.from('presence_logs').insert({
          user_id: target_user_id,
          from_channel_id: targetPresence.channel_id,
          to_channel_id: newChannelId,
          changed_at: new Date().toISOString(),
        });
      }

      if (newChannelId) {
        const { data: ch } = await supabaseAdmin
          .from('channels')
          .select('track_time')
          .eq('id', newChannelId)
          .maybeSingle();

        if (ch?.track_time) {
          await supabaseAdmin.from('time_logs').insert({
            user_id: target_user_id,
            channel_id: newChannelId,
            started_at: new Date().toISOString(),
            is_op_time: is_op,
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Pairing actions (direct DB, no RPC needed) ─────────────────
    if (action === 'pair_users') {
      if (!partner_user_id) {
        return new Response(JSON.stringify({ error: 'ต้องระบุ partner_user_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabaseAdmin.from('user_presence').update({ paired_with_user_id: partner_user_id }).eq('user_id', user.id);
      await supabaseAdmin.from('user_presence').update({ paired_with_user_id: user.id }).eq('user_id', partner_user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'cancel_pair') {
      const { data: myPresence } = await supabaseAdmin
        .from('user_presence')
        .select('paired_with_user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const partnerId = myPresence?.paired_with_user_id;

      await supabaseAdmin.from('user_presence').update({ paired_with_user_id: null }).eq('user_id', user.id);
      if (partnerId) {
        await supabaseAdmin.from('user_presence').update({ paired_with_user_id: null }).eq('user_id', partnerId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin pairs two OTHER users together (not self)
    if (action === 'pair_users_admin') {
      const callerProfile = await supabaseAdmin
        .from('profiles')
        .select('system_role')
        .eq('id', user.id)
        .maybeSingle();

      if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.data?.system_role)) {
        return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์แอดมิน' }), {
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

      await supabaseAdmin.from('user_presence').update({ paired_with_user_id: partnerId }).eq('user_id', targetId);
      await supabaseAdmin.from('user_presence').update({ paired_with_user_id: targetId }).eq('user_id', partnerId);

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
