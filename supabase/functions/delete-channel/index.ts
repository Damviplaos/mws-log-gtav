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

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('system_role')
      .eq('id', caller.id)
      .maybeSingle();

    let allowed = ['super_admin', 'admin'].includes(callerProfile.system_role);
    if (!allowed) {
      const { data: perms } = await supabaseAdmin.rpc('get_user_permissions', { p_user_id: caller.id });
      allowed = Array.isArray(perms) && perms.some((r: { permission: string }) => r.permission === 'manage_channels');
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์ manage_channels' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { channel_id } = await req.json();
    if (!channel_id) {
      return new Response(JSON.stringify({ error: 'ต้องระบุ channel_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find any other channel to migrate current users to
    const { data: otherChannels } = await supabaseAdmin
      .from('channels')
      .select('id')
      .neq('id', channel_id)
      .order('sort_order', { ascending: true })
      .limit(1);

    const fallbackChannelId = otherChannels?.[0]?.id ?? null;

    // 1. Nullify presence_logs references
    await supabaseAdmin
      .from('presence_logs')
      .update({ from_channel_id: null })
      .eq('from_channel_id', channel_id);
    await supabaseAdmin
      .from('presence_logs')
      .update({ to_channel_id: null })
      .eq('to_channel_id', channel_id);

    // 2. Delete time_logs for this channel (channel_id is NOT NULL, can't set null)
    await supabaseAdmin
      .from('time_logs')
      .delete()
      .eq('channel_id', channel_id);

    // 3. Move users to fallback, or remove them
    if (fallbackChannelId) {
      await supabaseAdmin
        .from('user_presence')
        .update({ channel_id: fallbackChannelId, joined_channel_at: new Date().toISOString() })
        .eq('channel_id', channel_id);
    } else {
      await supabaseAdmin
        .from('user_presence')
        .delete()
        .eq('channel_id', channel_id);
    }

    // 4. Delete the channel (ON DELETE CASCADE handles remaining user_presence)
    const { error: deleteError } = await supabaseAdmin
      .from('channels')
      .delete()
      .eq('id', channel_id);

    if (deleteError) {
      return new Response(JSON.stringify({ error: 'ลบห้องไม่สำเร็จ: ' + deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
